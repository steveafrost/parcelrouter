import cron from 'node-cron';
import { EmailPoller, PollerConfig } from './email-poller';

export class Scheduler {
  private task: cron.ScheduledTask | null = null;

  constructor(private poller: EmailPoller) {}

  start(cronExpression: string = '0 * * * *'): void { // Default: every hour
    console.log(`Starting scheduler with cron: ${cronExpression}`);
    
    this.task = cron.schedule(cronExpression, async () => {
      console.log('Running scheduled poll...');
      try {
        await this.poller.poll();
      } catch (error) {
        console.error('Scheduled poll failed:', error);
      }
    });

    // Run immediately on start
    console.log('Running initial poll...');
    this.poller.poll().catch(error => {
      console.error('Initial poll failed:', error);
    });
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('Scheduler stopped');
    }
  }
}

export function createScheduler(config: PollerConfig, cronExpression?: string): Scheduler {
  const poller = new EmailPoller(config);
  const scheduler = new Scheduler(poller);
  scheduler.start(cronExpression);
  return scheduler;
}
