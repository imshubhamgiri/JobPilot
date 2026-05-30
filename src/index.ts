// ============================================================
// src/index.ts — Main entry point
// Pipeline: GitHub → Scrape → Match → Apply → Notify
// ============================================================

import 'dotenv/config';
import cron from 'node-cron';
import  logger  from './utils/logger';
import { initDB, logRun, getTodaysApplications } from './modules/db';
import { getLatestProjects } from './modules/github-fetcher';
import { scrapeAll } from './modules/scraper';
import { matchJobs } from './modules/matcher';
import { loadResume } from './modules/resume-reader';
import { sendDailyReport } from './modules/notifier';
import config from './config/config';

// ─── Core Pipeline ────────────────────────────────────────────

async function runPipeline(): Promise<void> {
  const startTime = Date.now();
  logger.step('Job Pilot Pipeline Starting');

  const stats = {
    jobsScraped: 0,
    jobsMatched: 0,
    jobsApplied: 0,
    emailsSent:  0,
  };

  try {
    // 1. Load resume + inject latest GitHub projects
    logger.step('Step 1 — Loading Resume');
    const resume = await loadResume();
    const projects = await getLatestProjects(config.github.username, config.github.projectLimit);
    resume.projects = projects;
    logger.success(`Resume loaded | ${projects.length} GitHub projects injected`);

    // 2. Scrape jobs from all sources
    logger.step('Step 2 — Scraping Jobs');
    const rawJobs = await scrapeAll(config.targetRoles);
    stats.jobsScraped = rawJobs.length;
    logger.success(`Scraped ${rawJobs.length} jobs total`);

    // 3. Match and score
    logger.step('Step 3 — Matching Jobs');
    const matches = matchJobs(rawJobs, resume, config);
    const qualified = matches.filter(m => !m.disqualified && m.score >= config.minScore);
    stats.jobsMatched = qualified.length;
    logger.success(`${qualified.length} jobs passed threshold (min score: ${config.minScore})`);

    // 4. Apply  [stub for now — applier module comes next]
    logger.step('Step 4 — Applying');
    logger.warn('Applier module not built yet — skipping');
    // const applied = await applyToJobs(qualified, resume);
    // stats.jobsApplied = applied.length;

    // 5. Send daily report
    logger.step('Step 5 — Sending Report');
    const todaysApps = getTodaysApplications();
    await sendDailyReport(todaysApps, stats);

    // 6. Log run to DB
    logRun(stats);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.step(`Pipeline Complete in ${elapsed}s`);

  } catch (err) {
    logger.error(`Pipeline failed: ${(err as Error).message}`);
    console.error(err);
  }
}

// ─── Entrypoint ───────────────────────────────────────────────

async function main(): Promise<void> {
  // Init DB first — always
  initDB();

  const runOnce = process.argv.includes('--once');

  if (runOnce) {
    // Manual trigger: `npm run start -- --once`
    logger.info('Running once (manual trigger)');
    await runPipeline();
    process.exit(0);
  } else {
    // Scheduled mode
    logger.info(`Scheduler started — cron: "${config.schedule}"`);
    logger.info('Waiting for next scheduled run... (use --once to run immediately)');

    cron.schedule(config.schedule, async () => {
      await runPipeline();
    });
  }
}

main().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
