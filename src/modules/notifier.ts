import { Telegraf } from 'telegraf';
import { ApplicationRecord, DailyReportStats  } from '../types';
const bot = new Telegraf(process.env.TELEGRAM_TOKEN as string || '');



export async function sendDailyReport(appliedJobs: ApplicationRecord[] , stats: DailyReportStats): Promise<void> {
  const msg = appliedJobs.map(j =>
    `✅ ${j.title} @ ${j.company}`
  ).join('\n');
  await bot.telegram.sendMessage(process.env.CHAT_ID as string || '', msg);
}