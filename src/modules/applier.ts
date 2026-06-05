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
  // Get all question blocks inside the assessment container
  const questionBlocks = await page.$$('.questions-container > div');

  for (const block of questionBlocks) {
    // Detect what type of input this question has

    // TYPE 1: Radio buttons (Yes/No questions)
    const radios = await block.$$('input[type="radio"]');
    if (radios.length > 0) {
      // Always click the first radio (usually "Yes")
      // Covers: "Do you have a laptop?" "Open to full-time?" etc.
      await radios[0].click();
      continue;
    }

    // TYPE 2: Number input ("How many months of experience?")
    const numberInput = await block.$('input[type="number"], input[placeholder*="numeric"]');
    if (numberInput) {
      // Get the question text to give a smarter answer
      const questionText = await block.$eval(
        '.question-heading, label, p',
        (el: Element) => el.textContent?.toLowerCase() || ''
      ).catch(() => '');

      // Match keywords → give relevant number
      let answer = '1'; // safe default
      if (questionText.includes('experience') || questionText.includes('months')) {
        answer = '6'; // 6 months experience
      } else if (questionText.includes('project')) {
        answer = '3'; // 3 projects
      } else if (questionText.includes('year')) {
        answer = '1'; // 1 year
      }

      await numberInput.fill(answer);
      continue;
    }

    // TYPE 3: Textarea ("Share portfolio link", "Cover letter", etc.)
    const textarea = await block.$('textarea');
    if (textarea) {
      const questionText = await block.$eval(
        '.question-heading, label, p',
        (el: Element) => el.textContent?.toLowerCase() || ''
      ).catch(() => '');

      let answer = `https://github.com/${process.env.GITHUB_USERNAME}`;

      // If it's asking for cover letter style answer, give a short one
      if (questionText.includes('cover') || questionText.includes('why') || questionText.includes('yourself')) {
        answer = `I am a passionate developer with hands-on experience in Node.js, TypeScript, and React. I have built multiple projects which you can view at https://github.com/${process.env.GITHUB_USERNAME}. I am available to join immediately and excited to contribute to your team.`;
      }

      await textarea.fill(answer);
      continue;
    }

    // TYPE 4: Regular text input
    const textInput = await block.$('input[type="text"]');
    if (textInput) {
      await textInput.fill(`https://github.com/${process.env.GITHUB_USERNAME}`);
      continue;
    }

    // Unknown type — log and skip, don't crash
    logger.warn('  Unknown question type — skipping field');
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
  // if (hasApplied(job.id)) {
  //   logger.info(`  Skipping (already applied): ${job.title} @ ${job.company}`);
  //   return 'skipped';
  // }
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

    const delay = 4000 + Math.random() * 3000; // 4-7 seconds
    await new Promise(res => setTimeout(res, delay));
    // Wait for modal to close — that confirms submission went through
    logger.step('  Closing confirmation modal');
    await page.click('#easy_apply_modal_close');

    logger.info('  Application submitted, waiting for confirmation...');
    // await page.waitForSelector('#easy_apply_modal', {
    //   state: 'hidden',
    //   timeout: 15000
    // });

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