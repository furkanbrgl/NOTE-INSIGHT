import { create } from 'zustand';
import type { Segment } from '../../services/models/types';

type RecordingStatus = 'idle' | 'recording' | 'stopping';
type LanguageMode = 'auto' | 'tr' | 'en';
type AsrModel = 'base_q5_1';

interface RecordingState {
  status: RecordingStatus;
  noteId: string | null;
  languageMode: LanguageMode;
  languageLock: string | null;
  asrModel: AsrModel;
  partialSegments: Segment[];
}

interface RecordingActions {
  start: () => void;
  stop: () => void;
  setLanguageMode: (mode: LanguageMode) => void;
  setNoteId: (noteId: string | null) => void;
  setLanguageLock: (lang: string | null) => void;
  setPartialSegments: (segments: Segment[]) => void;
  addPartialSegment: (segment: Segment) => void;
  clearPartialSegments: () => void;
  reset: () => void;
}

const initialState: RecordingState = {
  status: 'idle',
  noteId: null,
  languageMode: 'auto',
  languageLock: null,
  asrModel: 'base_q5_1',
  partialSegments: [],
};

export const useRecordingStore = create<RecordingState & RecordingActions>((set) => ({
  ...initialState,

  start: () =>
    set({
      status: 'recording',
      partialSegments: [],
      languageLock: null,
    }),

  stop: () =>
    set({
      status: 'stopping',
    }),

  setLanguageMode: (mode) =>
    set({
      languageMode: mode,
    }),

  setNoteId: (noteId) =>
    set({
      noteId,
    }),

  setLanguageLock: (lang) =>
    set({
      languageLock: lang,
    }),

  setPartialSegments: (segments) =>
    set({
      partialSegments: segments,
    }),

  addPartialSegment: (segment) =>
    set((state) => ({
      partialSegments: [...state.partialSegments, segment],
    })),

  clearPartialSegments: () =>
    set({
      partialSegments: [],
    }),

  reset: () => set(initialState),
}));

