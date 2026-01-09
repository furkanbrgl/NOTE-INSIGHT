import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { Segment } from '../models/types';

const { TranscriptionModule } = NativeModules;

// Event types
export interface AsrPartialEvent {
  noteId: string;
  segments: Omit<Segment, 'id' | 'noteId'>[];
  languageLock?: string | null;
}

export interface AsrFinalEvent {
  noteId: string;
  segments: Omit<Segment, 'id' | 'noteId'>[];
  languageLock?: string | null;
}

export interface RecordingState {
  status: 'idle' | 'recording' | 'stopping';
  noteId: string | null;
  languageMode: string;
  languageLock?: string | null;
}

export interface StartRecordingParams {
  noteId: string;
  languageMode: 'auto' | 'tr' | 'en';
  asrModel: string;
}

export interface StopRecordingResult {
  audioPath: string;
  durationMs: number;
  languageLock: string | null;
}

type EventCallback<T = unknown> = (data: T) => void;

class TranscriptionNativeModule {
  private emitter: NativeEventEmitter | null = null;
  private partialListeners: Set<EventCallback<AsrPartialEvent>> = new Set();
  private finalListeners: Set<EventCallback<AsrFinalEvent>> = new Set();
  private stateListeners: Set<EventCallback<RecordingState>> = new Set();
  private subscriptions: Array<{ remove: () => void }> = [];

  constructor() {
    if (Platform.OS === 'ios' && TranscriptionModule) {
      this.emitter = new NativeEventEmitter(TranscriptionModule);
      this.setupListeners();
    } else {
      console.warn('[TranscriptionNative] Native module not available, using mock');
    }
  }

  private setupListeners(): void {
    if (!this.emitter) return;

    const partialSub = this.emitter.addListener('onAsrPartial', (event: AsrPartialEvent) => {
      this.partialListeners.forEach((cb) => cb(event));
    });

    const finalSub = this.emitter.addListener('onAsrFinal', (event: AsrFinalEvent) => {
      this.finalListeners.forEach((cb) => cb(event));
    });

    const stateSub = this.emitter.addListener('onAsrState', (event: RecordingState) => {
      this.stateListeners.forEach((cb) => cb(event));
    });

    this.subscriptions.push(partialSub, finalSub, stateSub);
  }

  async startRecording(params: StartRecordingParams): Promise<void> {
    if (!TranscriptionModule) {
      console.log('[TranscriptionNative] Mock: startRecording', params);
      return;
    }
    return TranscriptionModule.startRecording(params);
  }

  async stopRecording(noteId: string): Promise<StopRecordingResult> {
    if (!TranscriptionModule) {
      console.log('[TranscriptionNative] Mock: stopRecording', noteId);
      return { audioPath: '', durationMs: 5000, languageLock: 'en' };
    }
    return TranscriptionModule.stopRecording(noteId);
  }

  async setLanguage(noteId: string, mode: 'auto' | 'tr' | 'en'): Promise<void> {
    if (!TranscriptionModule) {
      console.log('[TranscriptionNative] Mock: setLanguage', noteId, mode);
      return;
    }
    return TranscriptionModule.setLanguage(noteId, mode);
  }

  async getState(noteId: string): Promise<RecordingState> {
    if (!TranscriptionModule) {
      console.log('[TranscriptionNative] Mock: getState', noteId);
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
  }
}

// Singleton instance
export const TranscriptionNative = new TranscriptionNativeModule();

