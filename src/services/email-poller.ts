import { ImapClient, ImapConfig } from '../imap/client';
import { parseEmail } from '../parser/email-parser';
import { PackageRepository } from '../db/repositories/package-repository';
import { ReviewRepository } from '../db/repositories/review-repository';
import { StatsRepository } from '../db/repositories/stats-repository';
import { getDb, initDb } from '../db/connection';
import { createWebhookDispatcherFromEnv, WebhookDispatcher } from '../webhooks/dispatcher';
import { ParcelSyncService } from './parcel-sync-service';

export interface FolderConfig {
  name: string;
  minDate?: Date; // Optional: don't poll emails before this date
}

export interface PollerConfig {
  imap: ImapConfig;
  parcelApiKey?: string;
  pollIntervalMinutes?: number;
  folders?: FolderConfig[]; // Defaults to [{ name: 'INBOX' }]
  webhookDispatcher?: WebhookDispatcher;
}

interface StoredImapCursor {
  uidValidity: string;
  lastUid: number;
}

export class EmailPoller {
  private imapClient: ImapClient;
  private parcelSyncService: ParcelSyncService;
  private packageRepo: PackageRepository;
  private reviewRepo: ReviewRepository;
  private statsRepo: StatsRepository;
  private webhookDispatcher: WebhookDispatcher;

  constructor(private config: PollerConfig) {
    this.imapClient = new ImapClient(config.imap);
    this.webhookDispatcher = config.webhookDispatcher || createWebhookDispatcherFromEnv();
    
    // Initialize database
    const db = initDb();
    this.packageRepo = new PackageRepository(db);
    this.reviewRepo = new ReviewRepository(db);
    this.statsRepo = new StatsRepository(db);
    this.parcelSyncService = new ParcelSyncService(db, config.parcelApiKey);
  }

  async poll(): Promise<number> {
    console.log('Starting email poll...');

    const folders = this.config.folders || [{ name: 'INBOX' }];
    let totalProcessed = 0;

    try {
      await this.retryParcelSyncs();

      // Connect to IMAP
      await this.imapClient.connect();

      // Poll each folder
      for (const folder of folders) {
        try {
          const processed = await this.pollFolder(folder);
          totalProcessed += processed;
        } catch (folderError) {
          console.error(`Error polling folder ${folder.name}: ${folderError}`);
          // Continue with next folder
        }
      }

      console.log(`Poll complete. Processed ${totalProcessed} new packages total.`);
      return totalProcessed;
    } finally {
      // Always disconnect
      await this.imapClient.disconnect();
    }
  }

