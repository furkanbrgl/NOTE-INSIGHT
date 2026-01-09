import * as SQLite from 'expo-sqlite';

const DB_NAME = 'noteinsight.db';
const SCHEMA_VERSION = 2; // Increment when schema changes

let db: SQLite.SQLiteDatabase | null = null;

function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    runMigrations(db);
  }
  return db;
}

function runMigrations(database: SQLite.SQLiteDatabase): void {
  // Get current schema version
  const versionResult = database.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = versionResult?.user_version ?? 0;

  console.log('[db] Current schema version:', currentVersion);

  // Version 0 -> 1: Initial schema
  if (currentVersion < 1) {
    console.log('[db] Running migration to version 1');
    database.execSync(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        title TEXT NOT NULL,
        durationMs INTEGER,
        languageLock TEXT,
        audioPath TEXT,
        asrModel TEXT,
        llmModel TEXT,
        insightsStatus TEXT
      );

      CREATE TABLE IF NOT EXISTS segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        noteId TEXT NOT NULL,
        startMs INTEGER NOT NULL,
        endMs INTEGER NOT NULL,
        text TEXT NOT NULL,
        isFinal INTEGER NOT NULL DEFAULT 0,
        lang TEXT,
        FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_segments_noteId_startMs ON segments(noteId, startMs);
    `);
  }

  // Version 1 -> 2: Add unique constraint on segments to prevent duplicates
  if (currentVersion < 2) {
    console.log('[db] Running migration to version 2 (add unique constraint)');
    
    // First, delete duplicate segments (keep the one with lowest id)
    database.execSync(`
      DELETE FROM segments 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM segments 
        GROUP BY noteId, startMs, endMs
      );
    `);
    
    // Create unique index to prevent future duplicates
    database.execSync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_segments_unique 
      ON segments(noteId, startMs, endMs);
    `);
    
    console.log('[db] Cleaned up duplicates and added unique index');
  }

  // Update schema version
  if (currentVersion < SCHEMA_VERSION) {
    database.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    console.log('[db] Updated schema version to', SCHEMA_VERSION);
  }
}

export function execSQL(sql: string): void {
  const database = getDatabase();
  database.execSync(sql);
}

export function runSQL(
  sql: string,
  params: SQLite.SQLiteBindParams = []
): SQLite.SQLiteRunResult {
  const database = getDatabase();
  return database.runSync(sql, params);
}

export function querySQL<T = unknown>(
  sql: string,
  params: SQLite.SQLiteBindParams = []
): T[] {
  const database = getDatabase();
  return database.getAllSync<T>(sql, params);
}

export function queryOneSQL<T = unknown>(
  sql: string,
  params: SQLite.SQLiteBindParams = []
): T | null {
  const database = getDatabase();
  return database.getFirstSync<T>(sql, params);
}
