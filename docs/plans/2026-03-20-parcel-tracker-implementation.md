# ParcelRouter Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Build a self-hosted Docker service that reads iCloud Mail via IMAP, extracts tracking numbers, and auto-submits to Parcel API.

**Architecture:** Node.js/Express service with SQLite database. IMAP poller runs on interval, parses emails, extracts tracking via regex patterns, stores in DB, and auto-submits to Parcel. Minimal REST API for status checks.

**Tech Stack:** Node.js 20, TypeScript, Express, SQLite (better-sqlite3), imap-simple, node-cron, Jest for testing

---

## Phase 1: Project Setup & Dependencies

### Task 1: Initialize Node.js project with TypeScript

**TDD scenario:** Trivial setup - no tests needed

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "parcelrouter",
  "version": "1.0.0",
  "description": "Local-first package tracking and delivery event routing from your inbox",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "dotenv": "^16.4.5",
    "express": "^4.18.3",
    "imap-simple": "^5.1.0",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.9",
    "@types/express": "^4.17.21",
    "@types/imap-simple": "^4.2.9",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.24",
    "@types/node-cron": "^3.0.11",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
data/
.env
*.log
.DS_Store
coverage/
```

**Step 4: Commit**

```bash
git add package.json tsconfig.json .gitignore
git commit -m "chore: initialize node.js project with typescript"
```

---

### Task 2: Install dependencies

**TDD scenario:** Trivial setup - no tests needed

**Step 1: Install all dependencies**

```bash
npm install
```

**Step 2: Create Jest config**

Create `jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};
```

**Step 3: Commit**

```bash
git add jest.config.js package-lock.json
git commit -m "chore: install dependencies and configure jest"
```

---

## Phase 2: Database Layer

### Task 3: Create database schema and connection

**TDD scenario:** New feature - full TDD cycle

**Files:**
- Create: `src/db/connection.ts`
- Create: `src/db/schema.sql`
- Create: `src/db/__tests__/connection.test.ts`

**Step 1: Write failing test**

Create `src/db/__tests__/connection.test.ts`:

```typescript
import { Database } from 'better-sqlite3';
import { getDb, initDb, closeDb } from '../connection';

