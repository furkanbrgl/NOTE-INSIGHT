import { runSQL, querySQL } from './db';
import type { Segment } from '../models/types';

interface SegmentRow {
  id: number;
  noteId: string;
  startMs: number;
  endMs: number;
  text: string;
  isFinal: number;
  lang: string | null;
}

function rowToSegment(row: SegmentRow): Segment {
  return {
    id: row.id,
    noteId: row.noteId,
    startMs: row.startMs,
    endMs: row.endMs,
    text: row.text,
    isFinal: row.isFinal === 1,
    lang: row.lang,
  };
}

export function insertSegments(noteId: string, segments: Omit<Segment, 'id' | 'noteId'>[]): void {
  for (const segment of segments) {
    // Use INSERT OR IGNORE to skip duplicates (based on unique index)
    runSQL(
      `INSERT OR IGNORE INTO segments (noteId, startMs, endMs, text, isFinal, lang)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        noteId,
        segment.startMs,
        segment.endMs,
        segment.text,
        segment.isFinal ? 1 : 0,
        segment.lang,
      ]
    );
  }
}

export function listSegments(noteId: string): Segment[] {
  console.log('[segmentsRepo] listSegments called with noteId:', noteId);
  const rows = querySQL<SegmentRow>(
    `SELECT * FROM segments WHERE noteId = ? ORDER BY startMs ASC`,
    [noteId]
  );
  console.log('[segmentsRepo] listSegments returned', rows.length, 'rows for noteId:', noteId);
  return rows.map(rowToSegment);
}

export function deleteSegmentsForNote(noteId: string): void {
  runSQL(`DELETE FROM segments WHERE noteId = ?`, [noteId]);
  // Note: This is redundant if FOREIGN KEY ON DELETE CASCADE is enabled,
  // but kept for explicit control and clarity
}
