// ============================================================
// types/index.ts — All shared types for the entire pipeline
// ============================================================
import cron from 'node-cron';
export type JobSource = 'internshala' | 'wellfound' | 'remoteok' | 'linkedin' | 'indeed';
export type ApplicationStatus = 'pending' | 'applied' | 'failed' | 'skipped';

// Raw job scraped from any source
export interface Job {
  id: string;                  // hash of company+title — used to dedupe in DB
  title: string;
  company: string;
  description: string;
  location: string;
  applyLink: string;
  source: JobSource;
  stipend?: string;
  isExclusive?: boolean;       // for Internshala — helps prioritize exclusive internships
  duration?: string;           // for internships
  postedAt?: Date;
  hrName?: string;             // filled later by HR finder
  hrEmail?: string;            // filled later by Hunter.io
}

// Result after running matcher on a job
export interface MatchResult {
  job: Job;
  score: number;               // 0–100
  matchedSkills: string[];
  disqualified: boolean;
  isExclusive?: boolean;       // for Internshala — helps prioritize exclusive internships
  disqualifyReason?: string;
}

export interface DailyReportStats {
    jobsScraped: number;
    jobsMatched: number;
    jobsApplied: number;
    emailsSent: number;
    note?: string; // Optional note for special cases (e.g., no matches found)
}

// Your resume structure
export interface Resume {
  name: string;
  email: string;
  phone: string;
  github: string;
  linkedin?: string;
  summary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  projects: Project[];         // auto-filled from GitHub each run
}

export interface Experience {
  company: string;
  role: string;
  duration: string;
  points: string[];
}

export interface Education {
  institution: string;
  degree: string;
  year: string;
  score?: string;
}

export interface Project {
  name: string;
  description: string;
  techStack: string[];
  url: string;
  stars?: number;
}

// What gets saved to DB after applying
export interface ApplicationRecord {
  jobId: string;
  title: string;
  company: string;
  source: JobSource;
  status: ApplicationStatus;
  score: number;
  appliedAt: string;
  coldEmailSent: boolean;
}

// Config shape loaded from config.ts
export interface Config {
  targetRoles: string[];
  requiredSkills: string[];
  blacklistTerms: string[];
  minScore: number;
  maxApplicationsPerRun: number;
  schedule: string;            // cron expression
  github: {
    username: string;
    projectLimit: number;
  };
}

declare global {
  var cronJob: cron.ScheduledTask | undefined; 
}

declare global{
  interface Window{
    chrome :{
       runtime: Record<string ,any>
      }
  }
}

// declare global{
//   var window : Window & typeof globalThis;
// }