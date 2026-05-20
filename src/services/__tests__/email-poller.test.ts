import { EmailPoller } from '../email-poller';
import { ImapConfig } from '../../imap/client';
import { closeDb, getDb, initDb } from '../../db/connection';
import { PackageRepository } from '../../db/repositories/package-repository';
import { ReviewRepository } from '../../db/repositories/review-repository';
import { StatsRepository } from '../../db/repositories/stats-repository';
import { parseEmail } from '../../parser/email-parser';
import { ParcelClient } from '../../parcel/client';

const mockConnect = jest.fn();
const mockOpenFolder = jest.fn();
const mockDisconnect = jest.fn();
const mockFetchEmails = jest.fn();
const mockCreatePackage = jest.fn();

jest.mock('../../imap/client', () => ({
  ImapClient: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    openFolder: mockOpenFolder,
    disconnect: mockDisconnect,
    fetchEmails: mockFetchEmails,
  })),
}));

jest.mock('../../parser/email-parser', () => ({
  parseEmail: jest.fn(),
}));

jest.mock('../../parcel/client', () => ({
  ParcelClient: jest.fn().mockImplementation(() => ({
    createPackage: mockCreatePackage,
  })),
}));

describe('EmailPoller', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  const mockImapConfig: ImapConfig = {
    host: 'imap.test.com',
    port: 993,
    user: 'test@example.com',
    password: 'password',
  };

  const mockEmail = {
    messageId: 'message-1',
    from: 'shipping@example.com',
    subject: 'Your package shipped',
    body: 'tracking details',
    date: new Date('2026-05-20T12:00:00Z'),
  };

  const highConfidenceTracking = {
    messageId: 'message-1',
    trackingNumber: '1Z999AA10123456784',
    carrier: 'UPS',
    retailer: 'Example Store',
    productName: 'Example shipment',
    orderNumber: 'ORDER-1',
    confidence: 'high' as const,
  };

  beforeEach(() => {
    closeDb();
    initDb(':memory:');
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetchEmails.mockResolvedValue([mockEmail]);
    mockCreatePackage.mockResolvedValue({ id: 'parcel-1' });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    closeDb();
  });

  test('constructor creates instances', () => {
    const poller = new EmailPoller({
      imap: mockImapConfig,
      parcelApiKey: 'test-api-key',
    });
    expect(poller).toBeDefined();
  });

  test('constructor works without Parcel sync configured', () => {
    const poller = new EmailPoller({
      imap: mockImapConfig,
    });
    expect(poller).toBeDefined();
  });

  test('routes high-confidence detections into tracked packages', async () => {
    (parseEmail as jest.Mock).mockReturnValue(highConfidenceTracking);
    const dispatch = jest.fn().mockResolvedValue(undefined);

    const poller = new EmailPoller({
      imap: mockImapConfig,
      webhookDispatcher: { enabled: true, dispatch } as any,
    });

    const processed = await poller.poll();

    expect(processed).toBe(1);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockOpenFolder).toHaveBeenCalledWith('INBOX');
    expect(mockDisconnect).toHaveBeenCalledTimes(1);

    const packages = new PackageRepository(getDb()).findAll();
    expect(packages).toHaveLength(1);
    expect(packages[0]).toEqual(expect.objectContaining({
      trackingNumber: highConfidenceTracking.trackingNumber,
      carrier: 'UPS',
      productName: 'Example shipment',
      confidence: 'high',
    }));

    expect(new ReviewRepository(getDb()).findPending()).toHaveLength(0);
    expect(new StatsRepository(getDb()).getStats()).toEqual(expect.objectContaining({
      emailsRead: 1,
      packagesCreated: 1,
    }));
    expect(dispatch).toHaveBeenCalledWith('package.created', expect.objectContaining({
      package: expect.objectContaining({ trackingNumber: highConfidenceTracking.trackingNumber }),
      source: expect.objectContaining({ folder: 'INBOX' }),
    }));
  });

  test('holds medium-confidence detections for review instead of creating packages', async () => {
    (parseEmail as jest.Mock).mockReturnValue({
      ...highConfidenceTracking,
      trackingNumber: '94001112062119654321',
      carrier: 'USPS',
      confidence: 'medium',
    });
    const dispatch = jest.fn().mockResolvedValue(undefined);

    const poller = new EmailPoller({
      imap: mockImapConfig,
      webhookDispatcher: { enabled: true, dispatch } as any,
    });

    const processed = await poller.poll();

    expect(processed).toBe(0);
    expect(new PackageRepository(getDb()).findAll()).toHaveLength(0);

    const reviewItems = new ReviewRepository(getDb()).findPending();
    expect(reviewItems).toHaveLength(1);
    expect(reviewItems[0]).toEqual(expect.objectContaining({
      trackingNumber: '94001112062119654321',
      carrier: 'USPS',
      confidence: 'medium',
      sourceFrom: mockEmail.from,
      sourceSubject: mockEmail.subject,
    }));
    expect(new StatsRepository(getDb()).getStats()).toEqual(expect.objectContaining({
      emailsRead: 1,
      packagesCreated: 0,
    }));
    expect(dispatch).toHaveBeenCalledWith('review.created', expect.objectContaining({
      reviewItem: expect.objectContaining({ trackingNumber: '94001112062119654321' }),
    }));
  });

  test('skips duplicate tracking numbers that are already tracked', async () => {
    new PackageRepository(getDb()).create({
      trackingNumber: highConfidenceTracking.trackingNumber,
      carrier: highConfidenceTracking.carrier,
      emailMessageId: 'existing-message',
      confidence: 'high',
    });
    (parseEmail as jest.Mock).mockReturnValue(highConfidenceTracking);
    const dispatch = jest.fn().mockResolvedValue(undefined);

    const poller = new EmailPoller({
      imap: mockImapConfig,
      webhookDispatcher: { enabled: true, dispatch } as any,
    });

    const processed = await poller.poll();

    expect(processed).toBe(0);
    expect(new PackageRepository(getDb()).findAll()).toHaveLength(1);
    expect(new ReviewRepository(getDb()).findPending()).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('keeps local package and emits parcel sync failure when Parcel rejects a sync', async () => {
    (parseEmail as jest.Mock).mockReturnValue(highConfidenceTracking);
    mockCreatePackage.mockRejectedValue(new Error('Parcel unavailable'));
    const dispatch = jest.fn().mockResolvedValue(undefined);

    const poller = new EmailPoller({
      imap: mockImapConfig,
      parcelApiKey: 'parcel-api-key',
      webhookDispatcher: { enabled: true, dispatch } as any,
    });

    const processed = await poller.poll();

    expect(processed).toBe(1);
    expect(ParcelClient).toHaveBeenCalledWith('parcel-api-key');
    expect(mockCreatePackage).toHaveBeenCalledWith({
      trackingNumber: highConfidenceTracking.trackingNumber,
      carrier: highConfidenceTracking.carrier,
      name: highConfidenceTracking.productName,
    });
    expect(new PackageRepository(getDb()).findAll()).toHaveLength(1);
    expect(dispatch).toHaveBeenCalledWith('parcel.sync_failed', expect.objectContaining({
      package: expect.objectContaining({ trackingNumber: highConfidenceTracking.trackingNumber }),
      error: expect.stringContaining('Parcel unavailable'),
    }));
  });
});
