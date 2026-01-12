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
  
  // Track last active session for final event gating after store reset
  private lastActiveSessionId: string | null = null;
  private lastActiveNoteId: string | null = null;

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

  beginSession(noteId: string, sessionId: string): void {
    this.lastActiveSessionId = sessionId;
    this.lastActiveNoteId = noteId;
    console.log(`[TranscriptionCoordinator] Session started - noteId: ${noteId}, sessionId: ${sessionId}`);
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
    
    // Strict sessionId gating:
    // - If store.sessionId is set (active session), it must match
    // - If store.sessionId is null (store reset), only accept if event matches lastActiveSessionId
    if (store.sessionId) {
      // Active session: must match exactly
      if (store.sessionId !== event.sessionId) {
        console.log(`[TranscriptionCoordinator] Ignoring stale final event - sessionId mismatch (store: ${store.sessionId}, event: ${event.sessionId})`);
        return;
      }
    } else {
      // Store reset: only accept if event matches last active session
      if (event.sessionId !== this.lastActiveSessionId || event.noteId !== this.lastActiveNoteId) {
        console.log(`[TranscriptionCoordinator] Ignoring stale final event - doesn't match last active session (lastActive: ${this.lastActiveSessionId}/${this.lastActiveNoteId}, event: ${event.sessionId}/${event.noteId})`);
        return;
      }
    }
    
    console.log(`[TranscriptionCoordinator] handleFinal for noteId: ${event.noteId}, sessionId: ${event.sessionId}`);

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
      
      // Clear lastActiveSessionId after successful insert to prevent accepting duplicate events
      this.lastActiveSessionId = null;
      this.lastActiveNoteId = null;
    } else {
      console.log(`[TranscriptionCoordinator] No new segments to insert (already existed or empty)`);
    }
  };
}

// Singleton instance
export const TranscriptionCoordinator = new TranscriptionCoordinatorService();
