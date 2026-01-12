import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { Segment } from '../models/types';

const { TranscriptionModule } = NativeModules;

// Event types
export interface AsrPartialEvent {
  noteId: string;
  sessionId: string;
  segments: Omit<Segment, 'id' | 'noteId'>[];
  languageLock?: string | null;
}

export interface AsrFinalEvent {
  noteId: string;
  sessionId: string;
  segments: Omit<Segment, 'id' | 'noteId'>[];
  languageLock?: string | null;
  error?: string;
  durationMs?: number;
}

export interface RecordingState {
  status: 'idle' | 'recording' | 'stopping';
  noteId: string | null;
  sessionId?: string | null;
  languageMode: string;
  languageLock?: string | null;
}

export interface StartRecordingParams {
  noteId: string;
  sessionId: string;
  languageMode: 'auto' | 'tr' | 'en';
  asrModel: string;
}

export interface StopRecordingParams {
  noteId: string;
  sessionId: string;
  languageLock: 'auto' | 'tr' | 'en';
}

export interface StopRecordingResult {
  audioPath: string;
  durationMs: number;
  languageLock: string | null;
  status?: 'ok' | 'deferring_stop' | 'too_short' | 'error';
  error?: string;
}

type EventCallback<T = unknown> = (data: T) => void;

class TranscriptionNativeModule {
  private emitter: NativeEventEmitter | null = null;
  private partialListeners: Set<EventCallback<AsrPartialEvent>> = new Set();
  private finalListeners: Set<EventCallback<AsrFinalEvent>> = new Set();
  private stateListeners: Set<EventCallback<RecordingState>> = new Set();
  private subscriptions: Array<{ remove: () => void }> = [];
  private isInitialized: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (this.isInitialized) return;

    if (Platform.OS === 'ios' && TranscriptionModule) {
      console.log('[TranscriptionNative] Initializing with native module');
      this.emitter = new NativeEventEmitter(TranscriptionModule);
      this.setupListeners();
      this.isInitialized = true;
    } else {
      console.warn('[TranscriptionNative] Native module not available');
    }
  }

  private setupListeners(): void {
    if (!this.emitter) return;

    const partialSub = this.emitter.addListener('onAsrPartial', (event: AsrPartialEvent) => {
      console.log('[TranscriptionNative] onAsrPartial received');
      this.partialListeners.forEach((cb) => cb(event));
    });

    const finalSub = this.emitter.addListener('onAsrFinal', (event: AsrFinalEvent) => {
      console.log('[TranscriptionNative] onAsrFinal received');
      this.finalListeners.forEach((cb) => cb(event));
    });

    const stateSub = this.emitter.addListener('onAsrState', (event: RecordingState) => {
      console.log('[TranscriptionNative] onAsrState received:', event.status);
      this.stateListeners.forEach((cb) => cb(event));
    });

    this.subscriptions.push(partialSub, finalSub, stateSub);
  }

  async startRecording(params: StartRecordingParams): Promise<void> {
    if (!TranscriptionModule) {
      console.warn('[TranscriptionNative] Native module not available, skipping startRecording');
      return;
    }
    console.log('[TranscriptionNative] startRecording called:', params.noteId);
    return TranscriptionModule.startRecording(params);
  }

  async stopRecording(params: StopRecordingParams): Promise<StopRecordingResult> {
    if (!TranscriptionModule) {
      console.warn('[TranscriptionNative] Native module not available, returning mock result');
      return { audioPath: '', durationMs: 5000, languageLock: params.languageLock };
    }
    console.log('[TranscriptionNative] stopRecording called:', params.noteId, 'languageLock:', params.languageLock);
    return TranscriptionModule.stopRecording(params);
  }

  async setLanguage(noteId: string, mode: 'auto' | 'tr' | 'en'): Promise<void> {
    if (!TranscriptionModule) {
      console.warn('[TranscriptionNative] Native module not available, skipping setLanguage');
      return;
    }
    console.log('[TranscriptionNative] setLanguage called:', noteId, mode);
    return TranscriptionModule.setLanguage(noteId, mode);
  }

  async getState(noteId: string): Promise<RecordingState> {
    if (!TranscriptionModule) {
      console.warn('[TranscriptionNative] Native module not available, returning idle state');
      return { status: 'idle', noteId: null, languageMode: 'auto' };
    }
    return TranscriptionModule.getState(noteId);
  }

  // Event subscription methods
  onAsrPartial(callback: EventCallback<AsrPartialEvent>): () => void {
    this.partialListeners.add(callback);
    return () => {
      this.partialListeners.delete(callback);
    };
  }

  onAsrFinal(callback: EventCallback<AsrFinalEvent>): () => void {
    this.finalListeners.add(callback);
    return () => {
      this.finalListeners.delete(callback);
    };
  }

  onAsrState(callback: EventCallback<RecordingState>): () => void {
    this.stateListeners.add(callback);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  // Cleanup
  destroy(): void {
    this.subscriptions.forEach((sub) => sub.remove());
    this.subscriptions = [];
    this.partialListeners.clear();
    this.finalListeners.clear();
    this.stateListeners.clear();
    this.isInitialized = false;
  }
}

// Singleton instance
export const TranscriptionNative = new TranscriptionNativeModule();
