import path from 'path/win32';
import fs from 'fs/promises';
import config from '../config/config';
import { getLatestProjects } from '../modules/github-fetcher';
import { loadResume } from '../modules/resume-reader';
import { scrapeAll } from '../modules/scraper';
import logger from '../utils/logger';

console.log('opration started');
// const result =  new Promise((resolve, reject)=>{
//         setTimeout(async () => {
//        try {
//             const data = await getLatestProjects('octocat', 3);
//             resolve(data);
//         } catch (error) {
//             reject(error);
//         }
//         }, 1000);
//         console.log('Fetching latest projects from GitHub...');
// })

// result.then((res)=>{
// console.log(res)
// }).catch((e)=>{
//     console.log(e)
// }).finally(()=>{
//     console.log('operation completed')
// })

async function ResumeText() {
    try {
        logger.step('Step 1 — Loading Resume');
        const resume = await loadResume();
        const projects = await getLatestProjects(config.github.username, config.github.projectLimit);
        resume.projects = projects
        logger.success(`Resume loaded | ${projects.length} GitHub projects injected`);
        console.log(resume.skills);
        for (const project of resume.projects) {
            logger.info(`Project: ${project.name} - ${project.description}`);
        }
    } catch (error) {
        console.error('Error loading resume:', error);
    }
}
// ResumeText();
(async function jobScrape() {
    try {
        logger.step('Step 2 — Scraping Jobs');
        const rawJobs = await scrapeAll(config.targetRoles);
        logger.success(`Jobs scraped | ${rawJobs.length} jobs found`);
        const filePath = path.join(process.cwd(), 'scraped_jobs.json');

        // 2. Format the data into a readable JSON string (2-space indentation)
        const jsonTableData = JSON.stringify(rawJobs, null, 2);

        // 3. Write the file safely using the async fs module
        await fs.writeFile(filePath, jsonTableData, 'utf-8');
    } catch (error) {
        console.error('Error scraping jobs:', error);
    }
})();

