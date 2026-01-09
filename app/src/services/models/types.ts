export interface Note {
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

export interface Segment {
  id?: number;
  noteId: string;
  startMs: number;
  endMs: number;
  text: string;
  isFinal: boolean;
  lang: string | null;
}

export interface NoteStopInfo {
  audioPath: string;
  durationMs: number;
  languageLock: string | null;
  updatedAt: number;
}

