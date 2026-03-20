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

  test('stop does not throw when task is null', () => {
    const poller = new EmailPoller({
      imap: mockImapConfig,
      parcelApiKey: 'test-api-key',
    });
    const scheduler = new Scheduler(poller);
    expect(() => scheduler.stop()).not.toThrow();
  });
});
