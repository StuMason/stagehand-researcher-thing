// src/services/linkedInService.js
import { debugLog } from '../utils/logger.js';
import { z } from 'zod';

export class LinkedInService {
  constructor(stagehand) {
    this.stagehand = stagehand;
    this.isLoggedIn = false;
    this.cookiesAccepted = false;
  }

  async waitForNavigationSafely(timeoutMs = 30000) {
    try {
      await Promise.race([
        this.stagehand.page.waitForLoadState('networkidle', { timeout: timeoutMs }),
        new Promise(resolve => setTimeout(resolve, timeoutMs))
      ]);
    } catch (error) {
      debugLog('linkedin:navigation', 'Navigation timeout - continuing anyway', {
        error: error.message
      });
    }
  }

  async handleCookieBanners() {
    if (this.cookiesAccepted) return;
    
    const selectors = [
      'button[action-type="ACCEPT_COOKIES"]',
      '#cookie-policy-banner button[type="submit"]',
      'button:has-text("Accept All Cookies")',
      'button:has-text("Accept")',
      '[aria-label="Accept cookies"]',
      '.cookie-banner button:has-text("Accept")'
    ];

    for (const selector of selectors) {
      try {
        await this.stagehand.page.click(selector, { timeout: 2000 });
        this.cookiesAccepted = true;
        debugLog('linkedin:cookies', 'Accepted cookies banner');
        break;
      } catch (e) {
        continue;
      }
    }
  }

  async login() {
    if (this.isLoggedIn) return;

    try {
      debugLog('linkedin:login', 'Attempting LinkedIn login');
      await this.stagehand.page.goto('https://www.linkedin.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      await this.waitForNavigationSafely();
      await this.handleCookieBanners();
      
      // Wait for login form
      await this.stagehand.page.waitForSelector('input[name="session_key"]', { timeout: 10000 });
      
      // Fill login form
      await this.stagehand.page.fill('input[name="session_key"]', process.env.LINKEDIN_EMAIL);
      await this.stagehand.page.fill('input[name="session_password"]', process.env.LINKEDIN_PASSWORD);
      
      // Submit and wait for navigation
      await Promise.all([
        this.stagehand.page.click('button[type="submit"]'),
        this.stagehand.page.waitForNavigation({ waitUntil: 'domcontentloaded' })
      ]);

      await this.waitForNavigationSafely();
      
      // Verify login
      const isLoggedIn = await this.stagehand.page.evaluate(() => {
        return !document.querySelector('.login-form');
      }).catch(() => false);
      
      if (!isLoggedIn) {
        throw new Error('Login verification failed');
      }

      this.isLoggedIn = true;
      
      // Handle skip button if present
      try {
        await this.stagehand.page.click('button:has-text("Skip")', { timeout: 5000 });
      } catch (e) {
        // Ignore if prompt doesn't appear
      }

      debugLog('linkedin:login', 'LinkedIn login successful');
    } catch (error) {
      debugLog('linkedin:login-error', 'LinkedIn login failed', { error: error.message });
      throw error;
    }
  }

  async extractContactInfo() {
    try {
      await this.waitForNavigationSafely();

      const contactInfo = await this.stagehand.page.extract({
        instruction: "Extract the person's contact information including email, phone, social media links, and other contact methods",
        schema: z.object({
          email: z.string().nullable(),
          phone: z.string().nullable(),
          social: z.array(z.string()).default([]),
          other: z.string().nullable()
        })
      });

      debugLog('linkedin:contact', 'Extracted contact information', { info: contactInfo });
      return { contact: contactInfo };

    } catch (error) {
      debugLog('linkedin:contact-error', 'Error extracting contact info', { error: error.message });
      return { contact: null };
    }
  }

  async navigateToProfile(url, targetPerson) {
    try {
      await this.login();
      debugLog('linkedin:navigate', 'Navigating to LinkedIn profile', { url });
      
      // Clean up the URL to ensure it's a proper LinkedIn profile URL
      const profileUrl = url.split('?')[0]; // Remove query parameters
      
      await this.stagehand.page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      await this.waitForNavigationSafely();
      await this.handleCookieBanners();
      
      // Verify we're on a profile page
      const isProfilePage = await this.stagehand.page.evaluate(() => {
        return window.location.href.includes('/in/');
      }).catch(() => false);
      
      if (!isProfilePage) {
        throw new Error('Failed to load profile page');
      }

      // Extract profile information for verification
      const profileInfo = await this.stagehand.page.extract({
        instruction: `Extract basic profile information to verify this is ${targetPerson.name}'s profile`,
        schema: z.object({
          name: z.string(),
          headline: z.string().nullable(),
          summary: z.string().nullable()
        })
      });

      // Simple name matching
      const namesMatch = profileInfo.name.toLowerCase().includes(targetPerson.name.toLowerCase()) ||
                        targetPerson.name.toLowerCase().includes(profileInfo.name.toLowerCase());

      if (!namesMatch) {
        throw new Error('Profile does not match target person');
      }
      
      debugLog('linkedin:navigate', 'Successfully loaded LinkedIn profile');
      return true;

    } catch (error) {
      debugLog('linkedin:navigate-error', 'Failed to navigate to profile', { 
        error: error.message,
        url 
      });
      throw error;
    }
  }
}