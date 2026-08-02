import { Scheduler } from '../scheduler';
import { EmailPoller } from '../email-poller';
import { ImapConfig } from '../../imap/client';

describe('Scheduler', () => {
  const mockImapConfig: ImapConfig = {
    host: 'imap.test.com',
    port: 993,
    user: 'test@example.com',
    password: 'password',
  };

  test('constructor creates scheduler', () => {
    const poller = new EmailPoller({
      imap: mockImapConfig,
      parcelApiKey: 'test-api-key',
    });
    const scheduler = new Scheduler(poller);
    expect(scheduler).toBeDefined();
  });

  test('stop resolves when task is null', async () => {
    const poller = new EmailPoller({
      imap: mockImapConfig,
      parcelApiKey: 'test-api-key',
    });
    const scheduler = new Scheduler(poller);
    await expect(scheduler.stop()).resolves.toBeUndefined();
  });

  test('does not start overlapping polls', async () => {
    let finishPoll: ((value: number) => void) | undefined;
    const poll = jest.fn().mockReturnValue(new Promise<number>(resolve => {
      finishPoll = resolve;
    }));
    const scheduler = new Scheduler({ poll } as unknown as EmailPoller);

    const firstPoll = scheduler.runNow();
    await expect(scheduler.runNow('scheduled')).resolves.toBeNull();
    expect(poll).toHaveBeenCalledTimes(1);

    finishPoll?.(3);
    await expect(firstPoll).resolves.toBe(3);

    poll.mockResolvedValueOnce(1);
    await expect(scheduler.runNow()).resolves.toBe(1);
    expect(poll).toHaveBeenCalledTimes(2);
  });
});
