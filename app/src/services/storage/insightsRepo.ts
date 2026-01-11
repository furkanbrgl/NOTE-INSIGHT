import { runSQL, queryOneSQL } from './db';
import type { Insight } from '../models/types';

interface InsightRow {
  noteId: string;
  language: string;
  model: string;
  summary: string;
  keyPointsJson: string;
  actionItemsJson: string;
  createdAt: number;
  updatedAt: number;
}

function rowToInsight(row: InsightRow): Insight {
  return {
    noteId: row.noteId,
    language: row.language as 'en' | 'tr',
    model: row.model,
    summary: row.summary,
    keyPoints: JSON.parse(row.keyPointsJson),
    actionItems: JSON.parse(row.actionItemsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getInsight(noteId: string): Insight | null {
  console.log('[insightsRepo] getInsight called for noteId:', noteId);
  try {
    const row = queryOneSQL<InsightRow>(
      `SELECT * FROM note_insights WHERE noteId = ?`,
      [noteId]
    );
    if (!row) {
      console.log('[insightsRepo] getInsight returned null for noteId:', noteId);
      return null;
    }
    const insight = rowToInsight(row);
    console.log('[insightsRepo] getInsight returned insight for noteId:', noteId);
    return insight;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('no such table: note_insights')) {
      console.warn('[insightsRepo] note_insights table missing, returning null. This should be fixed by db repair check.');
      return null;
    }
    throw error;
  }
}

export function upsertInsight(insight: Insight): void {
  console.log('[insightsRepo] upsertInsight called for noteId:', insight.noteId);
  try {
    runSQL(
      `INSERT INTO note_insights (noteId, language, model, summary, keyPointsJson, actionItemsJson, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(noteId) DO UPDATE SET
         language = excluded.language,
         model = excluded.model,
         summary = excluded.summary,
         keyPointsJson = excluded.keyPointsJson,
         actionItemsJson = excluded.actionItemsJson,
         updatedAt = excluded.updatedAt`,
      [
        insight.noteId,
        insight.language,
        insight.model,
        insight.summary,
        JSON.stringify(insight.keyPoints),
        JSON.stringify(insight.actionItems),
        insight.createdAt,
        insight.updatedAt,
      ]
    );
    console.log('[insightsRepo] upsertInsight completed for noteId:', insight.noteId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('no such table: note_insights')) {
      console.error('[insightsRepo] note_insights table missing. This should be fixed by db repair check.');
      throw new Error('Database table note_insights is missing. Please restart the app.');
    }
    throw error;
  }
}

export function deleteInsight(noteId: string): void {
  console.log('[insightsRepo] deleteInsight called for noteId:', noteId);
  runSQL(`DELETE FROM note_insights WHERE noteId = ?`, [noteId]);
  console.log('[insightsRepo] deleteInsight completed for noteId:', noteId);
  // Note: This is redundant if FOREIGN KEY ON DELETE CASCADE is enabled,
  // but kept for explicit control and clarity
}

