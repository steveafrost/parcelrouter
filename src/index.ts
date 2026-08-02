import dotenv from 'dotenv';
import { startServer } from './api/server';
import { createScheduler } from './services/scheduler';
import { PollerConfig } from './services/email-poller';
import { closeDb } from './db/connection';

// Load environment variables
dotenv.config();

// Validate required environment variables
function validateEnv(): void {
  const required = ['IMAP_USER', 'IMAP_PASS'];
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
    parcelApiKey: process.env.PARCEL_API_KEY,
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
  
  const scheduler = createScheduler(config, cronExpression);
  console.log(`Scheduler started with ${cronMinutes} minute interval`);
  console.log(process.env.PARCEL_API_KEY ? 'Parcel sync enabled' : 'Parcel sync disabled; packages will stay local');

  // Start the API server
  const port = parseInt(process.env.PORT || '3000', 10);
  const server = startServer(port);
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down gracefully...`);

    try {
      await scheduler.stop();
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
      console.log('Shutdown complete');
    } catch (error) {
      console.error('Graceful shutdown failed:', error);
      process.exitCode = 1;
    } finally {
      closeDb();
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
