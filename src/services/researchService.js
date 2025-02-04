// services/researchService.js
import { debugLog } from "../utils/logger.js";
import { LinkedInService } from "./linkedInService.js";
import { searchGoogle } from "./googleService.js";
import { makeGPTCall } from "./openaiService.js";
import { parseAction } from "../utils/index.js";
import { z } from "zod";

export async function conductResearch(stagehand, profile) {
  debugLog("research:start", "Starting research process", { profile });
  const linkedIn = new LinkedInService(stagehand);
  let searchResults = [];
  let contactInformation = null;

  const planningPrompt = `You are an advanced research assistant with access to a web browser.
You can search Google, navigate websites, and extract information.

Your goal is to research this person:
${JSON.stringify(profile, null, 2)}

You can use these commands:
- SEARCH: [query] - Search Google with this query
- NAVIGATE: [url] - Visit a webpage
- EXTRACT: [instruction] - Extract specific information
- OBSERVE: [instruction] - Analyze the current page
- CONCLUDE - End research when sufficient information is gathered

Start by planning some Google searches about this person. Consider:
1. Their name combined with their professional context
2. Their name with potential employers or organizations
3. Their name with terms like "LinkedIn", "contact info", "email", "blog", "speaker", etc.
4. Their name with any known interests or specialties

What's your research plan?`;

  debugLog("research:prompt", "Sending planning prompt to GPT", {
    prompt: planningPrompt,
  });
  const researchPlan = await makeGPTCall(
    [{ role: "user", content: planningPrompt }],
    0.5
  );
  let researchResults = { plan: researchPlan, findings: [] };

  try {
    let iteration = 0;
    const MAX_ITERATIONS = 15;
    let currentUrl = null;
    let navigationFailures = 0;

    while (iteration < MAX_ITERATIONS && navigationFailures < 3) {
      debugLog("research:iteration", `Starting iteration ${iteration}`, {
        currentUrl,
        findingsCount: researchResults.findings.length,
        navigationFailures,
        searchResultsCount: searchResults.length,
        contactFound: !!contactInformation,
      });

      const executionPrompt = `Given these research results so far:
${JSON.stringify(researchResults, null, 2)}

${
  searchResults.length > 0
    ? `Recent search results:
${JSON.stringify(searchResults.slice(-5), null, 2)}`
    : ""
}

What should we look into next? Use one of these commands:
- SEARCH: [query] - Search Google with this query
- NAVIGATE: [url] - Visit a webpage
- EXTRACT: [instruction] - Extract specific information
- OBSERVE: [instruction] - Analyze the current page
- CONCLUDE - End research when sufficient information is gathered

Current URL: ${currentUrl}
Contact Information Found: ${contactInformation ? "Yes" : "No"}

IMPORTANT NOTES:
- Prioritize finding contact information if not yet found
- Be creative with search queries to find different kinds of information
- If a URL navigation failed, try a different approach
- For LinkedIn profiles, we can access them (credentials are handled)
- After 3 failed navigation attempts, consider a different strategy
- Focus on finding diverse sources of information

What would you like to do?`;

      const decision = await makeGPTCall(
        [{ role: "user", content: executionPrompt }],
        0.3
      );
      const action = parseAction(decision);

      if (!action) {
        debugLog(
          "research:warning",
          "Failed to parse action, skipping iteration",
          { decision }
        );
        continue;
      }

      if (action.type === "conclude" && !contactInformation) {
        debugLog(
          "research:continue",
          "Cannot conclude without contact information"
        );
        continue;
      }

      if (action.type === "conclude") {
        debugLog("research:conclude", "GPT decided to conclude research");
        break;
      }

      try {
        let result;
        switch (action.type) {
          case "search":
            debugLog("research:search", "Performing Google search", {
              query: action.query,
            });
            searchResults = await searchGoogle(stagehand.page, action.query);
            result = {
              status: "searched",
              query: action.query,
              results: searchResults,
            };
            break;

          case "navigate":
            result = await handleNavigation(
              stagehand,
              linkedIn,
              action,
              profile,
              currentUrl,
              contactInformation
            );
            if (result.contactInfo) {
              contactInformation = result.contactInfo;
            }
            if (result.status === "failed") {
              navigationFailures++;
            }
            break;

          case "extract":
            result = await handleExtraction(stagehand, action);
            break;

          case "observe":
            debugLog("research:observe", "Observing page", {
              instruction: action.instruction,
            });
            result = await stagehand.page.observe({
              instruction: action.instruction,
            });
            debugLog("research:observe-success", "Successfully observed page", {
              result,
            });
            break;
        }

        researchResults.findings.push({
          iteration,
          action: decision,
          result,
        });
      } catch (error) {
        debugLog("research:action-error", "Error executing action", {
          error: error.message,
          stack: error.stack,
          action,
        });
        researchResults.findings.push({
          iteration,
          action: decision,
          error: error.message,
        });
      }

      iteration++;
    }

    const synthesis = await synthesizeResearch(
      researchResults,
      contactInformation
    );

    return {
      profile: synthesis,
      rawResearch: researchResults,
      contactInformation,
    };
  } catch (error) {
    debugLog("research:error", "Fatal error in research process", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function handleNavigation(
  stagehand,
  linkedIn,
  action,
  profile,
  currentUrl,
  contactInformation
) {
  debugLog("research:navigate", `Attempting to navigate to URL`, {
    url: action.url,
  });
  try {
    if (action.url.includes("linkedin.com")) {
      try {
        await withRetry(() =>  linkedIn.navigateToProfile(action.url, profile));
        const contactInfo = await linkedIn.extractContactInfo();
        return {
          status: "navigated",
          url: action.url,
          contactInfo: contactInfo.contact,
        };
      } catch (error) {
        if (error.message === "Profile does not match target person") {
          debugLog("research:skip", "Skipping non-matching profile", {
            url: action.url,
          });
          return {
            status: "skipped",
            url: action.url,
            reason: "Profile does not match target person",
          };
        }
        throw error;
      }
    } else {
      await stagehand.page.goto(action.url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      return { status: "navigated", url: action.url };
    }
  } catch (error) {
    debugLog("research:navigate-error", "Navigation failed", {
      url: action.url,
      error: error.message,
    });
    return {
      status: "failed",
      url: action.url,
      error: error.message,
    };
  }
}

async function handleExtraction(stagehand, action) {
  debugLog("research:extract", "Extracting information", {
    instruction: action.instruction,
  });
  const result = await stagehand.page.extract({
    instruction: action.instruction,
    schema: z.object({
      result: z.string(),
    }),
  });
  debugLog("research:extract-success", "Successfully extracted information", {
    result,
  });
  return result;
}

async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}

async function synthesizeResearch(researchResults, contactInformation) {
  const synthesisPrompt = `Based on all our research:
    ${JSON.stringify(researchResults, null, 2)}
    
    Create a comprehensive profile for this person. Structure it as follows:
    
    ---CONTACT INFORMATION---
    ${contactInformation ? "Found Contact Methods:" : "Best Ways to Reach:"}
    ${
      contactInformation ||
      "No direct contact information found. List available communication channels."
    }
    
    ---PROFESSIONAL PROFILE---
    1. Key findings and insights
    2. Professional background
    3. Interests and activities
    4. Notable achievements or contributions
    5. Sources for each piece of information
    6. Research coverage and gaps
    
    Important Notes:
    - Place ALL contact information at the very top of the profile
    - If certain sources were inaccessible, acknowledge this
    - Focus on successfully retrieved information
    - Maintain a professional tone
    - Include patterns or insights from different sources
    - Note potential areas for further research
    
    Format it in a natural, readable way using Markdown, ensuring contact information is prominently displayed first.`;

  return await makeGPTCall([{ role: "user", content: synthesisPrompt }], 0.7);
}
