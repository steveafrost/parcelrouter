import { ImapClient, ImapConfig } from '../imap/client';
import { parseEmail } from '../parser/email-parser';
import { PackageRepository } from '../db/repositories/package-repository';
import { ParcelClient } from '../parcel/client';
import { getDb, initDb } from '../db/connection';

export interface PollerConfig {
  imap: ImapConfig;
  parcelApiKey: string;
  pollIntervalMinutes?: number;
}

export class EmailPoller {
  private imapClient: ImapClient;
  private parcelClient: ParcelClient;
  private packageRepo: PackageRepository;

  constructor(private config: PollerConfig) {
    this.imapClient = new ImapClient(config.imap);
    this.parcelClient = new ParcelClient(config.parcelApiKey);
    
    // Initialize database
    const db = initDb();
    this.packageRepo = new PackageRepository(db);
  }

  async poll(): Promise<number> {
    console.log('Starting email poll...');

    try {
      // Connect to IMAP
      await this.imapClient.connect();

      // Get last poll time from database
      const lastPoll = this.getLastPollTime();
      console.log(`Fetching emails since ${lastPoll.toISOString()}`);

      // Fetch emails since last poll
      const emails = await this.imapClient.fetchEmails(lastPoll);
      console.log(`Found ${emails.length} emails to process`);

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
        } catch (emailError) {
          console.error(`Error processing email ${email.messageId}: ${emailError}`);
          // Continue with next email
        }
      }

      // Update last poll time
      this.updateLastPollTime();

      console.log(`Poll complete. Processed ${processedCount} new packages.`);
      return processedCount;
    } finally {
      // Always disconnect
      await this.imapClient.disconnect();
    }
  }

  private getLastPollTime(): Date {
    const db = getDb();
    const row = db.prepare('SELECT timestamp FROM last_poll WHERE id = 1').get() as { timestamp: string } | undefined;
    if (row) {
      return new Date(row.timestamp);
    }
    // Default to 24 hours ago
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  private updateLastPollTime(): void {
    const db = getDb();
    db.prepare('UPDATE last_poll SET timestamp = ? WHERE id = 1').run(new Date().toISOString());
  }
}
