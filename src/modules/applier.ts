import { chromium, BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';
import type { MatchResult, ApplicationRecord } from '../types';
import  logger  from '../utils/logger';
import { hasApplied, saveApplication, updateStatus } from './db';
import config from '../config/config';

const SESSION_PATH = path.join(process.cwd(), 'src/data/session.json');

// ─── Load Saved Session ───────────────────────────────────────
// Instead of logging in every run, we load the cookies we saved once
// and inject them into the browser — instantly logged in

async function loadSession(context: BrowserContext): Promise<void> {
  if (!fs.existsSync(SESSION_PATH)) {
    throw new Error('No session found. Run: npx tsx src/scripts/save-session.ts first');
  }

  const raw     = fs.readFileSync(SESSION_PATH, 'utf-8');
  const session = JSON.parse(raw);

  // Inject saved cookies into this browser context
  await context.addCookies(session.cookies);
  logger.success('Session loaded — already logged in');
}

// ─── Answer Dynamic Questions ─────────────────────────────────
// This is the smart fallback logic we discussed
// No AI — pure rule based for v1

async function answerQuestions(page: any): Promise<void> {
  // Use .additional_question — direct class on each question block
  // More reliable than '.questions-container > div' which selects generic children
  const questionBlocks = await page.$$('.additional_question');

  for (const block of questionBlocks) {

    // ── TYPE 1: Radio (Yes/No) ──────────────────────────────
    // Select first label inside first radio div
    // We click LABEL not INPUT because input is hidden by CSS
    // Must await block.$() before calling .click() — it returns a Promise
    const radioLabel = await block.$('.radio_group .radio:first-child label');
    if (radioLabel) {
      await radioLabel.click();
      continue;
    }

    // ── TYPE 2: Number input ────────────────────────────────
    const numberInput = await block.$('input[type="number"]');
    if (numberInput) {
      const questionText = await block.$eval(
        'label',
        (el: Element) => el.textContent?.toLowerCase() || ''
      ).catch(() => '');

      let answer = '6'; // safe default — 6 months
      if (questionText.includes('year'))                         answer = '1';
      if (questionText.includes('project'))                      answer = '3';
      if (questionText.includes('rating') || questionText.includes('scale')) answer = '4';

      await numberInput.fill(answer);
      continue;
    }

    // ── TYPE 3: Dropdown (rating scale like 1-5) ───────────
    // Internshala uses chosen.js — real <select> is display:none
    // Playwright can't click hidden elements
    // Solution: set value directly via JS inside the browser, then fire change event
    const dropdown = await block.$('select.custom_question_range');
    if (dropdown) {
      await page.evaluate((el: HTMLSelectElement) => {
        el.value = '4';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, dropdown);
      continue;
    }

    // ── TYPE 4: Textarea ────────────────────────────────────
    const textarea = await block.$('textarea');
    if (textarea) {
      const questionText = await block.$eval(
        'label',
        (el: Element) => el.textContent?.toLowerCase() || ''
      ).catch(() => '');

      let answer = `https://github.com/${process.env.GITHUB_USERNAME}`;

      if (
        questionText.includes('cover')    ||
        questionText.includes('why')      ||
        questionText.includes('yourself') ||
        questionText.includes('about you')
      ) {
        answer = `I am a passionate developer with hands-on experience in Node.js, TypeScript, and React. I have built multiple projects which you can view at https://github.com/${process.env.GITHUB_USERNAME}. I am available to join immediately and excited to contribute.`;
      }

      await textarea.fill(answer);
      continue;
    }

    // ── TYPE 5: Plain text input ────────────────────────────
    const textInput = await block.$('input[type="text"]');
    if (textInput) {
      await textInput.fill(`https://github.com/${process.env.GITHUB_USERNAME}`);
      continue;
    }

    logger.warn('  Unknown question type — skipping');
  }
}

// ─── Apply To Single Job ──────────────────────────────────────

async function applyToJob(
  page: any,
  match: MatchResult
): Promise<'applied' | 'failed' | 'skipped'> {
  const { job } = match;
    logger.info('reached here with first job url' , job.applyLink)
  // Check DB — already applied? skip immediately
  if (hasApplied(job.id)) {
    logger.info(`  Skipping (already applied): ${job.title} @ ${job.company}`);
    return 'skipped';
  }
   logger.info('not applied before')
  try {
    logger.info(`  Applying: ${job.title} @ ${job.company} (score: ${match.score})`);

    // GO — navigate to the job detail page
    await page.goto(job.applyLink, { waitUntil: 'networkidle', timeout: 30000 });

    // WAIT — make sure Apply button is visible
    await page.waitForSelector('#top_easy_apply_button', { timeout: 10000 });

    // CLICK — open the modal
    await page.click('#top_easy_apply_button');

    // WAIT — modal must fully appear before we interact with it
    await page.waitForSelector('#easy_apply_modal', { timeout: 10000 });
    await page.waitForSelector('#application-form', { timeout: 10000 });

    // Availability is already set to "Yes" by default — no need to click

    // Handle dynamic questions
    await answerQuestions(page);

    // Small pause — let any JS validate the form
    await page.waitForTimeout(1000);

    // SUBMIT
    logger.step('  Submitting application form');
    await page.click('#submit');

// Wait for Internshala's JS to finish — detect the post-submit state
// #continue_container appears ONLY after successful submission
    await page.waitForSelector('#continue_container', { timeout: 15000 });

    // NOW it's safe to close — DOM is stable
    await page.click('#easy_apply_modal_close');

    // Wait for modal to fully disappear
    await page.waitForSelector('#easy_apply_modal', { state: 'hidden', timeout: 5000 });

    // Save to DB
    const record: ApplicationRecord = {
      jobId:          job.id,
      title:          job.title,
      company:        job.company,
      source:         job.source,
      status:         'applied',
      score:          match.score,
      appliedAt:      new Date().toISOString(),
      coldEmailSent:  false,
    };
    saveApplication(record);

    logger.success(`  Applied: ${job.title} @ ${job.company}`);
    return 'applied';

  } catch (err) {
    logger.error(`  Failed: ${job.title} @ ${job.company} — ${(err as Error).message}`);
    updateStatus(job.id, 'failed');
    return 'failed';
  }
}

// ─── Apply To All Qualified Jobs ──────────────────────────────

export async function applyToJobs(matches: MatchResult[]): Promise<number> {
  const browser = await chromium.launch({ headless: false }); // Set to true in production
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata', // Assume we're in the same timezone as the job site for best compatibility
  });

  // Load saved session — no login needed
  await loadSession(context);

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  let appliedCount = 0;

  // Respect the cap from config — don't spam
  const toApply = matches.slice(0, config.maxApplicationsPerRun);
  logger.info(`Applying to ${toApply.length} jobs (cap: ${config.maxApplicationsPerRun})`);
  let count =1;
  for (const match of toApply) {
    logger.info('applying to job :' , count)
    const result = await applyToJob(page, match);
    count++;
    if (result === 'applied') appliedCount++;

    // Delay between applications — human-like behavior
    // Longer than scraper delay — we're actually submitting forms
    const delay = 4000 + Math.random() * 3000; // 4-7 seconds
    await new Promise(res => setTimeout(res, delay));
  }

  await browser.close();

  logger.success(`Done — applied to ${appliedCount} jobs`);
  return appliedCount;
}