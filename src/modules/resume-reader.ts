import type { Resume } from '../types';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger';
const fileLocation = '/src/data/resume.json';
const directory = path.join(process.cwd(), fileLocation);

export async function loadResume(): Promise<Resume>{
    try {
     const data = await fs.readFile(directory, 'utf-8');
     logger.debug('file read successful')
     return JSON.parse(data) as Resume;   
    } catch (error: unknown) {
      throw new Error(`Failed to load resume: ${(error as Error).message}`);
    }
}

// import path from 'path';
// import  logger  from '../utils/logger';

// const RESUME_PATH = path.join(process.cwd(), 'src/data/resume.json');

// export async function loadResume(): Promise<Resume> {
//   const raw = await import(RESUME_PATH);
//   logger.info('Resume loaded from src/data/resume.json');
//   return raw.default as Resume;
// }