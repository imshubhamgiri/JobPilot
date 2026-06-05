import { chromium } from 'playwright';
import type { Job } from '../../types';
import logger from '../../utils/logger';

// ─── URL Builder ──────────────────────────────────────────────
// Internshala's search URL pattern:
// /internships/node-js-internship
// /internships/backend-development-internship
// We just convert the keyword to their format

function buildUrl(keyword: string): string {
  const slug = keyword
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')   // "node js" → "node-js"
    .replace(/\./g, '-');    // "node.js" → "node-js"

  return `https://internshala.com/internships/${slug}-internship`;
}

// ─── Main Scraper ─────────────────────────────────────────────
export async function scrapeInternshala(keywords: string[]): Promise<Job[]> {
  // Launch browser — headless:true means no visible window
  // Set headless:false temporarily if you want to WATCH it work (great for debugging)
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    // Why? Sites detect bots by user agent. This makes us look like a real Chrome browser.
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://internshala.com/',
    },
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata', // Internshala is an Indian site — help it think you're local
  });
  const page = await context.newPage();

  // Add more stealth — hide webdriver indicators
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  const allJobs: Job[] = [];

  // Loop through each keyword separately
  // Why separately? Each keyword hits a different URL on Internshala
  for (const keyword of keywords) {
    const url = buildUrl(keyword);
    logger.info(`Scraping: ${url}`);

    try {
      // GO — navigate to the page
      // waitUntil: 'domcontentloaded' is faster than 'networkidle' (stops waiting once DOM is ready)
      // Internshala might have background requests that never settle with networkidle
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // EXTRA WAIT — give JS time to render job cards
      // Add a small delay to let React/Vue/Angular finish rendering
      await page.waitForTimeout(2000);

      // WAIT — make sure job cards actually exist on the page
      // If no jobs found for this keyword, this will throw — caught below
      await page.waitForSelector('.individual_internship', { timeout: 10000 });

      // READ — extract data from all job cards on this page
      // $$eval = run this function inside the browser on ALL matching elements
      const jobs = await page.$$eval('.individual_internship', (cards) => {
        // ⚠️ Everything inside this arrow function runs IN THE BROWSER
        // You cannot use Node.js things here (no logger, no imports)
        // You CAN use normal DOM methods

        return cards.map(card => {
          // Read internship ID directly from the HTML attribute
          const id = card.getAttribute('internshipid') || '';

          // querySelector finds the FIRST matching element inside this card
          const title    = card.querySelector('.job-internship-name a')?.textContent?.trim() || '';
          const company  = card.querySelector('.company-name')?.textContent?.trim() || '';
          const isExclusive = !!card.querySelector('.pro_exclusive_tag'); // Exclusive internships have a special badge
          const location = card.querySelector('.locations a')?.textContent?.trim() || 'Remote';
          const stipend  = card.querySelector('.stipend')?.textContent?.trim() || 'Unpaid';
          const about    = card.querySelector('.about_job .text')?.textContent?.trim() || '';

          // Duration is trickier — no unique class, grab all row-1-items and find the calendar one
          const durationEl = card.querySelector('.ic-16-calendar')?.closest('.row-1-item');
          const duration   = durationEl?.querySelector('span')?.textContent?.trim() || '';

          // Grab ALL skill tags and join them into one string
          const skillEls = card.querySelectorAll('.job_skill');
          const skills   = Array.from(skillEls).map(s => s.textContent?.trim() || '').join(', ');

          // Build the apply link from the href on the job title
          const relativeHref = card.querySelector('a.job-title-href')?.getAttribute('href') || '';
          const applyLink    = relativeHref ? `https://internshala.com${relativeHref}` : '';

          // Description = about text + skills (gives matcher more text to score against)
          const description = `${about} Skills: ${skills}`;

          return { id, title, company, location, stipend, duration, description, applyLink, isExclusive };
        });
      });

      // Back in Node.js now — shape the raw data into our Job type
      const shaped: Job[] = jobs
        .filter(j => j.title && j.company && j.applyLink) // skip incomplete cards
        .map(j => ({
          id:          j.id,
          title:       j.title,
          company:     j.company,
          description: j.description,
          location:    j.location,
          applyLink:   j.applyLink,
          source:      'internshala' as const,
          stipend:     j.stipend,
          duration:    j.duration,
          postedAt:    new Date(),
          isExclusive: j.isExclusive,
        }));

      logger.success(`  Found ${shaped.length} jobs for "${keyword}"`);
      allJobs.push(...shaped);

      // POLITENESS DELAY — wait 2-3 seconds between requests
      // Why? Hitting a server 10 times per second looks like an attack
      // Random delay makes it look more human
      const delay = 2000 + Math.random() * 1000;
      await new Promise(res => setTimeout(res, delay));

    } catch (err) {
      // One keyword failing shouldn't stop others
      logger.warn(`  No results for "${keyword}" — ${(err as Error).message}`);
    }
  }

  // Always close the browser — leaving it open leaks memory
  await context.close();
  await browser.close();

  // Deduplicate — same job might appear for multiple keywords
  // We use a Map with job.id as key — duplicate IDs just overwrite
  const unique = new Map<string, Job>();
  for (const job of allJobs) {
    if (job.id) unique.set(job.id, job);
  }

  logger.info(`  Deduped: ${allJobs.length} → ${unique.size} unique jobs`);
  return Array.from(unique.values());
}