import {
  TranscriptionNative,
  type AsrPartialEvent,
  type AsrFinalEvent,
} from '../native/TranscriptionNative';
import { useRecordingStore } from '../../app/store/useRecordingStore';
import { insertSegments } from '../storage/segmentsRepo';
import type { Segment } from '../models/types';

class TranscriptionCoordinatorService {
  private unsubscribePartial: (() => void) | null = null;
  private unsubscribeFinal: (() => void) | null = null;
  private insertedFinalKeys: Set<string> = new Set();

  initialize(): void {
    if (this.unsubscribePartial) return; // Already initialized

    this.unsubscribePartial = TranscriptionNative.onAsrPartial(this.handlePartial);
    this.unsubscribeFinal = TranscriptionNative.onAsrFinal(this.handleFinal);

    console.log('[TranscriptionCoordinator] Initialized');
  }

  destroy(): void {
    this.unsubscribePartial?.();
    this.unsubscribeFinal?.();
    this.unsubscribePartial = null;
    this.unsubscribeFinal = null;
    this.insertedFinalKeys.clear();

    console.log('[TranscriptionCoordinator] Destroyed');
  }

  resetSession(): void {
    this.insertedFinalKeys.clear();
    useRecordingStore.getState().clearPartialSegments();
  }

  private handlePartial = (event: AsrPartialEvent): void => {
    const store = useRecordingStore.getState();
    
    // Verify we're recording the same note
    if (store.noteId !== event.noteId) return;

    // Update language lock if provided
    if (event.languageLock && !store.languageLock) {
      store.setLanguageLock(event.languageLock);
    }

    // Convert to Segment format and update store
    const partialSegments: Segment[] = event.segments.map((seg) => ({
      noteId: event.noteId,
      startMs: seg.startMs,
      endMs: seg.endMs,
      text: seg.text,
      isFinal: false,
      lang: seg.lang ?? null,
    }));

    // Replace partial segments (not append, since partials are cumulative for current utterance)
    useRecordingStore.setState({ partialSegments });
  };

  private handleFinal = (event: AsrFinalEvent): void => {
    const store = useRecordingStore.getState();
    
    // Verify we're recording the same note
    if (store.noteId !== event.noteId) return;

    // Update language lock if provided
    if (event.languageLock && !store.languageLock) {
      store.setLanguageLock(event.languageLock);
    }

    // Deduplicate finals using startMs+endMs+text as key
    const segmentsToInsert: Omit<Segment, 'id' | 'noteId'>[] = [];

    for (const seg of event.segments) {
      const key = `${event.noteId}:${seg.startMs}:${seg.endMs}:${seg.text}`;
      
      if (!this.insertedFinalKeys.has(key)) {
        this.insertedFinalKeys.add(key);
        segmentsToInsert.push({
          startMs: seg.startMs,
          endMs: seg.endMs,
          text: seg.text,
          isFinal: true,
          lang: seg.lang ?? null,
        });
      }
    }

    // Persist to database
    if (segmentsToInsert.length > 0) {
      insertSegments(event.noteId, segmentsToInsert);
      console.log(`[TranscriptionCoordinator] Inserted ${segmentsToInsert.length} final segment(s)`);
    }

    // Do NOT clear partialSegments here - let the next partial naturally replace them
    // This prevents the "Listening..." flicker between final and next partial
  };
}

// Singleton instance
export const TranscriptionCoordinator = new TranscriptionCoordinatorService();
