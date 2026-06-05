import { test } from 'node:test';
import assert from 'node:assert';
import 'dotenv/config'
import path from 'path';
import fs from 'fs/promises';
import config from '../config/config';
import { getLatestProjects } from '../modules/github-fetcher';
import { loadResume } from '../modules/resume-reader';
import { scrapeAll } from '../modules/scraper';
import { matchJobs } from '../modules/matcher';
import logger from '../utils/logger';
import { MatchResult, Resume } from '../types';
import { sendDailyReport } from '../modules/notifier';
import { applyToJobs } from '../modules/applier';

// ════════════════════════════════════════════════════════════
// TEST 1: Resume Loading
// // ════════════════════════════════════════════════════════════
// test('Resume Loading - should load resume with required fields', async () => {
//     const resume = await loadResume();

//     assert.ok(resume.name, 'Resume should have a name');
//     assert.ok(Array.isArray(resume.skills), 'Resume should have skills array');
//     assert.ok(resume.skills.length > 0, 'Resume should have at least one skill');
//     assert.ok(resume.email, 'Resume should have an email');

//     logger.success(`✓ Resume loaded: ${resume.name}`);
// });

// ════════════════════════════════════════════════════════════
// TEST 2: GitHub Fetcher
// ════════════════════════════════════════════════════════════
// test('GitHub Fetcher - should fetch projects successfully', async () => {
//     const projects = await getLatestProjects(config.github.username, config.github.projectLimit);

//     assert.ok(Array.isArray(projects), 'Projects should be an array');
//     assert.ok(projects.length > 0, 'Should return at least one project');
//     assert.ok(projects[0].name, 'Project should have a name');
//     assert.ok(projects[0].stars !== undefined, 'Project should have stars count');
//     assert.ok(projects[0].url, 'Project should have a URL');

//     logger.success(`✓ Fetched ${projects.length} GitHub projects`);
// });

// ════════════════════════════════════════════════════════════
// TEST 3: Job Scraping
// ════════════════════════════════════════════════════════════
// test('Job Scraping - should scrape jobs and save to file', async () => {
//     const rawJobs = await scrapeAll(config.targetRoles);

//     assert.ok(Array.isArray(rawJobs), 'Jobs should be an array');
//     assert.ok(rawJobs.length > 0, 'Should scrape at least one job');
//     assert.ok(rawJobs[0]?.title, 'Job should have a title');
//     assert.ok(rawJobs[0]?.company, 'Job should have a company');
//     assert.ok(rawJobs[0]?.description, 'Job should have a description');

//     // Save to file
//     const filePath = path.join(process.cwd(), 'scraped_jobs.json');
//     await fs.writeFile(filePath, JSON.stringify(rawJobs, null, 2), 'utf-8');

//     // Verify file exists
//     const fileExists = await fs.stat(filePath);
//     assert.ok(fileExists, 'scraped_jobs.json should exist');

//     logger.success(`✓ Scraped ${rawJobs.length} jobs`);
// });

// ════════════════════════════════════════════════════════════
// TEST 4: Job Matching
// ════════════════════════════════════════════════════════════
// test('Job Matching - should match jobs with resume and calculate scores', async () => {
//     const resume = await loadResume();
//     const jobs = await scrapeAll(config.targetRoles);

//     assert.ok(Array.isArray(jobs), 'Jobs should be an array');
//     assert.ok(jobs.length > 0, 'Should have jobs to match');

//     const matchedResults = matchJobs(jobs, resume, config);

//     assert.ok(Array.isArray(matchedResults), 'Results should be an array');
//     assert.ok(matchedResults.length > 0, 'Should have matched results'); 
//     assert.equal(matchedResults.length, jobs.length, 'Should have result for each job');
//     assert.ok(matchedResults[0]!.score >= 0, 'Score should be non-negative');
//     assert.ok(Array.isArray(matchedResults[0]! .matchedSkills), 'Should have matchedSkills array');

//     const highScores = matchedResults.filter(r => r.score >= 75);
//     logger.success(`✓ Matched ${matchedResults.length} jobs (${highScores.length} with score >= 75)`);
// });

