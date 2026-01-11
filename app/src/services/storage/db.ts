import * as SQLite from 'expo-sqlite';

const DB_NAME = 'noteinsight.db';
const SCHEMA_VERSION = 4; // Increment when schema changes

let db: SQLite.SQLiteDatabase | null = null;

function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    runMigrations(db);
  }
  return db;
}

function runMigrations(database: SQLite.SQLiteDatabase): void {
  // Enable foreign keys (required for CASCADE delete)
  database.execSync('PRAGMA foreign_keys = ON');

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

  // Version 2 -> 3: Ensure languageLock defaults to "auto" for existing notes
  if (currentVersion < 3) {
    console.log('[db] Running migration to version 3 (set default languageLock)');
    
    // Update existing notes with null languageLock to "auto"
    database.execSync(`
      UPDATE notes 
      SET languageLock = 'auto' 
      WHERE languageLock IS NULL;
    `);
    
    console.log('[db] Set default languageLock to "auto" for existing notes');
  }

  // Version 3 -> 4: Add note_insights table
  if (currentVersion < 4) {
    console.log('[db] Running migration to version 4 (add note_insights table)');
    database.execSync(`
      CREATE TABLE IF NOT EXISTS note_insights (
        noteId TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        model TEXT NOT NULL,
        summary TEXT NOT NULL,
        keyPointsJson TEXT NOT NULL,
        actionItemsJson TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_note_insights_noteId ON note_insights(noteId);
    `);
    console.log('[db] Created note_insights table with CASCADE delete');
  }

  // Update schema version
  if (currentVersion < SCHEMA_VERSION) {
    database.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    console.log('[db] Updated schema version to', SCHEMA_VERSION);
  }

  // Repair/sanity check: Verify required tables exist
  // This handles cases where schema version is set but tables are missing
  repairDatabase(database);
}

function repairDatabase(database: SQLite.SQLiteDatabase): void {
  // Check if note_insights table exists
  const tableCheck = database.getFirstSync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='note_insights'`
  );

  // Get current schema version
  const versionResult = database.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = versionResult?.user_version ?? 0;

  // If schema version >= 4 but note_insights table is missing, recreate it
  if (currentVersion >= 4 && !tableCheck) {
    console.log('[db] Repair: note_insights missing, recreating table');
    database.execSync(`
      CREATE TABLE IF NOT EXISTS note_insights (
        noteId TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        model TEXT NOT NULL,
        summary TEXT NOT NULL,
        keyPointsJson TEXT NOT NULL,
        actionItemsJson TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_note_insights_noteId ON note_insights(noteId);
    `);
    console.log('[db] Repair: note_insights table recreated');
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
