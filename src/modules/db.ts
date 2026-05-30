import Database from 'better-sqlite3';
import path from 'path';
import type { ApplicationRecord } from '../types';
import  logger  from '../utils/logger';

const DB_PATH = path.join(process.cwd(), 'src/data/applied.db');

let db: Database.Database;

export function initDB(): void {
  db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      job_id         TEXT PRIMARY KEY,
      title          TEXT NOT NULL,
      company        TEXT NOT NULL,
      source         TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending',
      score          INTEGER DEFAULT 0,
      applied_at     TEXT NOT NULL,
      cold_email_sent INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS run_logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      ran_at         TEXT NOT NULL,
      jobs_scraped   INTEGER DEFAULT 0,
      jobs_matched   INTEGER DEFAULT 0,
      jobs_applied   INTEGER DEFAULT 0,
      emails_sent    INTEGER DEFAULT 0
    );
  `);

  logger.success('Database initialized');
}

export function hasApplied(jobId: string): boolean {
  const row = db.prepare('SELECT 1 FROM applications WHERE job_id = ?').get(jobId);
  return !!row;
}

export function saveApplication(record: ApplicationRecord): void {
  db.prepare(`
    INSERT OR IGNORE INTO applications
      (job_id, title, company, source, status, score, applied_at, cold_email_sent)
    VALUES
      (@jobId, @title, @company, @source, @status, @score, @appliedAt, @coldEmailSent)
  `).run({
    ...record,
    coldEmailSent: record.coldEmailSent ? 1 : 0,
  });
}

export function updateStatus(jobId: string, status: ApplicationRecord['status']): void {
  db.prepare('UPDATE applications SET status = ? WHERE job_id = ?').run(status, jobId);
}

export function getTodaysApplications(): ApplicationRecord[] {
  const today = new Date().toISOString().split('T')[0];
  return db.prepare(`
    SELECT * FROM applications
    WHERE applied_at LIKE ?
    ORDER BY applied_at DESC
  `).all(`${today}%`) as ApplicationRecord[];
}

export function logRun(stats: {
  jobsScraped: number;
  jobsMatched: number;
  jobsApplied: number;
  emailsSent: number;
}): void {
  db.prepare(`
    INSERT INTO run_logs (ran_at, jobs_scraped, jobs_matched, jobs_applied, emails_sent)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    stats.jobsScraped,
    stats.jobsMatched,
    stats.jobsApplied,
    stats.emailsSent
  );
}