import type { Job } from '../../types';
import  logger  from '../../utils/logger';
import { scrapeInternshala } from './internshala';

// Add more scrapers here as you build them:
// import { scrapeWellfound } from './wellfound';
// import { scrapeRemoteOK } from './remoteok';

export async function scrapeAll(keywords: string[]): Promise<Job[]> {
  const results: Job[] = [];

  const scrapers = [
    { name: 'Internshala', fn: scrapeInternshala },
    // { name: 'Wellfound',   fn: scrapeWellfound },
    // { name: 'RemoteOK',    fn: scrapeRemoteOK },
  ];

  for (const scraper of scrapers) {
    try {
      logger.info(`Scraping ${scraper.name}...`);
      const jobs = await scraper.fn(keywords);
      logger.success(`${scraper.name}: ${jobs.length} jobs found`);
      results.push(...jobs);
    } catch (err) {
      logger.error(`${scraper.name} scraper failed: ${(err as Error).message}`);
    }
  }

  return results;
}