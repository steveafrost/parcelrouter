import { ImapFlow } from 'imapflow';
import { ParsedEmail } from '../parser/email-parser';

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface MailboxSnapshot {
  uidValidity: string;
  maxUid: number;
}

export interface UidRange {
  start: number;
  end: number;
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

  async openFolder(folderName: string = 'INBOX'): Promise<MailboxSnapshot> {
    if (!this.connection) {
      throw new Error('Not connected to IMAP server');
    }
    const mailbox = await this.connection.mailboxOpen(folderName);
    return {
      uidValidity: mailbox.uidValidity.toString(),
      maxUid: Math.max(0, mailbox.uidNext - 1),
    };
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.logout();
      this.connection = null;
    }
  }

  async fetchEmails(since: Date, uidRange?: UidRange): Promise<ParsedEmail[]> {
    if (!this.connection) {
      throw new Error('Not connected to IMAP server');
    }

    let messageIds: number[] | string;
    if (uidRange) {
      if (uidRange.start > uidRange.end) return [];
      messageIds = `${uidRange.start}:${uidRange.end}`;
    } else {
      const searchResult = await this.connection.search({ since }, { uid: true });
      if (!searchResult || searchResult.length === 0) return [];
      messageIds = searchResult;
    }

    if (Array.isArray(messageIds) && messageIds.length === 0) {
      return [];
    }

    const emails: ParsedEmail[] = [];

    for await (const message of this.connection.fetch(messageIds, {
      uid: true,
      envelope: true,
      source: true,
    }, { uid: true })) {
      const fromAddress = message.envelope?.from?.[0];

      emails.push({
        uid: message.uid,
        messageId: message.envelope?.messageId || '',
        from: fromAddress?.address || '',
        fromName: fromAddress?.name || undefined,
        subject: message.envelope?.subject || '',
        body: message.source?.toString('utf8') || '',
        date: envelopeDate(message.envelope?.date),
      });
    }

    return emails;
  }
}

// imapflow 2 types envelope.date as string | Date; servers that report an
// unparsable INTERNALDATE leave it a string.
function envelopeDate(value: string | Date | undefined): Date {
  if (value instanceof Date) {
    return value;
  }

  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}
