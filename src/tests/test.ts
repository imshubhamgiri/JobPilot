import path from 'path';
import fs from 'fs/promises';
import config from '../config/config';
import { getLatestProjects } from '../modules/github-fetcher';
import { loadResume } from '../modules/resume-reader';
import { scrapeAll } from '../modules/scraper';
import { matchJobs } from '../modules/matcher';
import logger from '../utils/logger';
import { Resume } from '../types';

// ════════════════════════════════════════════════════════════
// TEST 1: Resume Loading
// ════════════════════════════════════════════════════════════
async function testLoadResume() {
    console.log('\n📋 TEST: Load Resume');
    try {
        const resume = await loadResume();
        
        // Verify structure
        if (!resume.name || !resume.skills || !Array.isArray(resume.skills)) {
            throw new Error('Resume missing required fields');
        }
        
        logger.success(`✓ Resume loaded successfully`);
        logger.info(`  Name: ${resume.name}`);
        logger.info(`  Skills: ${resume.skills.length} total`);
        logger.info(`  Email: ${resume.email}`);
        return resume;
    } catch (error) {
        logger.error(`✗ Failed to load resume: ${(error as Error).message}`);
        throw error;
    }
}

// ════════════════════════════════════════════════════════════
// TEST 2: GitHub Fetcher
// ════════════════════════════════════════════════════════════
async function testGitHubFetcher() {
    console.log('\n🐙 TEST: Fetch GitHub Projects');
    try {
        const projects = await getLatestProjects(config.github.username, config.github.projectLimit);
        
        if (!Array.isArray(projects) || projects.length === 0) {
            throw new Error('No projects returned from GitHub');
        }
        
        logger.success(`✓ GitHub projects fetched successfully`);
        logger.info(`  Total projects: ${projects.length}`);
        
        // Show first 3 projects
        projects.slice(0, 3).forEach((project, idx) => {
            logger.info(`  ${idx + 1}. ${project.name} (⭐ ${project.stars})`);
        });
        
        return projects;
    } catch (error) {
        logger.error(`✗ Failed to fetch GitHub projects: ${(error as Error).message}`);
        throw error;
    }
}

// ════════════════════════════════════════════════════════════
// TEST 3: Job Scraping
// ════════════════════════════════════════════════════════════
async function testJobScraping() {
    console.log('\n🔍 TEST: Scrape Jobs');
    try {
        const rawJobs = await scrapeAll(config.targetRoles);
        
        if (!Array.isArray(rawJobs) || rawJobs.length === 0) {
            throw new Error('No jobs scraped');
        }
        
        logger.success(`✓ Jobs scraped successfully`);
        logger.info(`  Total jobs: ${rawJobs.length}`);
        
        // Save scraped jobs
        const filePath = path.join(process.cwd(), 'scraped_jobs.json');
        const jsonData = JSON.stringify(rawJobs, null, 2);
        await fs.writeFile(filePath, jsonData, 'utf-8');
        logger.info(`  Saved to: scraped_jobs.json`);
        
        // Show first 3 jobs
        rawJobs.slice(0, 3).forEach((job, idx) => {
            logger.info(`  ${idx + 1}. ${job.title} at ${job.company}`);
        });
        
        return rawJobs;
    } catch (error) {
        logger.error(`✗ Failed to scrape jobs: ${(error as Error).message}`);
        throw error;
    }
}

// ════════════════════════════════════════════════════════════
// TEST 4: Job Matching
// ════════════════════════════════════════════════════════════
async function testJobMatching(jobs: any[], resume: Resume) {
    console.log('\n⚡ TEST: Match Jobs with Resume');
    try {
        if (!Array.isArray(jobs) || jobs.length === 0) {
            throw new Error('No jobs provided for matching');
        }
        
        if (!resume) {
            throw new Error('Resume not loaded');
        }
        
        const matchedResults = matchJobs(jobs, resume, config);
        
        logger.success(`✓ Job matching completed`);
        logger.info(`  Total jobs processed: ${matchedResults.length}`);
        
        // Filter high-scoring matches
        const highScores = matchedResults.filter(r => r.score >= 75);
        logger.info(`  High matches (score >= 75): ${highScores.length}`);
        
        // Show top 5 matches
        const topMatches = matchedResults.sort((a, b) => b.score - a.score).slice(0, 5);
        topMatches.forEach((match, idx) => {
            logger.info(`  ${idx + 1}. ${match.job.title} - Score: ${match.score} | Skills: ${match.matchedSkills.join(', ')}`);
        });
        
        return matchedResults;
    } catch (error) {
        logger.error(`✗ Failed to match jobs: ${(error as Error).message}`);
        throw error;
    }
}