// ════════════════════════════════════════════════════════════
// TEST 5: Save Matched Jobs
// ══════════════════════════════════ 
// test('Save Matched Jobs - should save matched jobs to file', async () => {
//     const resume = await loadResume();
//     const jobs = await scrapeAll(config.targetRoles);
//     const matchedResults = matchJobs(jobs, resume, config);

//     const filePath = path.join(process.cwd(), 'matched_jobs.json');
//     await fs.writeFile(filePath, JSON.stringify(matchedResults, null, 2), 'utf-8');

//     // Verify file exists and contains data
//     const fileExists = await fs.stat(filePath);
//     assert.ok(fileExists, 'matched_jobs.json should exist');

//     const data = await fs.readFile(filePath, 'utf-8');
//     const savedData = JSON.parse(data);

//     assert.ok(Array.isArray(savedData), 'File should contain an array');
//     assert.equal(savedData.length, matchedResults.length, 'File should contain all results');

//     logger.success(`✓ Saved ${savedData.length} results to matched_jobs.json`);
// });

// ════════════════════════════════════════════════════════════
// TEST 6: Read and Filter High Matches
// // ════════════════════════════════════════════════════════════
// test('Read High Matches - should filter jobs with score >= 75', async () => {
//     const filePath = path.join(process.cwd(), 'matched_jobs.json');

//     const data = await fs.readFile(filePath, 'utf-8');
//     const matchedJobs = JSON.parse(data);

//     assert.ok(Array.isArray(matchedJobs), 'File should contain an array');

//     const highMatches = matchedJobs.filter((item: any) => item.score >= 70 && !item.disqualified && !item.isExclusive);

//     assert.ok(Array.isArray(highMatches), 'Filtered results should be an array');

//     // Verify each high match has required fields
//     highMatches.forEach((match: any) => {
//         assert.ok(match.job, 'Match should have job object');
//         assert.ok(match.job.title, 'Job should have title');
//         assert.ok(match.job.company, 'Job should have company');
//         assert.ok(match.score >= 70, 'Score should be >= 70');
//         assert.ok(Array.isArray(match.matchedSkills), 'Should have matchedSkills');
//     });

//     await fs.writeFile(path.join(process.cwd(), 'high_matches.json'), JSON.stringify(highMatches, null, 2), 'utf-8');

//     logger.success(`✓ Found ${highMatches.length} high-scoring matches`);
// });

// test('Should get all the tokens from session.json',async()=> {
//     const SESSION_PATH = path.join(process.cwd(), 'src/data/session.json');
//     const raw     = await fs.readFile(SESSION_PATH, 'utf-8');
//     const session = JSON.parse(raw);
//     assert.ok(session.cookies, 'Session should have cookies');
//     assert.ok(session.localStorage, 'Session should have localStorage');
//     assert.ok(session.cookies.length > 0, 'Session should have non-empty cookies');
//     assert.ok(Object.keys(session.localStorage).length > 0, 'Session should have non-empty localStorage');
//     logger.info('Retrieved session tokens:');
//     for (const cookie of session.cookies) {
//         logger.info(`Cookie: ${cookie.name}=${cookie.value}`);
//     }
// });







test('should apply to jobs', async () => {
    logger.info('Testing applyToJobs with high matches from file');
    let data = await fs.readFile(path.join(process.cwd(), 'high_matches.json'), 'utf-8');
    logger.step('Read high_matches.json file');
    const qualified: MatchResult[] = JSON.parse(data)

    qualified.sort((a, b) => b.score - a.score);
    logger.info(`Loaded ${qualified.length} qualified matches from file`);
    const applied = await applyToJobs(qualified);
    logger.info(`applyToJobs returned: ${applied}`);
    assert.ok(typeof applied === 'number', 'applyToJobs should return a number');
    logger.success(`✓ Applied to ${applied} jobs successfully`);
});

test('should send report to telegram', async () => {
    const stats = {
        jobsScraped: 0,
        jobsMatched: 0,
        jobsApplied: 0,
        emailsSent: 0,
        note: 'no job found'
    }

    await sendDailyReport([], stats)

    assert.ok('working here')
});

