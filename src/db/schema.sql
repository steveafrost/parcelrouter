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
  confidence TEXT DEFAULT 'medium',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracking_number ON tracked_packages(tracking_number);
CREATE INDEX IF NOT EXISTS idx_parcel_id ON tracked_packages(parcel_package_id);

-- Review queue for uncertain tracking detections
CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY,
  tracking_number TEXT NOT NULL,
  carrier TEXT NOT NULL,
  retailer TEXT,
  product_name TEXT,
  order_number TEXT,
  email_message_id TEXT UNIQUE,
  source_from TEXT,
  source_subject TEXT,
  confidence TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_review_status ON review_items(status);
CREATE INDEX IF NOT EXISTS idx_review_tracking_number ON review_items(tracking_number);

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

-- Durable retry queue for Parcel API synchronization failures
CREATE TABLE IF NOT EXISTS parcel_sync_jobs (
  id TEXT PRIMARY KEY,
  package_id TEXT UNIQUE NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (package_id) REFERENCES tracked_packages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parcel_sync_due ON parcel_sync_jobs(status, next_attempt_at);

-- Last poll timestamp per folder
CREATE TABLE IF NOT EXISTS last_poll (
  folder TEXT PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Durable IMAP cursor per folder. UIDVALIDITY protects against mailbox rebuilds.
CREATE TABLE IF NOT EXISTS imap_cursors (
  folder TEXT PRIMARY KEY,
  uid_validity TEXT NOT NULL,
  last_uid INTEGER NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stats tracking
CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  emails_read INTEGER DEFAULT 0,
  packages_created INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial stats row
INSERT OR IGNORE INTO stats (id, emails_read, packages_created) VALUES (1, 0, 0);
