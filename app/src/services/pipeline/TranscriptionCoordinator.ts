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
    
    // Gate on sessionId: ignore if sessionId doesn't match or is null
    if (!store.sessionId || store.sessionId !== event.sessionId) {
      console.log(`[TranscriptionCoordinator] Ignoring stale partial event - sessionId mismatch (store: ${store.sessionId}, event: ${event.sessionId})`);
      return;
    }
    
    // Verify we're recording the same note
    if (store.noteId !== event.noteId) {
      console.log(`[TranscriptionCoordinator] Ignoring partial event - noteId mismatch (store: ${store.noteId}, event: ${event.noteId})`);
      return;
    }

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
    
    // For final events: sessionId gating is conditional
    // - If store.sessionId is set (we're recording), it must match
    // - If store.sessionId is null (store was reset), allow processing (final events are expected after stop)
    if (store.sessionId && store.sessionId !== event.sessionId) {
      console.log(`[TranscriptionCoordinator] Ignoring stale final event - sessionId mismatch (store: ${store.sessionId}, event: ${event.sessionId})`);
      return;
    }
    
    // Verify noteId matches when available (for safety)
    if (store.noteId && store.noteId !== event.noteId) {
      console.log(`[TranscriptionCoordinator] Ignoring final event - noteId mismatch (store: ${store.noteId}, event: ${event.noteId})`);
      return;
    }
    
    console.log(`[TranscriptionCoordinator] handleFinal for noteId: ${event.noteId}, sessionId: ${event.sessionId}${store.sessionId ? '' : ' (store reset, allowing final event)'}`);

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
      console.log(`[TranscriptionCoordinator] Inserted ${segmentsToInsert.length} final segment(s) for noteId: ${event.noteId}`);
    } else {
      console.log(`[TranscriptionCoordinator] No new segments to insert (already existed or empty)`);
    }
  };
}

// Singleton instance
export const TranscriptionCoordinator = new TranscriptionCoordinatorService();
