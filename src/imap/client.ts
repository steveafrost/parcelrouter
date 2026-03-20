import imaps from 'imap-simple';
import { ParsedEmail } from '../parser/email-parser';

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export class ImapClient {
  private connection: imaps.ImapSimple | null = null;

  constructor(private config: ImapConfig) {}

  async connect(): Promise<void> {
    const config = {
      imap: {
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: true,
        tlsOptions: {
          rejectUnauthorized: false, // Allow self-signed certs for iCloud
        },
        authTimeout: 30000,
      },
    };

    this.connection = await imaps.connect(config);
    await this.connection.openBox('INBOX');
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  async fetchEmails(since: Date): Promise<ParsedEmail[]> {
    if (!this.connection) {
      throw new Error('Not connected to IMAP server');
    }

    // Search for emails since the given date
    const searchCriteria = [
      ['SINCE', since.toISOString().split('T')[0]], // Format: YYYY-MM-DD
    ];

    const fetchOptions = {
      bodies: ['HEADER', 'TEXT'],
      struct: true,
    };

    const messages = await this.connection.search(searchCriteria, fetchOptions);
    const emails: ParsedEmail[] = [];

    for (const message of messages) {
      const header = message.parts.find(part => part.which === 'HEADER');
      const text = message.parts.find(part => part.which === 'TEXT');

      if (!header || !text) continue;

      const headers = header.body;
      const messageId = headers['message-id']?.[0] || '';
      const fromHeader = headers.from?.[0] || '';
      const subject = headers.subject?.[0] || '';
      const dateStr = headers.date?.[0];
      const date = dateStr ? new Date(dateStr) : new Date();

      // Extract email address from "Name <email@domain.com>" format
      const from = this.extractEmailAddress(fromHeader);
      
      // Get email body text
      const body = typeof text.body === 'string' ? text.body : '';

      emails.push({
        messageId,
        from,
        subject,
        body,
        date,
      });
    }

    return emails;
  }

  private extractEmailAddress(fromHeader: string): string {
    // Match email in format "Name <email@domain.com>" or just "email@domain.com"
    const match = fromHeader.match(/<([^>]+)>/);
    if (match) {
      return match[1];
    }
    // If no angle brackets, assume it's just the email
    if (fromHeader.includes('@')) {
      return fromHeader.trim();
    }
    return '';
  }
}
