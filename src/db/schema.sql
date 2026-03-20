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
