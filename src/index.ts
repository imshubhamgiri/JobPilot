// ============================================================
// src/index.ts — Main entry point
// Pipeline: GitHub → Scrape → Match → Apply → Notify
// ============================================================

import 'dotenv/config';
import cron from 'node-cron';
import  logger  from './utils/logger';
import { initDB, logRun, getTodaysApplications, closeDB } from './modules/db';
import { getLatestProjects } from './modules/github-fetcher';
import { scrapeAll } from './modules/scraper';
import { matchJobs } from './modules/matcher';
import { loadResume } from './modules/resume-reader';
import { sendDailyReport } from './modules/notifier';
import config from './config/config';
import path from 'path/win32';
import fs from 'fs/promises';
import { applyToJobs } from './modules/applier';

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
    const rejected   = matches.filter(m => m.disqualified);
    const lowScore   = matches.filter(m => !m.disqualified && m.score < config.minScore);

    // Save all scraped jobs with scores for transparency
    const filePath = path.join(process.cwd(), 'matched_jobs.json');

 
    const jsonTableData = JSON.stringify(qualified, null, 2);
   
    await fs.writeFile(filePath, jsonTableData , 'utf-8')
    stats.jobsMatched = qualified.length;

    logger.success(`Qualified: ${qualified.length} | Low score: ${lowScore.length} | Blacklisted: ${rejected.length}`);

    //Top matches

    qualified.sort(
      (a, b)=> b.score - a.score
    ).slice(0, 5)
    .forEach(m=>{
      logger.info(`Top Match: ${m.job.title} at ${m.job.company} | Score: ${m.score} | Matched Skills: ${m.matchedSkills.join(', ')}`);
    })

    if (qualified.length === 0) {
      logger.warn('No jobs passed the score threshold — consider lowering minScore in config');
      await sendDailyReport([], { ...stats, note: 'No jobs passed score threshold' });
      return;
    }
    
    // 4. Apply  [stub for now — applier module comes next]
    logger.step('Step 4 — Applying');
    logger.warn('Applier module not built yet — skipping');
    const applied = await applyToJobs(qualified);
    stats.jobsApplied = applied;

    // 5. Send daily report
    logger.step('Step 5 — Sending Report');
    const todaysApps = getTodaysApplications();
    await sendDailyReport(todaysApps, stats);

    // 6. Log run to DB
    // logRun(stats);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.step(`Pipeline Complete in ${elapsed}s`);

  } catch (err) {
    const message = (err as Error).message;
    logger.error(`Pipeline failed: ${(err as Error).message}`);
    console.error(err);

    // Even on failure, try to send a report with what we have
    try {
      await sendDailyReport([], { ...stats, note: `Pipeline crashed: ${message}` });
    } catch {
      logger.error('Could not send failure notification either');
    }
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

    global.cronJob =  cron.schedule(config.schedule, async () => {
      await runPipeline();
    });
  }
}

async function GracefulShutDown(signal: string): Promise<void> {
  logger.info(`Graceful shutdown initiated (${signal})`);
  
  try {
    // Set a hard timeout to force exit if cleanup takes too long
    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timeout — forcing exit');
      process.exit(1);
    }, 10000); // 10 second hard limit

    // Stop accepting new cron jobs
    if (global.cronJob) {
      global.cronJob.stop();
      logger.info('Cron scheduler stopped');
    }

    // Close database connection
    closeDB();

    logger.info('Cleanup complete');

    clearTimeout(forceExitTimer);
    logger.success(`Server terminated cleanly (${signal})`);
    process.exit(0);
  } catch (error) {
    logger.error(`Shutdown error: ${(error as Error).message}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => GracefulShutDown('SIGTERM'));
process.on('SIGINT', () => GracefulShutDown('SIGINT'));


process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise} | reason: ${reason}`);
});

main().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
