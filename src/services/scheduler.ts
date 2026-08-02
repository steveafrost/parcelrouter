import cron, { type ScheduledTask } from 'node-cron';
import { EmailPoller, PollerConfig } from './email-poller';

export class Scheduler {
  private task: ScheduledTask | null = null;
  private activePoll: Promise<number> | null = null;

  constructor(private poller: EmailPoller) {}

  start(cronExpression: string = '0 * * * *'): void { // Default: every hour
    console.log(`Starting scheduler with cron: ${cronExpression}`);
    
    this.task = cron.schedule(cronExpression, async () => {
      console.log('Running scheduled poll...');
      try {
        await this.runNow('scheduled');
      } catch (error) {
        console.error('Scheduled poll failed:', error);
      }
    });

    // Run immediately on start
    console.log('Running initial poll...');
    this.runNow('initial').catch(error => {
      console.error('Initial poll failed:', error);
    });
  }

  async runNow(trigger: 'initial' | 'scheduled' | 'manual' = 'manual'): Promise<number | null> {
    if (this.activePoll) {
      console.warn(`Skipping ${trigger} poll because another poll is still running`);
      return null;
    }

    const poll = this.poller.poll();
    this.activePoll = poll;

    try {
      return await poll;
    } finally {
      if (this.activePoll === poll) {
        this.activePoll = null;
      }
    }
  }

  async stop(): Promise<void> {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('Scheduler stopped');
    }

    if (this.activePoll) {
      console.log('Waiting for active poll to finish...');
      try {
        await this.activePoll;
      } catch (error) {
        console.error('Active poll failed during shutdown:', error);
      }
    }
  }
}

export function createScheduler(config: PollerConfig, cronExpression?: string): Scheduler {
  const poller = new EmailPoller(config);
  const scheduler = new Scheduler(poller);
  scheduler.start(cronExpression);
  return scheduler;
}
