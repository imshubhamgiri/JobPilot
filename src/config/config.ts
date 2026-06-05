import type { Config } from '../types';

const config: Config = {
  // --- What roles you're targeting ---
  targetRoles: [
    'backend developement',
    'full stack developement',
    'node.js developement',
    'software engineer',
    'software developer intern',
    'web developer',
    'software development'
  ],

  // --- Your core skills (used for scoring) ---
  requiredSkills: [
    'mern', 
    'node.js', 'nodejs',
    'typescript', 'javascript',
    'react', 'express', 'express.js',
    'mongodb', 'postgresql',
    'rest api', 'git', 'python' , 'github', 
    'genAI' , 'sql' , 'nextjs', 'next.js', 'docker', 'mern'
    
  ],

  // --- Jobs containing these are auto-skipped ---
  blacklistTerms: [
    '5+ years', '7+ years', '10+ years',
    'senior only', 'lead engineer',
    '.net', 'php', 'wordpress', 'drupal',
    'only for girls', 'game developer'                    // some internshala listings have this
  ],

  // --- Minimum score to apply (out of 100) ---
  minScore: 55,

  // --- Safety cap per run (avoid spam behavior) ---
  maxApplicationsPerRun: 10,

  // --- Cron schedule: every day at 9:00 AM ---
  schedule: '0 9 * * *',

  github: {
    username: process.env.GITHUB_USERNAME || '',
    projectLimit: 5,             // top 5 most recently pushed repos
  },
};

export default config;