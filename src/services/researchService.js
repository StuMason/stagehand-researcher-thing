// src/services/conductResearch.js
import { LinkedInService } from "./linkedInService.js";
import { searchGoogle } from "./googleService.js";
import { makeGPTCall } from "./openaiService.js";
import { debugLog } from "../utils/logger.js";
import { setupDialogHandling } from "../utils/dialogHandler.js";
import { z } from "zod";

async function conductResearch(stagehand, profile) {
  debugLog("research:start", "Starting dynamic research process", { profile });
  // Set up dialog handling
  const clearDialogHandling = setupDialogHandling(stagehand.page);

  try {
    const linkedIn = new LinkedInService(stagehand);
    let searchResults = [];
    let discoveredInfo = [];
    let contactInformation = null;

    // 1. Dynamically generate search queries using the LLM
    const queryPrompt = `You are a research assistant. Given the following profile details:
    
Profile: ${JSON.stringify(profile)}
    
Generate a JSON array of 5 search queries that would help uncover professional information (LinkedIn profiles, contact details, news articles, bios, etc.) 
relevant to this individual and context.
(AND JUST A JSON, no BACKTICKS OR TEXT BEFORE OR AFTER THIS IS GOING THROUGH A JSON PARSER)
`;
    let queryResponse = await makeGPTCall([{ role: "user", content: queryPrompt }]);
    let searchQueries;
    try {
      searchQueries = JSON.parse(queryResponse);
    } catch (err) {
      debugLog("research:query-parse-error", "Error parsing LLM query response; using fallback queries", { error: err.message });
      searchQueries = [
        `${profile.name} ${profile.context}`,
        `${profile.name} ${profile.context} linkedin`,
        `${profile.name} ${profile.context} contact`,
        `${profile.name} ${profile.context} about`,
        `${profile.name} ${profile.context} news`
      ];
    }

    // 2. Execute the search queries
    for (const query of searchQueries) {
      try {
        const results = await searchGoogle(stagehand.page, query);
        searchResults.push(...results);
        // Wait a bit to prevent rate limiting
        await stagehand.page.waitForTimeout(1000);
      } catch (error) {
        debugLog("research:search-error", `Error searching for query: ${query}`, { error: error.message });
      }
    }

    // Remove duplicate URLs and sort results by relevance (e.g., prioritizing LinkedIn and name matches)
    searchResults = Array.from(new Set(searchResults.map(r => r.url)))
      .map(url => searchResults.find(r => r.url === url))
      .sort((a, b) => {
        const aScore = a.url.includes("linkedin.com") ? 2 :
                       (a.url.toLowerCase().includes(profile.name.toLowerCase().replace(" ", "")) ? 1 : 0);
        const bScore = b.url.includes("linkedin.com") ? 2 :
                       (b.url.toLowerCase().includes(profile.name.toLowerCase().replace(" ", "")) ? 1 : 0);
        return bScore - aScore;
      });

    // 3. Process each discovered link
    for (const result of searchResults) {
      if (discoveredInfo.length >= 5) break;
      try {
        if (result.url.includes("linkedin.com/in/")) {
          // Process LinkedIn profiles
          try {
            await linkedIn.navigateToProfile(result.url, profile);
            const contactInfo = await linkedIn.extractContactInfo();
            if (contactInfo && contactInfo.contact) {
              contactInformation = contactInfo.contact;
            }
          } catch (e) {
            debugLog("research:linkedin-error", "Error processing LinkedIn profile", { error: e.message });
            continue;
          }
        } else {
          // Process other pages
          await stagehand.page.goto(result.url, { timeout: 30000, waitUntil: "domcontentloaded" });
          const extractionInstruction = `Extract professional information about ${profile.name} with context "${profile.context}".
Include details such as current role, professional history, notable achievements, areas of expertise, and recent news.
Return the data as a JSON object with keys: content (string), confidence (number), and type (one of 'profile', 'news', 'achievement', 'general').
(AND JUST A JSON, no BACKTICKS OR TEXT BEFORE OR AFTER THIS IS GOING THROUGH A JSON PARSER)`;
          const pageInfo = await stagehand.page.extract({
            instruction: extractionInstruction,
            schema: z.object({
              content: z.string(),
              confidence: z.number(),
              type: z.enum(["profile", "news", "achievement", "general"])
            }),
            timeout: 45000
          });
          if (pageInfo?.content && pageInfo.confidence > 0.4) {
            discoveredInfo.push({
              source: result.url,
              content: pageInfo.content,
              type: pageInfo.type,
              confidence: pageInfo.confidence
            });
          }
          // Delay between visits
          await stagehand.page.waitForTimeout(1000);
        }
      } catch (error) {
        debugLog("research:explore-error", "Error processing link", {
          url: result.url,
          error: error.message
        });
        continue;
      }
    }

    // 4. Feedback loop: If the initial extraction yields low confidence or too few items, ask the LLM for additional queries
    if (discoveredInfo.length < 3) {
      const feedbackPrompt = `We have collected the following research findings:
${JSON.stringify(discoveredInfo)}
This information seems insufficient. Suggest additional search queries or modifications to extract more comprehensive and relevant professional data about ${profile.name} in the context "${profile.context}". 
Provide a JSON array of queries.
(AND JUST A JSON, no BACKTICKS OR TEXT BEFORE OR AFTER THIS IS GOING THROUGH A JSON PARSER)`;
      let feedbackResponse = await makeGPTCall([{ role: "user", content: feedbackPrompt }]);
      let additionalQueries;
      try {
        additionalQueries = JSON.parse(feedbackResponse);
      } catch (err) {
        debugLog("research:feedback-parse-error", "Error parsing feedback response; using fallback queries", { error: err.message });
        additionalQueries = [
          `${profile.name} ${profile.context} detailed bio`,
          `${profile.name} professional achievements`
        ];
      }

      for (const query of additionalQueries) {
        try {
          const results = await searchGoogle(stagehand.page, query);
          searchResults.push(...results);
          await stagehand.page.waitForTimeout(1000);
        } catch (error) {
          debugLog("research:search-error", `Error searching additional query: ${query}`, { error: error.message });
        }
      }
      // Process additional results similarly
      for (const result of searchResults) {
        if (discoveredInfo.length >= 5) break;
        try {
          if (result.url.includes("linkedin.com/in/")) {
            await linkedIn.navigateToProfile(result.url, profile);
            const contactInfo = await linkedIn.extractContactInfo();
            if (contactInfo && contactInfo.contact) {
              contactInformation = contactInfo.contact;
            }
          } else {
            await stagehand.page.goto(result.url, { timeout: 30000, waitUntil: "domcontentloaded" });
            const extractionInstruction = `Extract professional information about ${profile.name} with context "${profile.context}".
Include details like current role, professional history, achievements, expertise, and recent news.`;
            const pageInfo = await stagehand.page.extract({
              instruction: extractionInstruction,
              schema: z.object({
                content: z.string(),
                confidence: z.number(),
                type: z.enum(["profile", "news", "achievement", "general"])
              }),
              timeout: 45000
            });
            if (pageInfo?.content && pageInfo.confidence > 0.4) {
              discoveredInfo.push({
                source: result.url,
                content: pageInfo.content,
                type: pageInfo.type,
                confidence: pageInfo.confidence
              });
            }
            await stagehand.page.waitForTimeout(1000);
          }
        } catch (error) {
          debugLog("research:explore-error", "Error processing additional link", {
            url: result.url,
            error: error.message
          });
          continue;
        }
      }
    }

    // 5. Synthesize a final professional bio using the aggregated research
    const synthesisPrompt = `Based on the following research findings:
${JSON.stringify(discoveredInfo.slice(0, 10), null, 2)}

Create a professional bio for ${profile.name} that includes:
1. A concise personal summary (2-3 paragraphs)
2. Current role and professional focus
3. Key achievements and experience
4. Areas of expertise
5. Recent activities or news

Format your answer as a JSON object with the keys:
- bio (string)
- currentRole (string)
- expertise (array of strings)
- achievements (array of strings)
- recentActivity (string)
- keyPoints (array of strings)

Ensure that all information clearly relates to ${profile.context}.`;
    const synthesisResponse = await makeGPTCall([{ role: "user", content: synthesisPrompt }]);
    const finalBio = JSON.parse(synthesisResponse);

    return {
      profile: finalBio,
      contactInfo: {
        email: contactInformation?.email || null,
        phone: contactInformation?.phone || null,
        social: contactInformation?.social || []
      },
      sources: Array.from(new Set(discoveredInfo.map(info => info.source))),
      confidence: discoveredInfo.reduce((acc, info) => acc + info.confidence, 0) / discoveredInfo.length || 0.5
    };

  } finally {
    // Clean up dialog handling
    clearDialogHandling();
  }
}

export default conductResearch;
