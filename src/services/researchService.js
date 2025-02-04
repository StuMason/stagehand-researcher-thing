// services/researchService.js
import { debugLog } from "../utils/logger.js";
import { LinkedInService } from "./linkedInService.js";
import { searchGoogle } from "./googleService.js";
import { makeGPTCall } from "./openaiService.js";
import { parseAction } from "../utils/index.js";

export async function conductResearch(stagehand, profile) {
  debugLog("research:start", "Starting research process", { profile });
  const linkedIn = new LinkedInService(stagehand);
  let searchResults = [];
  let contactInformation = null;
  let exploredPages = new Set();
  let discoveredInfo = [];

  // Initialize with broad search
  const searchQueries = [
    `${profile.name} ${profile.context}`,
    `${profile.name} portfolio`,
    `${profile.name} projects`,
    `${profile.name} blog`,
    `${profile.name} achievements`
  ];

  for (const query of searchQueries) {
    const results = await searchGoogle(stagehand.page, query);
    searchResults.push(...results);
  }

  // Deduplicate search results
  searchResults = Array.from(new Set(searchResults.map(r => r.url))).map(url => 
    searchResults.find(r => r.url === url)
  );

  debugLog("research:links", "Found initial links", { 
    count: searchResults.length,
    urls: searchResults.map(r => r.url)
  });

  // Explore each discovered link
  for (const result of searchResults) {
    if (exploredPages.has(result.url)) continue;
    
    try {
      debugLog("research:explore", "Exploring link", { url: result.url });
      
      if (result.url.includes('linkedin.com')) {
        try {
          await linkedIn.navigateToProfile(result.url, profile);
          const contactInfo = await linkedIn.extractContactInfo();
          if (contactInfo.contact) {
            contactInformation = contactInfo.contact;
          }
        } catch (e) {
          debugLog("research:linkedin-skip", "Skipping LinkedIn profile", { error: e.message });
          continue;
        }
      } else {
        await stagehand.page.goto(result.url, { 
          waitUntil: 'networkidle',
          timeout: 30000
        });

        // Extract relevant information from the page
        const pageInfo = await stagehand.page.extract({
          instruction: `Extract professional information about ${profile.name} including:
            - Current and past roles
            - Projects and achievements
            - Skills and expertise
            - Writing style and personality traits
            - Professional interests
            Only extract information that clearly relates to ${profile.name}`,
          schema: z.object({
            content: z.string(),
            confidence: z.number()
          }),
          useTextExtract: true
        });

        if (pageInfo?.content && pageInfo.confidence > 0.6) {
          discoveredInfo.push({
            source: result.url,
            content: pageInfo.content,
            confidence: pageInfo.confidence
          });
        }
      }

      exploredPages.add(result.url);
      
    } catch (error) {
      debugLog("research:explore-error", "Error exploring link", { 
        url: result.url,
        error: error.message
      });
      continue;
    }
  }

  // Synthesize discovered information into a biography
  const synthesisPrompt = `Based on these research findings:
  ${JSON.stringify(discoveredInfo, null, 2)}

  Create a well-written, professional biography for a recruitment context. The bio should:
  1. Start with a compelling personal summary
  2. Highlight key professional achievements and experience
  3. Showcase their unique skills and expertise
  4. Include relevant personal touches that make them stand out
  5. End with their current focus and interests
  
  Write in a warm, professional tone that would make the person feel understood and appreciated.
  Focus on what makes them unique and interesting to talk to.
  Include specific details and examples where available.
  
  Structure the response as a JSON object with:
  - bio: The main biography text
  - keyPoints: Array of notable talking points for outreach
  - personalTouches: Array of personal interests or unique aspects
  - currentFocus: Their current professional focus
  - suggestedApproach: How to best approach them based on their online presence`;

  const synthesis = await makeGPTCall([{ 
    role: "user", 
    content: synthesisPrompt 
  }], 0.7);

  return {
    profile: JSON.parse(synthesis),
    contactInfo: {
      email: contactInformation?.email || null,
      phone: contactInformation?.phone || null,
      social: contactInformation?.social || []
    },
    sources: Array.from(exploredPages),
    confidence: discoveredInfo.reduce((acc, info) => acc + info.confidence, 0) / discoveredInfo.length || 0.5
  };
}