// ════════════════════════════════════════════════════════════
// TEST 5: Save Matched Jobs
// ════════════════════════════════════════════════════════════
async function testSaveMatchedJobs(matchedResults: any[]) {
    console.log('\n💾 TEST: Save Matched Jobs');
    try {
        const filePath = path.join(process.cwd(), 'matched_jobs.json');
        const jsonData = JSON.stringify(matchedResults, null, 2);
        await fs.writeFile(filePath, jsonData, 'utf-8');
        
        logger.success(`✓ Matched jobs saved successfully`);
        logger.info(`  File: matched_jobs.json`);
        logger.info(`  Total results: ${matchedResults.length}`);
    } catch (error) {
        logger.error(`✗ Failed to save matched jobs: ${(error as Error).message}`);
        throw error;
    }
}

// ════════════════════════════════════════════════════════════
// TEST 6: Read and Filter High Matches
// ════════════════════════════════════════════════════════════
async function testReadHighMatches() {
    console.log('\n📊 TEST: Read High Matches (score >= 75)');
    try {
        const filePath = path.join(process.cwd(), 'matched_jobs.json');
        const data = await fs.readFile(filePath, 'utf-8');
        const matchedJobs = JSON.parse(data);
        
        const highMatches = matchedJobs.filter((item: any) => item.score >= 75);
        
        logger.success(`✓ High matches retrieved`);
        logger.info(`  Total high matches: ${highMatches.length}`);
        
        // Display details
        highMatches.slice(0, 5).forEach((match: any, idx: number) => {
            console.log(`\n  Job ${idx + 1}:`);
            logger.info(`    Title: ${match.job.title}`);
            logger.info(`    Company: ${match.job.company}`);
            logger.info(`    Score: ${match.score}`);
            logger.info(`    Matched Skills: ${match.matchedSkills.join(', ')}`);
        });
        
        logger.info(`  (Showing ${Math.min(5, highMatches.length)} of ${highMatches.length})`);
        
        return highMatches;
    } catch (error) {
        logger.error(`✗ Failed to read high matches: ${(error as Error).message}`);
        throw error;
    }
}

// ════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ════════════════════════════════════════════════════════════
async function runAllTests() {
    logger.step('═══════════════════════════════════════════════');
    logger.step('  STARTING JOB-AI TEST SUITE');
    logger.step('═══════════════════════════════════════════════');
    
    try {
        // Test 1: Load Resume
        const resume = await testLoadResume();
        
        // Test 2: Fetch GitHub Projects (inject into resume)
        const projects = await testGitHubFetcher();
        resume.projects = projects;
        
        // Test 3: Scrape Jobs
        const jobs = await testJobScraping();
        
        // Test 4: Match Jobs
        const matchedResults = await testJobMatching(jobs, resume);
        
        // Test 5: Save Matched Jobs
        await testSaveMatchedJobs(matchedResults);
        
        // Test 6: Read High Matches
        const highMatches = await testReadHighMatches();
        
        logger.step('\n═══════════════════════════════════════════════');
        logger.success('  ✓ ALL TESTS PASSED SUCCESSFULLY');
        logger.step('═══════════════════════════════════════════════');
        
    } catch (error) {
        logger.error('\n═══════════════════════════════════════════════');
        logger.error('  ✗ TEST SUITE FAILED');
        logger.error('═══════════════════════════════════════════════');
        console.error(error);
        process.exit(1);
    }
}

// Execute tests
runAllTests();

