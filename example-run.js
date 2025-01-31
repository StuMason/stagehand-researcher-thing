// example-usage.js
import { Stagehand } from "@browserbasehq/stagehand";
import { StagehandConfig } from './config/index.js';
import { LinkedInService } from './services/linkedInService.js';
import { searchGoogleWithRetry } from './services/googleService.js';
import { makeGPTCall, promptTemplates } from './services/openaiService.js';
import { debugLog } from './utils/index.js';

async function runExample() {
  // Initialize Stagehand
  const stagehand = new Stagehand(StagehandConfig);
  await stagehand.init();

  try {
    // Example profile to research
    const profile = {
      name: "Emi Laughton",
      context: "Head of Marketing",
      interests: ["brand strategy"]
    };

    // 1. Start with Google search
    console.log("Starting Google search...");
    const searchQuery = `${profile.name} ${profile.context} linkedin`;
    const searchResults = await searchGoogleWithRetry(stagehand.page, searchQuery);
    
    // Find LinkedIn profile URL from search results
    const linkedInUrl = searchResults.find(result => 
      result.url.includes('linkedin.com/in/'))?.url;

    if (linkedInUrl) {
      // 2. Initialize LinkedIn service and navigate to profile
      console.log("LinkedIn profile found, extracting information...");
      const linkedIn = new LinkedInService(stagehand);
      
      try {
        await linkedIn.navigateToProfile(linkedInUrl, profile);
        
        // 3. Extract contact information
        const contactInfo = await linkedIn.extractContactInfo();
        console.log("Contact information:", contactInfo);

        // 4. Use GPT to analyze findings
        const research = {
          linkedInProfile: linkedInUrl,
          contactInfo: contactInfo.contact,
          searchResults: searchResults
        };

        const analysis = await makeGPTCall([{
          role: "user",
          content: promptTemplates.synthesizeFindings(research, contactInfo.contact)
        }]);

        console.log("\nResearch Analysis:");
        console.log(analysis);

      } catch (error) {
        if (error.message === 'Profile does not match target person') {
          console.log("Found LinkedIn profile was not the correct person");
        } else {
          throw error;
        }
      }
    } else {
      console.log("No LinkedIn profile found in search results");
    }

  } catch (error) {
    console.error("Error during research:", error);
  } finally {
    await stagehand.close();
  }
}

// Run the example
runExample().catch(console.error);