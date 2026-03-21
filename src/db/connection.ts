import DatabaseConstructor from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

let db: Database | null = null;

function findSchemaFile(): string {
  // Try multiple locations for schema.sql
  const possiblePaths = [
    join(__dirname, 'schema.sql'),              // Local dev: src/db/schema.sql
    join(__dirname, '../src/db/schema.sql'),    // Docker: dist/../src/db/schema.sql
    join(process.cwd(), 'src/db/schema.sql'),   // Fallback to cwd
    join(process.cwd(), 'db/schema.sql'),       // Alternative structure
  ];
  
  for (const schemaPath of possiblePaths) {
    if (existsSync(schemaPath)) {
      return schemaPath;
    }
  }
  
  throw new Error(`Could not find schema.sql. Tried: ${possiblePaths.join(', ')}`);
}

function migrateLastPollTable(db: Database): void {
  // Check if old last_poll table exists with 'id' column
  const oldTableInfo = db.prepare("PRAGMA table_info(last_poll)").all() as { name: string }[];
  const hasOldSchema = oldTableInfo.some(col => col.name === 'id');
  
  if (hasOldSchema && oldTableInfo.length > 0) {
    console.log('Migrating last_poll table from old schema to new schema...');
    
    // Get the old timestamp
    const oldRow = db.prepare('SELECT timestamp FROM last_poll WHERE id = 1').get() as { timestamp: string } | undefined;
    const oldTimestamp = oldRow?.timestamp || '1970-01-01';
    
    // Drop old table and create new one
    db.exec('DROP TABLE last_poll');
    db.exec(`
      CREATE TABLE last_poll (
        folder TEXT PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Migrate INBOX data
    db.prepare('INSERT INTO last_poll (folder, timestamp) VALUES (?, ?)').run('INBOX', oldTimestamp);
    
    console.log('Migration complete: last_poll table now uses folder-based tracking');
  }
}

export function initDb(path: string = './data/tracker.db'): Database {
  if (db) return db;
  
  // Ensure data directory exists
  const fs = require('fs');
  const dir = path.substring(0, path.lastIndexOf('/')) || '.';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  db = new DatabaseConstructor(path);
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  // Run schema
  const schemaPath = findSchemaFile();
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  
  // Run migrations
  migrateLastPollTable(db);
  
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
