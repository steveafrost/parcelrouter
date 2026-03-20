import DatabaseConstructor from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
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
  
  db = new DatabaseConstructor(path);
  
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