  private async pollFolder(folder: FolderConfig): Promise<number> {
    console.log(`Polling folder: ${folder.name}`);

    // Open the folder
    const mailbox = await this.imapClient.openFolder(folder.name);

    // Get last poll time for this folder
    const lastPoll = this.getLastPollTime(folder.name);
    
    // Respect minDate if set (for Archive, don't go before 03/15/26)
    let sinceDate = lastPoll;
    if (folder.minDate && lastPoll < folder.minDate) {
      sinceDate = folder.minDate;
      console.log(`Using minDate for ${folder.name}: ${sinceDate.toISOString()}`);
    }
    
    console.log(`Fetching emails from ${folder.name} since ${sinceDate.toISOString()}`);

    const cursor = this.getImapCursor(folder.name);
    const cursorMatchesMailbox = cursor?.uidValidity === mailbox.uidValidity;
    const uidRange = cursorMatchesMailbox
      ? { start: cursor.lastUid + 1, end: mailbox.maxUid }
      : undefined;

    if (cursor && !cursorMatchesMailbox) {
      console.warn(`UIDVALIDITY changed for ${folder.name}; rebuilding its IMAP cursor from the date watermark`);
    }

    // UID ranges make steady-state polling deterministic. The date watermark is
    // retained only for the first poll or after a mailbox UIDVALIDITY reset.
    const emails = await this.imapClient.fetchEmails(sinceDate, uidRange);
    console.log(`Found ${emails.length} emails in ${folder.name} to process`);

    // Track total emails read
    this.statsRepo.incrementEmailsRead(emails.length);

    let processedCount = 0;
    let hadProcessingErrors = false;

    for (const email of emails) {
      try {
        // Check if already processed
        if (email.messageId && this.packageRepo.findByMessageId(email.messageId)) {
          console.log(`Skipping already processed email: ${email.messageId}`);
          continue;
        }

        // Parse email for tracking info
        const trackingInfo = parseEmail(email);
        if (!trackingInfo) {
          console.log(`No tracking info found in email: ${email.subject}`);
          continue;
        }

        // Check if tracking number already exists
        if (this.packageRepo.exists(trackingInfo.trackingNumber)) {
          console.log(`Tracking number already exists: ${trackingInfo.trackingNumber}`);
          continue;
        }

        if (this.reviewRepo.pendingExists({
          trackingNumber: trackingInfo.trackingNumber,
          emailMessageId: trackingInfo.messageId,
        })) {
          console.log(`Review item already exists: ${trackingInfo.trackingNumber}`);
          continue;
        }

        if (trackingInfo.confidence !== 'high') {
          const reviewItem = this.reviewRepo.create({
            trackingNumber: trackingInfo.trackingNumber,
            carrier: trackingInfo.carrier,
            retailer: trackingInfo.retailer || undefined,
            productName: trackingInfo.productName,
            orderNumber: trackingInfo.orderNumber || undefined,
            emailMessageId: trackingInfo.messageId,
            sourceFrom: email.from,
            sourceSubject: email.subject,
            confidence: trackingInfo.confidence,
            reason: getReviewReason(trackingInfo.confidence),
          });

          console.log(`Queued review item: ${reviewItem.id} for tracking ${reviewItem.trackingNumber}`);
          await this.webhookDispatcher.dispatch('review.created', {
            reviewItem,
            source: {
              folder: folder.name,
              from: email.from,
              subject: email.subject,
            },
          });
          continue;
        }

        // Save to database
        const pkg = getDb().transaction(() => {
          const created = this.packageRepo.create({
            trackingNumber: trackingInfo.trackingNumber,
            carrier: trackingInfo.carrier,
            retailer: trackingInfo.retailer || undefined,
            productName: trackingInfo.productName,
            orderNumber: trackingInfo.orderNumber || undefined,
            emailMessageId: trackingInfo.messageId,
            confidence: trackingInfo.confidence,
          });
          this.statsRepo.incrementPackagesCreated();
          return created;
        })();

        console.log(`Created package: ${pkg.id} for tracking ${pkg.trackingNumber}`);
        await this.webhookDispatcher.dispatch('package.created', {
          package: pkg,
          source: {
            folder: folder.name,
            from: email.from,
            subject: email.subject,
          },
        });

        // Submit to Parcel API when sync is configured. Failures are persisted
        // and retried on future poll cycles.
        const syncResult = await this.parcelSyncService.syncPackage(pkg);
        if (syncResult.status === 'synced') {
          console.log(`Submitted to Parcel: ${trackingInfo.trackingNumber}`);
          await this.webhookDispatcher.dispatch('parcel.synced', {
            package: syncResult.package,
          });
        } else if (syncResult.status === 'queued') {
          console.error(`Failed to submit to Parcel; retry queued: ${syncResult.error}`);
          await this.webhookDispatcher.dispatch('parcel.sync_failed', {
            package: pkg,
            error: syncResult.error,
            retryQueued: true,
          });
        } else {
          console.log(`Parcel sync disabled; saved ${trackingInfo.trackingNumber} locally`);
        }

        processedCount++;

      } catch (emailError) {
        console.error(`Error processing email ${email.messageId}: ${emailError}`);
        hadProcessingErrors = true;
        // Continue with next email
      }
    }

    if (hadProcessingErrors) {
      console.warn(`Not advancing the IMAP cursor for ${folder.name}; failed messages will be retried`);
    } else {
      this.updateImapCursor(folder.name, mailbox.uidValidity, mailbox.maxUid);
      this.updateLastPollTime(folder.name);
    }

    console.log(`Folder ${folder.name} complete. Processed ${processedCount} new packages.`);
    return processedCount;
  }

  private getLastPollTime(folder: string): Date {
    const db = getDb();
    const row = db.prepare('SELECT timestamp FROM last_poll WHERE folder = ?').get(folder) as { timestamp: string } | undefined;
    if (row) {
      return new Date(row.timestamp);
    }
    // Default to 24 hours ago for new folders
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  private updateLastPollTime(folder: string): void {
    const db = getDb();
    db.prepare(
      'INSERT INTO last_poll (folder, timestamp) VALUES (?, ?) ON CONFLICT(folder) DO UPDATE SET timestamp = excluded.timestamp'
    ).run(folder, new Date().toISOString());
  }

  private getImapCursor(folder: string): StoredImapCursor | undefined {
    const row = getDb().prepare(
      'SELECT uid_validity, last_uid FROM imap_cursors WHERE folder = ?'
    ).get(folder) as { uid_validity: string; last_uid: number } | undefined;

    return row ? { uidValidity: row.uid_validity, lastUid: row.last_uid } : undefined;
  }

  private updateImapCursor(folder: string, uidValidity: string, lastUid: number): void {
    getDb().prepare(`
      INSERT INTO imap_cursors (folder, uid_validity, last_uid, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(folder) DO UPDATE SET
        uid_validity = excluded.uid_validity,
        last_uid = excluded.last_uid,
        updated_at = excluded.updated_at
    `).run(folder, uidValidity, lastUid, new Date().toISOString());
  }

  private async retryParcelSyncs(): Promise<void> {
    const results = await this.parcelSyncService.retryDue();
    for (const result of results) {
      if (result.status === 'synced') {
        console.log(`Retried Parcel sync successfully: ${result.package.trackingNumber}`);
        await this.webhookDispatcher.dispatch('parcel.synced', {
          package: result.package,
          retry: true,
        });
      } else if (result.status === 'queued') {
        console.error(`Parcel retry failed and was rescheduled: ${result.error}`);
        await this.webhookDispatcher.dispatch('parcel.sync_failed', {
          package: result.package,
          error: result.error,
          retryQueued: true,
        });
      }
    }
  }
}

function getReviewReason(confidence: string): string {
  if (confidence === 'low') {
    return 'Low confidence detections are held for review because the tracking pattern is broad or easy to confuse with an order number.';
  }

  return 'Medium confidence detections are held for review before sync or automation.';
}
