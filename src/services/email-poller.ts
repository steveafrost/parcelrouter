import { ImapClient, ImapConfig } from '../imap/client';
import { parseEmail } from '../parser/email-parser';
import { PackageRepository } from '../db/repositories/package-repository';
import { StatsRepository } from '../db/repositories/stats-repository';
import { ParcelClient } from '../parcel/client';
import { getDb, initDb } from '../db/connection';

export interface FolderConfig {
  name: string;
  minDate?: Date; // Optional: don't poll emails before this date
}

export interface PollerConfig {
  imap: ImapConfig;
  parcelApiKey: string;
  pollIntervalMinutes?: number;
  folders?: FolderConfig[]; // Defaults to [{ name: 'INBOX' }]
}

export class EmailPoller {
  private imapClient: ImapClient;
  private parcelClient: ParcelClient;
  private packageRepo: PackageRepository;
  private statsRepo: StatsRepository;

  constructor(private config: PollerConfig) {
    this.imapClient = new ImapClient(config.imap);
    this.parcelClient = new ParcelClient(config.parcelApiKey);
    
    // Initialize database
    const db = initDb();
    this.packageRepo = new PackageRepository(db);
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

        // Save to database
        const pkg = this.packageRepo.create({
          trackingNumber: trackingInfo.trackingNumber,
          carrier: trackingInfo.carrier,
          retailer: trackingInfo.retailer || undefined,
          productName: trackingInfo.productName,
          orderNumber: trackingInfo.orderNumber || undefined,
          emailMessageId: trackingInfo.messageId,
        });

        console.log(`Created package: ${pkg.id} for tracking ${pkg.trackingNumber}`);

        // Submit to Parcel API
        try {
          const parcelPkg = await this.parcelClient.createPackage({
            trackingNumber: trackingInfo.trackingNumber,
            carrier: trackingInfo.carrier,
            name: trackingInfo.productName,
          });

          // Update with Parcel ID
          this.packageRepo.updateParcelId(pkg.id, parcelPkg.id);
          console.log(`Submitted to Parcel: ${parcelPkg.id}`);
        } catch (parcelError) {
          console.error(`Failed to submit to Parcel: ${parcelError}`);
          // Continue - package is saved in DB and can be retried later
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
