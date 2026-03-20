import { EmailPoller } from '../email-poller';
import { ImapConfig } from '../../imap/client';

describe('EmailPoller', () => {
  const mockImapConfig: ImapConfig = {
    host: 'imap.test.com',
    port: 993,
    user: 'test@example.com',
    password: 'password',
  };

  test('constructor creates instances', () => {
    const poller = new EmailPoller({
      imap: mockImapConfig,
      parcelApiKey: 'test-api-key',
    });
    expect(poller).toBeDefined();
  });
});
