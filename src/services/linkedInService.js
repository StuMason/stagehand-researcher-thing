// services/linkedInService.js
import { debugLog } from '../utils/logger.js';

export class LinkedInService {
  constructor(stagehand) {
    this.stagehand = stagehand;
    this.isLoggedIn = false;
    this.cookiesAccepted = false;
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
      await this.stagehand.page.goto('https://www.linkedin.com/login');
      
      await this.handleCookieBanners();
      
      await this.stagehand.page.waitForSelector('input[name="session_key"]');
      await this.stagehand.page.fill('input[name="session_key"]', process.env.LINKEDIN_EMAIL);
      await this.stagehand.page.fill('input[name="session_password"]', process.env.LINKEDIN_PASSWORD);
      
      await Promise.all([
        this.stagehand.page.click('button[type="submit"]'),
        this.stagehand.page.waitForNavigation({ waitUntil: 'networkidle' })
      ]);
      
      const verifyLogin = await this.stagehand.page.evaluate(() => {
        return !document.querySelector('.login-form');
      });
      
      if (!verifyLogin) throw new Error('Login verification failed');

      this.isLoggedIn = true;
      
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
      let contactInfo = await this.stagehand.page.evaluate(() => {
        const findContactText = (elements) => {
          for (const el of elements) {
            const text = el.textContent.trim();
            if (text.includes('@') || 
                text.match(/[\+\d][\d\-\(\)\s]{8,}/) || 
                text.match(/t\.me\/|telegram\.me\//) || 
                text.includes('linkedin.com/in/')) {
              return text;
            }
          }
          return null;
        };

        const possibleElements = [
          ...document.querySelectorAll('.pv-contact-info *'),
          ...document.querySelectorAll('.pv-top-card *'),
          ...document.querySelectorAll('.about-section *'),
          ...document.querySelectorAll('[data-field="email"] *'),
          ...document.querySelectorAll('[data-field="phone"] *')
        ];

        return {
          found: findContactText(possibleElements) || null,
          hasContactButton: !!document.querySelector('button:has-text("Contact info")')
        };
      });

      if (contactInfo.found) {
        debugLog('linkedin:contact', 'Found contact info on main profile', { info: contactInfo.found });
        return { contact: contactInfo.found };
      }

      if (contactInfo.hasContactButton) {
        debugLog('linkedin:contact', 'Clicking contact info button');
        await this.stagehand.page.click('button:has-text("Contact info")');
        await this.stagehand.page.waitForSelector('.pv-contact-info');

        const modalInfo = await this.stagehand.page.evaluate(() => {
          const modal = document.querySelector('.pv-contact-info');
          if (!modal) return null;

          const extractSection = (section) => {
            const items = Array.from(section.querySelectorAll('*'))
              .map(el => el.textContent.trim())
              .filter(text => text.length > 0);
            return items.join(' ');
          };

          const sections = Array.from(modal.children).map(extractSection);
          return sections.join(' ');
        });

        try {
          await this.stagehand.page.click('button[aria-label="Dismiss"]');
        } catch (e) {
          // Modal might have closed automatically
        }

        if (modalInfo) {
          debugLog('linkedin:contact', 'Found contact info in modal', { info: modalInfo });
          return { contact: modalInfo };
        }
      }

      debugLog('linkedin:contact', 'No contact information found');
      return { contact: null };
    } catch (error) {
      debugLog('linkedin:contact-error', 'Error extracting contact info', { error: error.message });
      return { contact: null };
    }
  }

  async verifyProfile(targetPerson) {
    try {
      const profileInfo = await this.stagehand.page.evaluate(() => ({
        name: document.querySelector('h1')?.textContent?.trim() || '',
        headline: document.querySelector('.text-body-medium')?.textContent?.trim() || '',
        experience: Array.from(document.querySelectorAll('.experience-section li'))
          .map(exp => exp.textContent?.trim())
          .join(' ')
      }));

      let score = 0;
      
      if (profileInfo.name.toLowerCase() === targetPerson.name.toLowerCase()) {
        score += 40;
      }

      if (targetPerson.context && 
          (profileInfo.headline + profileInfo.experience)
            .toLowerCase()
            .includes(targetPerson.context.toLowerCase())) {
        score += 30;
      }

      if (targetPerson.interests) {
        const content = (profileInfo.headline + profileInfo.experience).toLowerCase();
        const matchedInterests = targetPerson.interests.filter(interest => 
          content.includes(interest.toLowerCase())
        );
        score += (matchedInterests.length / targetPerson.interests.length) * 30;
      }

      return {
        isMatch: score >= 60,
        confidence: score,
        info: profileInfo
      };
    } catch (error) {
      debugLog('linkedin:verify-error', 'Failed to verify profile', { error: error.message });
      throw error;
    }
  }

  async navigateToProfile(url, targetPerson) {
    await this.login();
    debugLog('linkedin:navigate', 'Navigating to LinkedIn profile', { url });
    
    await this.stagehand.page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await this.handleCookieBanners();
    await this.stagehand.page.waitForLoadState('networkidle');
    
    const isProfilePage = await this.stagehand.page.evaluate(() => {
      return window.location.href.includes('/in/');
    });
    
    if (!isProfilePage) {
      throw new Error('Failed to load profile page');
    }

    if (targetPerson) {
      const verification = await this.verifyProfile(targetPerson);
      if (!verification.isMatch) {
        throw new Error('Profile does not match target person');
      }
    }
    
    debugLog('linkedin:navigate', 'Successfully loaded LinkedIn profile');
  }
}