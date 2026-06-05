import * as fs from 'fs/promises';
import * as path from 'path';
import type { BrowserContext } from 'playwright';
import {chromium} from 'playwright';
import logger from '../utils/logger';

// const COOKIES_DIR = path.join(process.cwd(), '.sessions');
// const COOKIES_FILE = (site: string) => path.join(COOKIES_DIR, `${site}-cookies.json`);

const SESSION_PATH = path.join(process.cwd(), 'src/data/session.json');
/**
 * SessionSaver — handles saving and loading cookies from file
 * 
 * Flow:
 *   1. Try to load existing cookies
 *   2. If none exist, return null → scraper shows login page
 *   3. After you login manually, scraper calls saveCookies()
 *   4. Next run, cookies auto-load → already logged in!
 */

// export class SessionSaver {
//   /**
//    * Load cookies from disk for a specific site
//    * Returns null if no saved session exists
//    */
//   static async loadCookies(site: string) {
//     try {
//       const filePath = COOKIES_FILE(site);
//       const exists = await fs.stat(filePath).catch(() => null);
      
//       if (!exists) {
//         logger.info(`No saved session for ${site} — you'll need to login manually`);
//         return null;
//       }

//       const data = await fs.readFile(filePath, 'utf-8');
//       const cookies = JSON.parse(data);
//       logger.success(`Loaded saved session for ${site} ✓`);
//       return cookies;

//     } catch (err) {
//       logger.warn(`Could not load session for ${site}: ${(err as Error).message}`);
//       return null;
//     }
//   }

//   /**
//    * Save cookies to disk after you login manually
//    * Call this AFTER you've logged in and the page is ready
//    */
//   static async saveCookies(context: BrowserContext, site: string) {
//     try {
//       // Create .sessions folder if it doesn't exist
//       await fs.mkdir(COOKIES_DIR, { recursive: true });

//       // Extract all cookies from the browser context
//       const cookies = await context.cookies();
//       const filePath = COOKIES_FILE(site);

//       // Write to file
//       await fs.writeFile(filePath, JSON.stringify(cookies, null, 2));
//       logger.success(`✓ Saved session for ${site} to ${filePath}`);

//     } catch (err) {
//       logger.error(`Failed to save session: ${(err as Error).message}`);
//     }
//   }

//   /**
//    * Delete saved cookies (useful for logging out or testing)
//    */
//   static async clearCookies(site: string) {
//     try {
//       const filePath = COOKIES_FILE(site);
//       await fs.unlink(filePath);
//       logger.info(`Cleared session for ${site}`);
//     } catch (err) {
//       logger.warn(`Could not clear session: ${(err as Error).message}`);
//     }
//   }

//   /**
//    * Check if a saved session exists (without loading it)
//    */
//   static async hasSavedSession(site: string): Promise<boolean> {
//     try {
//       await fs.stat(COOKIES_FILE(site));
//       return true;
//     } catch {
//       return false;
//     }
//   }
// }


async function saveSession(): Promise<void> {
  logger.step('Opening browser — log in to Internshala manually...');
  logger.info('Script will wait until you are fully logged in.\n');
 
  // headless:false → real visible browser window
  // You see it, you control it, you log in yourself
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-service-autorun',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-features=InterestFeedContentSuggestions',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--password-store=basic',
      '--use-mock-volume-for-device-tests',
    ],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    viewport: { width: 1280, height: 720 },
  });
  const page    = await context.newPage();

  // Override navigator properties to hide automation
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    // (window as {chrome?: {runtime: Record<string, unknown>}}).chrome = { runtime: {} };
    window.chrome = { runtime: {} };
  });
 
  // Open internshala login page
  await page.goto('https://internshala.com/login');
 
  // Wait until you're logged in
  // We detect this by waiting for the dashboard/home element that only appears after login
  // This just sits and waits — no timeout, however long you need
  logger.step('Waiting for you to log in...');
  await page.waitForURL('**/student/dashboard**', { timeout: 120000 });
 
  // You're logged in — save the session
  const cookies     = await context.cookies();
  const localStorage = await page.evaluate(() => JSON.stringify(window.localStorage));
 
  const session = { cookies, localStorage };
  await fs.writeFile(SESSION_PATH, JSON.stringify(session, null, 2));
 
  logger.step(`\nSession saved to ${SESSION_PATH}`);
  logger.info('You never need to run this again unless you get logged out.');
 
  await browser.close();
}
 
saveSession().catch(err => {
  logger.error('Failed:', err.message);
  process.exit(1);
});