import { ImapFlow } from 'imapflow';
import { ParsedEmail } from '../parser/email-parser';

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export class ImapClient {
  private connection: ImapFlow | null = null;

  constructor(private config: ImapConfig) {}

  async connect(): Promise<void> {
    this.connection = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: true,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
      connectionTimeout: 30000,
      logger: false,
    });

    await this.connection.connect();
  }

  async openFolder(folderName: string = 'INBOX'): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to IMAP server');
    }
    await this.connection.mailboxOpen(folderName);
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.logout();
      this.connection = null;
    }
  }

  async fetchEmails(since: Date): Promise<ParsedEmail[]> {
    if (!this.connection) {
      throw new Error('Not connected to IMAP server');
    }

    const messageIds = await this.connection.search({ since });
    if (!messageIds || messageIds.length === 0) {
      return [];
    }

    const emails: ParsedEmail[] = [];

    for await (const message of this.connection.fetch(messageIds, {
      envelope: true,
      source: true,
    })) {
      const fromAddress = message.envelope?.from?.[0];

      emails.push({
        messageId: message.envelope?.messageId || '',
        from: fromAddress?.address || '',
        fromName: fromAddress?.name || undefined,
        subject: message.envelope?.subject || '',
        body: message.source?.toString('utf8') || '',
        date: message.envelope?.date || new Date(),
      });
    }

    return emails;
  }
}
