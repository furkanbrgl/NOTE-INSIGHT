import { runSQL, querySQL, queryOneSQL } from './db';
import type { Note, NoteStopInfo } from '../models/types';

interface NoteRow {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  durationMs: number | null;
  languageLock: string | null;
  audioPath: string | null;
  asrModel: string | null;
  llmModel: string | null;
  insightsStatus: string | null;
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    title: row.title,
    durationMs: row.durationMs,
    languageLock: row.languageLock,
    audioPath: row.audioPath,
    asrModel: row.asrModel,
    llmModel: row.llmModel,
    insightsStatus: row.insightsStatus,
  };
}

export function insertNote(note: Note): void {
  runSQL(
    `INSERT INTO notes (id, createdAt, updatedAt, title, durationMs, languageLock, audioPath, asrModel, llmModel, insightsStatus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      note.id,
      note.createdAt,
      note.updatedAt,
      note.title,
      note.durationMs,
      note.languageLock,
      note.audioPath,
      note.asrModel,
      note.llmModel,
      note.insightsStatus,
    ]
  );
}

export function updateNoteStopInfo(noteId: string, info: NoteStopInfo): void {
  runSQL(
    `UPDATE notes SET audioPath = ?, durationMs = ?, languageLock = ?, updatedAt = ? WHERE id = ?`,
    [info.audioPath, info.durationMs, info.languageLock, info.updatedAt, noteId]
  );
}

export function listNotes(limit: number = 50): Note[] {
  const rows = querySQL<NoteRow>(
    `SELECT * FROM notes ORDER BY createdAt DESC LIMIT ?`,
    [limit]
  );
  return rows.map(rowToNote);
}

export function getNote(noteId: string): Note | null {
  const row = queryOneSQL<NoteRow>(`SELECT * FROM notes WHERE id = ?`, [noteId]);
  return row ? rowToNote(row) : null;
}

export function deleteNote(noteId: string): void {
  // Delete from notes - segments are automatically deleted due to FOREIGN KEY ON DELETE CASCADE
  // Since CASCADE is enabled, we only need to delete from notes table
  runSQL(`DELETE FROM notes WHERE id = ?`, [noteId]);
  console.log('[notesRepo] Deleted note and cascaded segments:', noteId);
}

