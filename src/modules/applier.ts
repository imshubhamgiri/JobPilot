import { chromium, BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';
import type { MatchResult, ApplicationRecord } from '../types';
import  logger  from '../utils/logger';
import { hasApplied, saveApplication, updateStatus } from './db';
import config from '../config/config';
import { FatalError, RecoverableError, SkipableError } from '../utils/errors';
import { sendDailyReport } from './notifier';

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

  // 1. Target the element by its unique ID
  // 1. Check if the Quill editor container exists on the page
const isCoverLetterAvailable = await page.$('#cover_letter_holder .ql-editor');

if (isCoverLetterAvailable) {
  logger.info('Cover letter text editor detected. Inputting content...');
  
  const applicationText = `Dear Hiring Team,\n\nI am highly excited to apply for the Software Development position. As a full-stack engineer specializing in the MERN stack, TypeScript, and PostgreSQL, I focus on building robust, scalable architectures and writing clean, maintainable code.\n\nWhat excites me most about this role is the opportunity to tackle complex engineering challenges. I love translating product ideas into production-ready software. To demonstrate my capabilities, I recently engineered a high-performance content delivery website and architected a complex browser automation tool designed to streamline web processes and automate job applications. My open-source code and engineering journey are publicly documented on my GitHub profile (https://github.com/imshubhamgiri). I thrive when working with strict typing in TypeScript, optimizing complex relational queries in PostgreSQL, and building reliable automation layers. I am eager to bring this same technical rigor and proactive problem-solving mindset to your development team.\n\nThank you for your time and consideration. I look forward to the possibility of discussing how my backend architectural skills and frontend experience align with your engineering goals.\n\nSincerely,\nShubham Giri`;

  // 1. Instantly inject the text into the Quill editor layer via page.evaluate
  await page.evaluate((text:string) => {
    const editor = document.querySelector('#cover_letter_holder .ql-editor');
    if (editor) {
      editor.innerHTML = ''; // Clear placeholder
      text.split('\n\n').forEach(paragraph => {
        const p = document.createElement('p');
        p.innerHTML = paragraph.replace(/\n/g, '<br>');
        editor.appendChild(p);
      });
    }
  }, applicationText);

  // 2. Click the editor container to explicitly focus it
  await page.click('#cover_letter_holder .ql-editor');

  // 3. Type a single space and a backspace. 
  // This triggers the site's native 'keydown' and 'input' events, forcing its validation to clear the error!
  await page.keyboard.press('Space');
  await page.keyboard.press('Backspace');

  logger.info('Cover letter filled and native validation cleared.');
}

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
      }else if(questionText.includes('live project')) {
        answer = process.env.LIVE_PROJECT_URL || ``
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
    throw new SkipableError('Unknown question type — cannot answer automatically');
  }
}

// ─── Apply To Single Job ──────────────────────────────────────

async function applyToJob(
  page: any,
  match: MatchResult
): Promise<void> {
  const { job } = match;
    logger.info('reached here with first job url' , job.applyLink)
  // Check DB — already applied? skip immediately
  if (hasApplied(job.id)) {
    throw new SkipableError("Already applied (checked in DB)");
  }
   logger.info('not applied before')
  try {
    logger.info(`  Applying: ${job.title} @ ${job.company} (score: ${match.score})`);

    // GO — navigate to the job detail page
    await page.goto(job.applyLink, { waitUntil: 'domcontentloaded', timeout: 30000 });

    //Check if already applied
    const isAlreadyApplied = await page.$eval('.apply_now_btn', (btn: HTMLButtonElement) => btn.disabled).catch(() => false);

    if (isAlreadyApplied) {
      throw new SkipableError("Already applied (detected on page)");
    }

    try {
      await page.waitForSelector('#top_easy_apply_button', { timeout: 10000 });
    } catch (err) {
      // Playwright timeout → wrap as RecoverableError
      throw new RecoverableError("Timeout waiting for apply button");
    }

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
  } catch (err) {
    if (err instanceof SkipableError || err instanceof RecoverableError || err instanceof FatalError) {
      throw err; // bubble up custom errors
    }
    // Unexpected → treat as fatal
    throw new FatalError(`Unexpected error: ${(err as Error).message}`);
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
    try {
    await applyToJob(page, match);
    appliedCount++;
  } catch (err) {
    if (err instanceof SkipableError) {
      logger.warn(`Skipped: ${match.job.title} @ ${match.job.company} — ${err.message}`);
      continue;
    }
    if (err instanceof RecoverableError) {
      logger.error(`Recoverable error: ${match.job.title} @ ${match.job.company} — ${err.message}`);
      // Retry wrapper
      let success = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        logger.info(`Retrying (${attempt}/3)...`);
        try {
          await applyToJob(page, match);
          appliedCount++;
          success = true;
          break;
        } catch (retryErr) {
          if (!(retryErr instanceof RecoverableError)) throw retryErr; // bubble up skip/fatal
        }
      }
      if (!success) {
        logger.error(`Failed after retries: ${match.job.title} @ ${match.job.company}`);
        updateStatus(match.job.id, 'failed');
      }
    }
    if (err instanceof FatalError) {

      const stats = {
        jobsScraped: matches.length,
        jobsMatched: matches.length,
        jobsApplied: appliedCount,
        emailsSent: 0,
        note: `Fatal error: ${err.message}`,

      }
      await sendDailyReport([], stats);
      process.exit(1);
    }
  }

    // Delay between applications — human-like behavior
    // Longer than scraper delay — we're actually submitting forms
    const delay = 4000 + Math.random() * 3000; // 4-7 seconds
    await new Promise(res => setTimeout(res, delay));
  }

  await browser.close();

  logger.success(`Done — applied to ${appliedCount} jobs`);
  return appliedCount;
}