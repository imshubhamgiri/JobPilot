import type { Job, Resume, MatchResult, Config } from '../types';

export function matchJobs(jobs: Job[], resume: Resume, config: Config): MatchResult[] {
  return jobs.map(job => scoreJob(job, resume, config));
}

function scoreJob(job: Job, resume: Resume, config: Config): MatchResult {
  const jobText = `${job.title} ${job.description}`.toLowerCase();
  let score = 0;
  const matchedSkills: string[] = [];
  const uniqueMatches = new Set<string>();

  // ── Instant disqualify check ────────────────────────────────
  for (const term of config.blacklistTerms) {
    if (jobText.toLowerCase().includes(term.toLowerCase())) {
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
    const lowerSkill = skill.toLowerCase();
    if (jobText.includes(lowerSkill) && !uniqueMatches.has(lowerSkill)) {
      score += 10;
      matchedSkills.push(skill);
      uniqueMatches.add(lowerSkill);
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
    const lowerSkill = skill.toLowerCase();
    if (jobText.includes(lowerSkill) && 
    !uniqueMatches.has(lowerSkill)) {
      score += 8;
      matchedSkills.push(skill);
      uniqueMatches.add(lowerSkill);
    }
  }

  // ── Project tech stack match ─────────────────────────────────
  for (const project of resume.projects) {
    if(!project.techStack || project.techStack.length === 0) continue;
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