describe('Database Connection', () => {
  afterEach(() => {
    closeDb();
  });

  test('initDb creates tables', () => {
    const db = initDb(':memory:');
    expect(db).toBeInstanceOf(Database);
    
    // Check tables exist
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[];
    
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('tracked_packages');
    expect(tableNames).toContain('tracking_events');
    expect(tableNames).toContain('last_poll');
  });

  test('getDb returns same instance', () => {
    initDb(':memory:');
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- src/db/__tests__/connection.test.ts
```
Expected: FAIL - modules not found

**Step 3: Create database connection module**

Create `src/db/connection.ts`:

```typescript
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

let db: Database | null = null;

export function initDb(path: string = './data/tracker.db'): Database {
  if (db) return db;
  
  // Ensure data directory exists
  const fs = require('fs');
  const dir = path.substring(0, path.lastIndexOf('/')) || '.';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  db = new Database(path);
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  // Run schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  
  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

**Step 4: Create schema file**

Create `src/db/schema.sql`:

```sql
-- Tracked packages table
CREATE TABLE IF NOT EXISTS tracked_packages (
  id TEXT PRIMARY KEY,
  tracking_number TEXT UNIQUE NOT NULL,
  carrier TEXT NOT NULL,
  retailer TEXT,
  product_name TEXT,
  order_number TEXT,
  email_message_id TEXT UNIQUE,
  parcel_package_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracking_number ON tracked_packages(tracking_number);
CREATE INDEX IF NOT EXISTS idx_parcel_id ON tracked_packages(parcel_package_id);

-- Tracking events from Parcel
CREATE TABLE IF NOT EXISTS tracking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id TEXT NOT NULL,
  status TEXT NOT NULL,
  location TEXT,
  timestamp DATETIME,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (package_id) REFERENCES tracked_packages(id)
);

CREATE INDEX IF NOT EXISTS idx_package_id ON tracking_events(package_id);

-- Last poll timestamp
CREATE TABLE IF NOT EXISTS last_poll (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial row
INSERT OR IGNORE INTO last_poll (id, timestamp) VALUES (1, '1970-01-01');
```

**Step 5: Run test to verify it passes**

```bash
npm test -- src/db/__tests__/connection.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add src/db/
git commit -m "feat: add database connection and schema"
```

---

### Task 4: Create package repository

**TDD scenario:** New feature - full TDD cycle

**Files:**
- Create: `src/db/repositories/package-repository.ts`
- Create: `src/db/__tests__/package-repository.test.ts`

**Step 1: Write failing test**

Create `src/db/__tests__/package-repository.test.ts`:

```typescript
import { initDb, closeDb } from '../connection';
import { PackageRepository } from '../repositories/package-repository';

describe('PackageRepository', () => {
  let repo: PackageRepository;

  beforeEach(() => {
    const db = initDb(':memory:');
    repo = new PackageRepository(db);
  });

  afterEach(() => {
    closeDb();
  });

  test('create inserts package', () => {
    const pkg = repo.create({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      retailer: 'Amazon',
      productName: 'Your order has shipped',
      emailMessageId: '<abc123@amazon.com>',
    });

    expect(pkg.id).toBeDefined();
    expect(pkg.trackingNumber).toBe('1Z999AA10123456784');
    expect(pkg.carrier).toBe('UPS');
  });

  test('findByTrackingNumber returns package', () => {
    repo.create({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      trackingNumber: '1Z999AA10123456784',
    });

    const found = repo.findByTrackingNumber('1Z999AA10123456784');
    expect(found).toBeDefined();
    expect(found?.carrier).toBe('UPS');
  });

  test('findByMessageId returns package', () => {
    repo.create({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      emailMessageId: '<unique@email.com>',
    });

    const found = repo.findByMessageId('<unique@email.com>');
    expect(found).toBeDefined();
  });

  test('exists returns true for existing tracking', () => {
    repo.create({
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
    });

    expect(repo.exists('1Z999AA10123456784')).toBe(true);
    expect(repo.exists('NONEXISTENT')).toBe(false);
  });
});
```

**Step 2: Run test - should fail**

```bash
npm test -- src/db/__tests__/package-repository.test.ts
```

**Step 3: Implement repository**

Create `src/db/repositories/package-repository.ts`:

```typescript
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface Package {
  id: string;
  trackingNumber: string;
  carrier: string;
  retailer?: string;
  productName?: string;
  orderNumber?: string;
  emailMessageId?: string;
  parcelPackageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePackageInput {
  trackingNumber: string;
  carrier: string;
  retailer?: string;
  productName?: string;
  orderNumber?: string;
  emailMessageId?: string;
  parcelPackageId?: string;
}

export class PackageRepository {
  constructor(private db: Database) {}

  create(input: CreatePackageInput): Package {
    const id = randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO tracked_packages 
      (id, tracking_number, carrier, retailer, product_name, order_number, email_message_id, parcel_package_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.trackingNumber,
      input.carrier,
      input.retailer || null,
      input.productName || null,
      input.orderNumber || null,
      input.emailMessageId || null,
      input.parcelPackageId || null,
      now,
      now
    );

    return this.findById(id)!;
  }

  findById(id: string): Package | undefined {
    const row = this.db.prepare('SELECT * FROM tracked_packages WHERE id = ?').get(id);
    return row ? this.mapRow(row) : undefined;
  }

  findByTrackingNumber(trackingNumber: string): Package | undefined {
    const row = this.db.prepare('SELECT * FROM tracked_packages WHERE tracking_number = ?').get(trackingNumber);
    return row ? this.mapRow(row) : undefined;
  }

  findByMessageId(messageId: string): Package | undefined {
    const row = this.db.prepare('SELECT * FROM tracked_packages WHERE email_message_id = ?').get(messageId);
    return row ? this.mapRow(row) : undefined;
  }

  exists(trackingNumber: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM tracked_packages WHERE tracking_number = ?').get(trackingNumber);
    return !!row;
  }

  updateParcelId(id: string, parcelPackageId: string): void {
    this.db.prepare('UPDATE tracked_packages SET parcel_package_id = ?, updated_at = ? WHERE id = ?')
      .run(parcelPackageId, new Date().toISOString(), id);
  }

  findAll(): Package[] {
    const rows = this.db.prepare('SELECT * FROM tracked_packages ORDER BY created_at DESC').all();
    return rows.map(r => this.mapRow(r));
  }

  private mapRow(row: any): Package {
    return {
      id: row.id,
      trackingNumber: row.tracking_number,
      carrier: row.carrier,
      retailer: row.retailer,
      productName: row.product_name,
      orderNumber: row.order_number,
      emailMessageId: row.email_message_id,
      parcelPackageId: row.parcel_package_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
```

**Step 4: Run test - should pass**

```bash
npm test -- src/db/__tests__/package-repository.test.ts
```

**Step 5: Commit**

```bash
git add src/db/
git commit -m "feat: add package repository with CRUD operations"
```

---

## Phase 3: Tracking Number Extraction

### Task 5: Create tracking pattern definitions

**TDD scenario:** New feature - full TDD cycle

**Files:**
- Create: `src/parser/tracking-patterns.ts`
- Create: `src/parser/__tests__/tracking-patterns.test.ts`

**Step 1: Write failing test**

Create `src/parser/__tests__/tracking-patterns.test.ts`:

```typescript
import { extractTrackingNumber, detectCarrier } from '../tracking-patterns';

describe('Tracking Pattern Extraction', () => {
  describe('extractTrackingNumber', () => {
    test('extracts UPS tracking', () => {
      const text = 'Your UPS tracking number is 1Z999AA10123456784';
      expect(extractTrackingNumber(text)).toBe('1Z999AA10123456784');
    });

    test('extracts FedEx 12-digit', () => {
      const text = 'Track: 123456789012';
      expect(extractTrackingNumber(text)).toBe('123456789012');
    });

    test('extracts FedEx 15-digit', () => {
      const text = 'Tracking: 123456789012345';
      expect(extractTrackingNumber(text)).toBe('123456789012345');
    });

    test('extracts USPS', () => {
      const text = 'USPS Tracking # 9400100000000000000000';
      expect(extractTrackingNumber(text)).toBe('9400100000000000000000');
    });

    test('extracts Amazon TBA', () => {
      const text = 'Your Amazon order TBA123456789012';
      expect(extractTrackingNumber(text)).toBe('TBA123456789012');
    });

    test('returns null for no match', () => {
      expect(extractTrackingNumber('No tracking here')).toBeNull();
    });

    test('prefers first match when multiple', () => {
      const text = 'UPS: 1Z999AA10123456784 and FedEx: 123456789012';
      expect(extractTrackingNumber(text)).toBe('1Z999AA10123456784');
    });
  });

  describe('detectCarrier', () => {
    test('detects UPS from number', () => {
      expect(detectCarrier('1Z999AA10123456784')).toBe('UPS');
    });

    test('detects FedEx from 12-digit', () => {
      expect(detectCarrier('123456789012')).toBe('FedEx');
    });

    test('detects USPS', () => {
      expect(detectCarrier('9400100000000000000000')).toBe('USPS');
    });

    test('detects Amazon', () => {
      expect(detectCarrier('TBA123456789012')).toBe('Amazon');
    });

    test('returns Unknown for unmatched', () => {
      expect(detectCarrier('ABC123')).toBe('Unknown');
    });
  });
});
```

**Step 2: Run test - should fail**

```bash
npm test -- src/parser/__tests__/tracking-patterns.test.ts
```

**Step 3: Implement tracking patterns**

Create `src/parser/tracking-patterns.ts`:

```typescript
export interface TrackingPattern {
  carrier: string;
  pattern: RegExp;
}

// Order matters - more specific patterns first
export const TRACKING_PATTERNS: TrackingPattern[] = [
  // UPS - starts with 1Z followed by 16 alphanumeric
  { carrier: 'UPS', pattern: /\b(1Z[A-Z0-9]{16})\b/i },
  
  // Amazon Logistics
  { carrier: 'Amazon', pattern: /\b(TBA[A-Z0-9]{12})\b/i },
  { carrier: 'Amazon', pattern: /\b(TBC[A-Z0-9]{12})\b/i },
  { carrier: 'Amazon', pattern: /\b(TBM[A-Z0-9]{12})\b/i },
  
  // FedEx - 12 or 15 digits
  { carrier: 'FedEx', pattern: /\b(\d{12})\b/ },
  { carrier: 'FedEx', pattern: /\b(\d{15})\b/ },
  
  // USPS - 20-22 digits or XX123456789XX format
  { carrier: 'USPS', pattern: /\b(\d{20,22})\b/ },
  { carrier: 'USPS', pattern: /\b([A-Z]{2}\d{9}[A-Z]{2})\b/i },
  
  // DHL - 10 or 11 digits
  { carrier: 'DHL', pattern: /\b(\d{10,11})\b/ },
  
  // OnTrac - starts with C followed by 14 alphanumeric
  { carrier: 'OnTrac', pattern: /\b(C[A-Z0-9]{14})\b/i },
  
  // Lasership - starts with 1LS or LX or LS followed by alphanumeric
  { carrier: 'LaserShip', pattern: /\b(1LS[A-Z0-9]{12})\b/i },
  { carrier: 'LaserShip', pattern: /\b(LX[A-Z0-9]{10,14})\b/i },
  { carrier: 'LaserShip', pattern: /\b(LS[0-9]{8,12})\b/i },
];

export function extractTrackingNumber(text: string): string | null {
  for (const { pattern } of TRACKING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export function detectCarrier(trackingNumber: string): string {
  for (const { carrier, pattern } of TRACKING_PATTERNS) {
    if (pattern.test(trackingNumber)) {
      return carrier;
    }
  }
  return 'Unknown';
}

// Map sender domains to likely carriers
export const SENDER_CARRIER_MAP: Record<string, string> = {
  'ups.com': 'UPS',
  'fedex.com': 'FedEx',
  'usps.com': 'USPS',
  'dhl.com': 'DHL',
  'amazon.com': 'Amazon',
  'amazon.co.uk': 'Amazon',
  'amazon.ca': 'Amazon',
  'ontrac.com': 'OnTrac',
  'lasership.com': 'LaserShip',
  'shop.app': 'Shopify',
};

export function detectCarrierFromSender(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  
  // Direct match
  if (SENDER_CARRIER_MAP[domain]) {
    return SENDER_CARRIER_MAP[domain];
  }
  
  // Partial match for subdomains
  for (const [senderDomain, carrier] of Object.entries(SENDER_CARRIER_MAP)) {
    if (domain.endsWith('.' + senderDomain) || domain === senderDomain) {
      return carrier;
    }
  }
  
  return null;
}
```

**Step 4: Run test - should pass**

```bash
npm test -- src/parser/__tests__/tracking-patterns.test.ts
```

**Step 5: Commit**

```bash
git add src/parser/
git commit -m "feat: add tracking number extraction patterns"
```

---

### Task 6: Create email parser

**TDD scenario:** New feature - full TDD cycle

**Files:**
- Create: `src/parser/email-parser.ts`
- Create: `src/parser/__tests__/email-parser.test.ts`

**Step 1: Write failing test**

Create `src/parser/__tests__/email-parser.test.ts`:

```typescript
import { parseEmail, shouldProcessEmail, ParsedEmail } from '../email-parser';

describe('Email Parser', () => {
  describe('shouldProcessEmail', () => {
    test('returns true for shipping-related subjects', () => {
      expect(shouldProcessEmail('shipping@amazon.com', 'Your order has shipped')).toBe(true);
      expect(shouldProcessEmail('noreply@fedex.com', 'Tracking update')).toBe(true);
    });

    test('returns false for non-shipping emails', () => {
      expect(shouldProcessEmail('news@company.com', 'Monthly newsletter')).toBe(false);
      expect(shouldProcessEmail('billing@amazon.com', 'Your invoice')).toBe(false);
    });

    test('matches known sender domains', () => {
      expect(shouldProcessEmail('tracking@ups.com', 'Package status')).toBe(true);
      expect(shouldProcessEmail('alerts@fedex.com', 'Delivery scheduled')).toBe(true);
    });
  });

  describe('parseEmail', () => {
    test('parses Amazon shipping email', () => {
      const email: ParsedEmail = {
        messageId: '<abc123@amazon.com>',
        from: 'shipping@amazon.com',
        subject: 'Your Amazon.com order has shipped (#112-1234567-1234567)',
        body: 'Your package with TBA123456789012 is on its way!',
        date: new Date(),
      };

      const result = parseEmail(email);
      expect(result).not.toBeNull();
      expect(result?.trackingNumber).toBe('TBA123456789012');
      expect(result?.carrier).toBe('Amazon');
      expect(result?.retailer).toBe('Amazon');
      expect(result?.productName).toBe('Your Amazon.com order has shipped (#112-1234567-1234567)');
    });

    test('parses UPS shipping email', () => {
      const email: ParsedEmail = {
        messageId: '<ups@ups.com>',
        from: 'tracking@ups.com',
        subject: 'UPS Delivery Notification',
        body: 'Tracking Number: 1Z999AA10123456784',
        date: new Date(),
      };

      const result = parseEmail(email);
      expect(result?.trackingNumber).toBe('1Z999AA10123456784');
      expect(result?.carrier).toBe('UPS');
    });

    test('returns null when no tracking found', () => {
      const email: ParsedEmail = {
        messageId: '<test@test.com>',
        from: 'test@test.com',
        subject: 'Hello',
        body: 'Just saying hi',
        date: new Date(),
      };

      expect(parseEmail(email)).toBeNull();
    });
  });
});
```

**Step 2: Run test - should fail**

```bash
npm test -- src/parser/__tests__/email-parser.test.ts
```

**Step 3: Implement email parser**

Create `src/parser/email-parser.ts`:

```typescript
import { extractTrackingNumber, detectCarrier, detectCarrierFromSender } from './tracking-patterns';

export interface ParsedEmail {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  date: Date;
}

export interface TrackingInfo {
  messageId: string;
  trackingNumber: string;
  carrier: string;
  retailer: string | null;
  productName: string;
  orderNumber: string | null;
}

// Keywords that suggest a shipping email
const SHIPPING_KEYWORDS = [
  'shipped',
  'shipping',
  'tracking',
  'delivered',
  'delivery',
  'out for delivery',
  'package',
  'parcel',
  'order',
  'on its way',
  'in transit',
  'arriving',
];

export function shouldProcessEmail(from: string, subject: string): boolean {
  const subjectLower = subject.toLowerCase();
  
  // Check for shipping keywords in subject
  const hasKeyword = SHIPPING_KEYWORDS.some(keyword => 
    subjectLower.includes(keyword)
  );
  
  // Check if sender is a known shipping/retailer domain
  const senderCarrier = detectCarrierFromSender(from);
  
  return hasKeyword || senderCarrier !== null;
}

export function parseEmail(email: ParsedEmail): TrackingInfo | null {
  // Check if we should process this email
  if (!shouldProcessEmail(email.from, email.subject)) {
    return null;
  }

  // Try to extract tracking number from subject and body
  const searchText = `${email.subject} ${email.body}`;
  const trackingNumber = extractTrackingNumber(searchText);
  
  if (!trackingNumber) {
    return null;
  }

  // Detect carrier from tracking number
  let carrier = detectCarrier(trackingNumber);
  
  // If unknown, try from sender
  if (carrier === 'Unknown') {
    const fromCarrier = detectCarrierFromSender(email.from);
    if (fromCarrier) {
      carrier = fromCarrier;
    }
  }

  // Extract retailer from sender domain
  const retailer = extractRetailer(email.from);

  // Try to extract order number from subject
  const orderNumber = extractOrderNumber(email.subject);

  return {
    messageId: email.messageId,
    trackingNumber,
    carrier,
    retailer,
    productName: email.subject,
    orderNumber,
  };
}

function extractRetailer(from: string): string | null {
  const domain = from.split('@')[1];
  if (!domain) return null;
  
  // Common retailer mappings
  const retailerMap: Record<string, string> = {
    'amazon.com': 'Amazon',
    'amazon.co.uk': 'Amazon UK',
    'amazon.ca': 'Amazon Canada',
    'apple.com': 'Apple',
    'bestbuy.com': 'Best Buy',
    'target.com': 'Target',
    'walmart.com': 'Walmart',
    'ebay.com': 'eBay',
    'etsy.com': 'Etsy',
    'shopify.com': 'Shopify',
  };

  const mainDomain = domain.toLowerCase().split('.').slice(-2).join('.');
  return retailerMap[mainDomain] || null;
}

function extractOrderNumber(subject: string): string | null {
  // Common order number patterns
  const patterns = [
    /#(\d{3}-\d{7}-\d{7})/,  // Amazon format
    /#(\d{9,})/,              // Generic long number
    /order[:\s#]+([A-Z0-9]{6,})/i,  // Order followed by alphanumeric
    /#([A-Z]{2,}\d{6,})/i,    // #XX123456 format
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}
```

**Step 4: Run test - should pass**

```bash
npm test -- src/parser/__tests__/email-parser.test.ts
```

**Step 5: Commit**

```bash
git add src/parser/
git commit -m "feat: add email parser with filtering and extraction"
```

---

## Phase 4: IMAP Integration

### Task 7: Create IMAP client

**TDD scenario:** New feature - full TDD cycle (may need mocks)

**Files:**
- Create: `src/imap/client.ts`
- Create: `src/imap/__tests__/client.test.ts` (integration test - may skip in CI)

**Step 1: Write test (mock-based)**

Create `src/imap/__tests__/client.test.ts`:

```typescript
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
```

**Step 2: Run test - should fail**

```bash
npm test -- src/imap/__tests__/client.test.ts
```

**Step 3: Implement IMAP client**

Create `src/imap/client.ts`:

```typescript
import imaps from 'imap-simple';
import { simpleParser, ParsedMail } from 'mailparser';
import { ParsedEmail } from '../parser/email-parser';

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export class ImapClient {
