import { ImapClient, ImapConfig } from '../client';

// Note: These tests require real IMAP credentials
// Set SKIP_IMAP_TESTS=true to skip
const skipTests = process.env.SKIP_IMAP_TESTS === 'true';

(skipTests ? describe.skip : describe)('ImapClient Integration', () => {
  let client: ImapClient;

  const config: ImapConfig = {
    host: process.env.IMAP_HOST || 'imap.mail.me.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASS || '',
  };

  beforeEach(() => {
    if (!config.user || !config.password) {
      throw new Error('IMAP_USER and IMAP_PASS must be set for integration tests');
    }
    client = new ImapClient(config);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  test('connects to iCloud IMAP', async () => {
    await expect(client.connect()).resolves.not.toThrow();
  }, 30000);

  test('fetches emails since date', async () => {
    await client.connect();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const emails = await client.fetchEmails(yesterday);
    expect(Array.isArray(emails)).toBe(true);
  }, 30000);
});

describe('ImapClient Unit', () => {
  test('constructor stores config', () => {
    const config: ImapConfig = {
      host: 'imap.test.com',
      port: 993,
      user: 'test@example.com',
      password: 'password',
    };
    
    const client = new ImapClient(config);
    expect(client).toBeDefined();
  });
});
