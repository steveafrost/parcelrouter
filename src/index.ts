import dotenv from 'dotenv';
import { startServer } from './api/server';
import { createScheduler } from './services/scheduler';
import { PollerConfig } from './services/email-poller';

// Load environment variables
dotenv.config();

// Validate required environment variables
function validateEnv(): void {
  const required = ['IMAP_USER', 'IMAP_PASS', 'PARCEL_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

async function main(): Promise<void> {
  validateEnv();

  // Archive min date: March 15, 2026
  const archiveMinDate = new Date('2026-03-15T00:00:00Z');

  const config: PollerConfig = {
    imap: {
      host: process.env.IMAP_HOST || 'imap.mail.me.com',
      port: parseInt(process.env.IMAP_PORT || '993', 10),
      user: process.env.IMAP_USER!,
      password: process.env.IMAP_PASS!,
    },
    parcelApiKey: process.env.PARCEL_API_KEY!,
    pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL || '3600', 10) / 60,
    folders: [
      { name: 'INBOX' },
      { name: 'Archive', minDate: archiveMinDate },
    ],
  };

  // Start the scheduler
  const pollIntervalSeconds = parseInt(process.env.POLL_INTERVAL || '3600', 10);
  // Convert to cron: every N minutes
  const cronMinutes = Math.max(1, Math.floor(pollIntervalSeconds / 60));
  const cronExpression = `*/${cronMinutes} * * * *`;
  
  createScheduler(config, cronExpression);
  console.log(`Scheduler started with ${cronMinutes} minute interval`);

  // Start the API server
  const port = parseInt(process.env.PORT || '3000', 10);
  startServer(port);
}

main().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
