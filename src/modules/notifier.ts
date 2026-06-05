import { Telegraf } from 'telegraf';
import { ApplicationRecord, DailyReportStats  } from '../types';
const bot = new Telegraf(process.env.TELEGRAM_TOKEN as string || '');



export async function sendDailyReport(appliedJobs: ApplicationRecord[] , stats: DailyReportStats ): Promise<void> {
  let messageTemplate
  let msg = appliedJobs.map(j =>
    `✅ ${j.title} @ ${j.company}`
  ).join('\n');

  messageTemplate = `
 📊 *Daily Job Report Stats* (${stats.jobsScraped})
 ￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣
 📝 *Total Applied:* ${stats.jobsApplied}
 📅 *Emails Sent:* ${stats.emailsSent}
 -> *MatchedJobs:* ${stats.jobsMatched}
 ⏳ *note:* ${stats.note}
 `;
 
 if(msg)  await bot.telegram.sendMessage(process.env.CHAT_ID as string || '', msg);
  await bot.telegram.sendMessage(process.env.CHAT_ID as string || '', messageTemplate, { parse_mode: 'Markdown' });
}