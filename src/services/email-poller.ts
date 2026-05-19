import { ImapClient, ImapConfig } from '../imap/client';
import { parseEmail } from '../parser/email-parser';
import { PackageRepository } from '../db/repositories/package-repository';
import { ReviewRepository } from '../db/repositories/review-repository';
import { StatsRepository } from '../db/repositories/stats-repository';
import { ParcelClient } from '../parcel/client';
import { getDb, initDb } from '../db/connection';
import { createWebhookDispatcherFromEnv, WebhookDispatcher } from '../webhooks/dispatcher';

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

export class EmailPoller {
  private imapClient: ImapClient;
  private parcelClient: ParcelClient | null;
  private packageRepo: PackageRepository;
  private reviewRepo: ReviewRepository;
  private statsRepo: StatsRepository;
  private webhookDispatcher: WebhookDispatcher;

  constructor(private config: PollerConfig) {
    this.imapClient = new ImapClient(config.imap);
    this.parcelClient = config.parcelApiKey ? new ParcelClient(config.parcelApiKey) : null;
    this.webhookDispatcher = config.webhookDispatcher || createWebhookDispatcherFromEnv();
    
    // Initialize database
    const db = initDb();
    this.packageRepo = new PackageRepository(db);
    this.reviewRepo = new ReviewRepository(db);
    this.statsRepo = new StatsRepository(db);
  }

  async poll(): Promise<number> {
    console.log('Starting email poll...');

    const folders = this.config.folders || [{ name: 'INBOX' }];
    let totalProcessed = 0;

    try {
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
    await this.imapClient.openFolder(folder.name);

    // Get last poll time for this folder
    const lastPoll = this.getLastPollTime(folder.name);
    
    // Respect minDate if set (for Archive, don't go before 03/15/26)
    let sinceDate = lastPoll;
    if (folder.minDate && lastPoll < folder.minDate) {
      sinceDate = folder.minDate;
      console.log(`Using minDate for ${folder.name}: ${sinceDate.toISOString()}`);
    }
    
    console.log(`Fetching emails from ${folder.name} since ${sinceDate.toISOString()}`);

    // Fetch emails since last poll
    const emails = await this.imapClient.fetchEmails(sinceDate);
    console.log(`Found ${emails.length} emails in ${folder.name} to process`);

    // Track total emails read
    this.statsRepo.incrementEmailsRead(emails.length);

    let processedCount = 0;

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
        const pkg = this.packageRepo.create({
          trackingNumber: trackingInfo.trackingNumber,
          carrier: trackingInfo.carrier,
          retailer: trackingInfo.retailer || undefined,
          productName: trackingInfo.productName,
          orderNumber: trackingInfo.orderNumber || undefined,
          emailMessageId: trackingInfo.messageId,
          confidence: trackingInfo.confidence,
        });

        console.log(`Created package: ${pkg.id} for tracking ${pkg.trackingNumber}`);
        await this.webhookDispatcher.dispatch('package.created', {
          package: pkg,
          source: {
            folder: folder.name,
            from: email.from,
            subject: email.subject,
          },
        });

        // Submit to Parcel API when sync is configured.
        if (this.parcelClient) {
          try {
            await this.parcelClient.createPackage({
              trackingNumber: trackingInfo.trackingNumber,
              carrier: trackingInfo.carrier,
              name: trackingInfo.productName,
            });

            console.log(`Submitted to Parcel: ${trackingInfo.trackingNumber}`);
            await this.webhookDispatcher.dispatch('parcel.synced', {
              package: pkg,
            });
          } catch (parcelError) {
            console.error(`Failed to submit to Parcel: ${parcelError}`);
            await this.webhookDispatcher.dispatch('parcel.sync_failed', {
              package: pkg,
              error: String(parcelError),
            });
            // Continue - package is saved in DB and can be retried later
          }
        } else {
          console.log(`Parcel sync disabled; saved ${trackingInfo.trackingNumber} locally`);
        }

        processedCount++;

        // Track package created
        this.statsRepo.incrementPackagesCreated();
      } catch (emailError) {
        console.error(`Error processing email ${email.messageId}: ${emailError}`);
        // Continue with next email
      }
    }

    // Update last poll time for this folder
    this.updateLastPollTime(folder.name);

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
}

function getReviewReason(confidence: string): string {
  if (confidence === 'low') {
    return 'Low confidence detections are held for review because the tracking pattern is broad or easy to confuse with an order number.';
  }

  return 'Medium confidence detections are held for review before sync or automation.';
}
