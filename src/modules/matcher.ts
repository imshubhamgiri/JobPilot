import type { Job, Resume, MatchResult, Config } from '../types';

export function matchJobs(jobs: Job[], resume: Resume, config: Config): MatchResult[] {
  return jobs.map(job => scoreJob(job, resume, config));
}

function scoreJob(job: Job, resume: Resume, config: Config): MatchResult {
  const jobText = `${job.title} ${job.description}`.toLowerCase();
  let score = 0;
  const matchedSkills: string[] = [];

  // ── Instant disqualify check ────────────────────────────────
  for (const term of config.blacklistTerms) {
    if (jobText.includes(term.toLowerCase())) {
      return {
        job,
        score: 0,
        matchedSkills: [],
        disqualified: true,
        disqualifyReason: `Blacklisted term: "${term}"`,
      };
    }
  }

  // ── Skill match (heaviest weight) ───────────────────────────
  for (const skill of resume.skills) {
    if (jobText.includes(skill.toLowerCase())) {
      score += 10;
      matchedSkills.push(skill);
    }
  }

  // ── Target role match ────────────────────────────────────────
  for (const role of config.targetRoles) {
    if (job.title.toLowerCase().includes(role.toLowerCase())) {
      score += 20;
      break; // only count once
    }
  }

  // ── Required skills from config ──────────────────────────────
  for (const skill of config.requiredSkills) {
    if (jobText.includes(skill.toLowerCase()) && !matchedSkills.includes(skill)) {
      score += 8;
      matchedSkills.push(skill);
    }
  }

  // ── Project tech stack match ─────────────────────────────────
  for (const project of resume.projects) {
    for (const tech of project.techStack) {
      if (jobText.includes(tech.toLowerCase())) {
        score += 3;
        break;
      }
    }
  }

  // Cap at 100
  score = Math.min(score, 100);

  return { job, score, matchedSkills, disqualified: false };
}