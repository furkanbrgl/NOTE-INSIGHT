import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { useRecordingStore } from '../../app/store/useRecordingStore';
import { TranscriptionNative } from '../../services/native/TranscriptionNative';
import { TranscriptionCoordinator } from '../../services/pipeline/TranscriptionCoordinator';
import { insertNote, updateNoteStopInfo } from '../../services/storage/notesRepo';
import type { Note } from '../../services/models/types';

type RecordNavigationProp = NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;

// Simple UUID generator (v4-like)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function RecordScreen() {
  const navigation = useNavigation<RecordNavigationProp>();
  const {
    status,
    noteId,
    languageMode,
    languageLock,
    asrModel,
    start,
    stop,
    setNoteId,
    reset,
  } = useRecordingStore();

  // Initialize coordinator on mount
  useEffect(() => {
    TranscriptionCoordinator.initialize();
    return () => {
      // Don't destroy on unmount, keep listening
    };
  }, []);

  const handleStartRecording = useCallback(async () => {
    try {
      // Generate new note ID
      const newNoteId = generateUUID();
      const now = Date.now();

      // Create note in database
      const newNote: Note = {
        id: newNoteId,
        createdAt: now,
        updatedAt: now,
        title: `Recording ${new Date(now).toLocaleString()}`,
        durationMs: null,
        languageLock: null,
        audioPath: null,
        asrModel: asrModel,
        llmModel: null,
        insightsStatus: 'pending',
      };
      insertNote(newNote);

      // Update store
      setNoteId(newNoteId);
      start();

      // Reset coordinator session
      TranscriptionCoordinator.resetSession();

      // Start native recording
      await TranscriptionNative.startRecording({
        noteId: newNoteId,
        languageMode,
        asrModel,
      });

      console.log('[RecordScreen] Recording started:', newNoteId);
    } catch (error) {
      console.error('[RecordScreen] Failed to start recording:', error);
      reset();
    }
  }, [languageMode, asrModel, setNoteId, start, reset]);

  const handleStopRecording = useCallback(async () => {
    if (!noteId) return;

    try {
      stop();

      // Stop native recording
      const result = await TranscriptionNative.stopRecording(noteId);

      // Update note in database
      updateNoteStopInfo(noteId, {
        audioPath: result.audioPath,
        durationMs: result.durationMs,
        languageLock: result.languageLock,
        updatedAt: Date.now(),
      });

      console.log('[RecordScreen] Recording stopped:', result);

      // Navigate to note detail
      const savedNoteId = noteId;
      reset();
      navigation.navigate('NoteDetail', { noteId: savedNoteId });
    } catch (error) {
      console.error('[RecordScreen] Failed to stop recording:', error);
      reset();
    }
  }, [noteId, stop, reset, navigation]);

  const isRecording = status === 'recording';
  const isStopping = status === 'stopping';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Status indicator */}
        <View style={styles.statusContainer}>
          {isRecording && (
            <>
              <View style={styles.recordingDot} />
              <Text style={styles.statusText}>Recording</Text>
              {languageLock && (
                <View style={styles.languageTagContainer}>
                  <Text style={styles.languageTag}>
                    {languageLock.toUpperCase()}
                  </Text>
                </View>
              )}
            </>
          )}
          {isStopping && (
            <Text style={styles.statusText}>Stopping...</Text>
          )}
          {status === 'idle' && (
            <Text style={styles.statusText}>Ready to record</Text>
          )}
        </View>

        {/* Recording status area */}
        <View style={styles.captionsContainer}>
          <ScrollView
            style={styles.captionsScroll}
            contentContainerStyle={styles.captionsContent}
          >
            {isRecording ? (
              <Text style={styles.captionPlaceholder}>
                Recording…{'\n\n'}
                <Text style={styles.captionHint}>
                  Transcription will appear after you stop recording
                </Text>
              </Text>
            ) : (
              <Text style={styles.captionPlaceholder}>
                Tap the button below to start recording
              </Text>
            )}
          </ScrollView>
        </View>

        {/* Record/Stop button */}
        <View style={styles.buttonContainer}>
          {isRecording || isStopping ? (
            <TouchableOpacity
              style={[styles.recordButton, styles.stopButton]}
              onPress={handleStopRecording}
              disabled={isStopping}
              activeOpacity={0.7}
            >
              <View style={styles.stopIcon} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.recordButton}
              onPress={handleStartRecording}
              activeOpacity={0.7}
            >
              <View style={styles.recordIcon} />
            </TouchableOpacity>
          )}
          <Text style={styles.buttonHint}>
            {isRecording || isStopping ? 'Tap to stop' : 'Tap to record'}
          </Text>
          <Text style={styles.buttonLabel}>
            {isRecording || isStopping ? 'Stop' : 'Start Recording'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  languageTagContainer: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  languageTag: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  captionsContainer: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    marginVertical: 16,
  },
  captionsScroll: {
    flex: 1,
  },
  captionsContent: {
    padding: 16,
    flexGrow: 1,
    justifyContent: 'center',
  },
  captionText: {
    fontSize: 18,
    lineHeight: 28,
    color: '#333',
    textAlign: 'center',
  },
  captionPlaceholder: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  captionHint: {
    fontSize: 14,
    color: '#bbb',
    fontStyle: 'italic',
  },
  buttonContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  stopButton: {
    backgroundColor: '#666',
  },
  recordIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  buttonHint: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
  },
  buttonLabel: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});
