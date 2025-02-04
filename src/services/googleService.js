// services/googleService.js
import { debugLog } from '../utils/logger.js';

export async function searchGoogle(page, query) {
  debugLog('google:search', `Searching Google`, { query });
  
  try {
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    await page.waitForLoadState('networkidle');
    
    // Handle potential cookie consent
    try {
      await page.click('button:has-text("Accept all")');
      await page.waitForLoadState('networkidle');
    } catch (e) {
      // Cookie consent might not appear
    }
    
    // Extract search results
    const results = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('div.g a[href]'));
      return links.map(link => ({
        url: link.href,
        title: link.querySelector('h3') ? link.querySelector('h3').textContent : '',
        snippet: link.closest('div.g')?.querySelector('div.VwiC3b')?.textContent || ''
      })).filter(result => 
        result.url && 
        !result.url.includes('google.com') &&
        !result.url.includes('cached') &&
        !result.url.includes('similar') &&
        !result.url.includes('webcache.googleusercontent.com')
      );
    });
    
    debugLog('google:results', `Found search results`, { 
      count: results.length,
      firstResult: results[0]
    });

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return results;
  } catch (error) {
    debugLog('google:error', 'Error performing Google search', { 
      error: error.message,
      query 
    });
    throw new Error(`Google search failed: ${error.message}`);
  }
}

export async function searchGoogleWithRetry(page, query, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await searchGoogle(page, query);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      debugLog('google:retry', `Retrying search after error`, { 
        attempt,
        error: error.message
      });
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}