import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { listSegments } from '../../services/storage/segmentsRepo';
import { getNote, deleteNote } from '../../services/storage/notesRepo';
import type { Segment } from '../../services/models/types';

type TranscriptTabParams = {
  Transcript: { noteId: string };
};

type TranscriptTabRouteProp = RouteProp<TranscriptTabParams, 'Transcript'>;
type TranscriptTabNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type PlaybackStatus = 'no_audio' | 'loading' | 'playing' | 'paused' | 'stopped';

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function TranscriptTab() {
  const route = useRoute<TranscriptTabRouteProp>();
  const navigation = useNavigation<TranscriptTabNavigationProp>();
  const { noteId } = route.params;
  const [segments, setSegments] = useState<Segment[]>([]);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('loading');
  const soundRef = useRef<Audio.Sound | null>(null);

  const [isTranscribing, setIsTranscribing] = useState(true);
  const [transcriptionFailed, setTranscriptionFailed] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollStartMsRef = useRef<number | null>(null);

  console.log('[TranscriptTab] noteId received:', noteId);

  // Function to load segments
  const loadSegments = useCallback(() => {
    const loadedSegments = listSegments(noteId);
    console.log('[TranscriptTab] Loaded segments count:', loadedSegments.length);
    if (loadedSegments.length > 0) {
      console.log('[TranscriptTab] First segment:', JSON.stringify(loadedSegments[0]));
      setIsTranscribing(false);
      setTranscriptionFailed(false); // Reset failure state when segments appear
      // Stop polling once we have segments
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      pollStartMsRef.current = null; // Reset poll start time
    }
    setSegments(loadedSegments);
    return loadedSegments.length;
  }, [noteId]);

  // Helper function to check if note is invalid
  const isNoteInvalid = useCallback((note: ReturnType<typeof getNote>): boolean => {
    if (!note) return true;
    // Invalid if durationMs <= 0 OR audioPath is missing/empty
    if ((note.durationMs !== null && note.durationMs <= 0) || !note.audioPath || note.audioPath.trim() === '') {
      return true;
    }
    return false;
  }, []);

  // Load note and segments on focus
  useFocusEffect(
    useCallback(() => {
      console.log('[TranscriptTab] useFocusEffect triggered, loading segments for noteId:', noteId);
      
      // Load note first to check validity
      const note = getNote(noteId);
      
      // Check if note is invalid before starting polling
      if (isNoteInvalid(note)) {
        console.log('[TranscriptTab] Note is invalid (durationMs <= 0 or audioPath missing), skipping polling');
        setIsTranscribing(false);
        setTranscriptionFailed(true);
        setSegments([]);
        setAudioPath(null);
        setPlaybackStatus('no_audio');
        pollStartMsRef.current = null;
        return;
      }
      
      // Load segments initially
      const count = loadSegments();
      
      // Reset failure state and poll start time
      setTranscriptionFailed(false);
      pollStartMsRef.current = null;
      
      // If no segments yet, start polling (whisper transcription is async)
      if (count === 0) {
        setIsTranscribing(true);
        pollStartMsRef.current = Date.now(); // Record when polling starts
        console.log('[TranscriptTab] No segments yet, starting poll for transcription...');
        
        // Poll every 1 second for up to 20 seconds
        pollIntervalRef.current = setInterval(() => {
          const pollStartMs = pollStartMsRef.current;
          if (!pollStartMs) {
            // Poll start time not set, stop polling
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            return;
          }
          
          const elapsedMs = Date.now() - pollStartMs;
          
          // Check if note became invalid during polling
          const currentNote = getNote(noteId);
          if (isNoteInvalid(currentNote)) {
            console.log('[TranscriptTab] Note became invalid during polling, stopping');
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsTranscribing(false);
            setTranscriptionFailed(true);
            pollStartMsRef.current = null;
            return;
          }
          
          // Check timeout (20 seconds)
          if (elapsedMs > 20000) {
            console.log('[TranscriptTab] Polling timed out after 20s, no transcription received');
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsTranscribing(false);
            setTranscriptionFailed(true);
            pollStartMsRef.current = null;
            return;
          }
          
          const newCount = loadSegments();
          
          if (newCount > 0) {
            // Segments found, stop polling (handled in loadSegments)
            // No need to do anything here, loadSegments already stops polling
          }
        }, 1000);
      }

      // Load audio path (note already loaded above)
      if (note?.audioPath) {
        console.log('[TranscriptTab] Audio path found:', note.audioPath);
        // Check if file exists (absolute paths from previous installs may not exist)
        FileSystem.getInfoAsync(note.audioPath).then((fileInfo) => {
          if (fileInfo.exists) {
            setAudioPath(note.audioPath);
            setPlaybackStatus('stopped');
          } else {
            console.log('[TranscriptTab] Audio file does not exist:', note.audioPath);
            setAudioPath(null);
            setPlaybackStatus('no_audio');
          }
        }).catch((error) => {
          console.error('[TranscriptTab] Error checking audio file:', error);
          setAudioPath(null);
          setPlaybackStatus('no_audio');
        });
      } else {
        console.log('[TranscriptTab] No audio path for this note');
        setAudioPath(null);
        setPlaybackStatus('no_audio');
      }

      // Cleanup polling on unfocus
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        pollStartMsRef.current = null;
      };
    }, [noteId, loadSegments, isNoteInvalid])
  );

  // Cleanup sound on unmount or noteId change
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        console.log('[TranscriptTab] Unloading sound on cleanup');
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [noteId]);

  const handlePlayPause = async () => {
    if (!audioPath) {
      console.log('[TranscriptTab] No audio path, cannot play');
      return;
    }

    try {
      // If we have a sound loaded
      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        
        if (status.isLoaded) {
          if (status.isPlaying) {
            // Pause
            console.log('[TranscriptTab] Pausing audio');
            await soundRef.current.pauseAsync();
            setPlaybackStatus('paused');
          } else {
            // Resume or play from beginning
            console.log('[TranscriptTab] Resuming/playing audio');
            await soundRef.current.playAsync();
            setPlaybackStatus('playing');
          }
          return;
        }
      }

      // Load and play new sound
      console.log('[TranscriptTab] Loading audio from:', audioPath);
      setPlaybackStatus('loading');

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Ensure the path has file:// prefix for local files
      const audioUri = audioPath.startsWith('file://') ? audioPath : `file://${audioPath}`;
      console.log('[TranscriptTab] Audio URI:', audioUri);

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      soundRef.current = sound;
      setPlaybackStatus('playing');
      console.log('[TranscriptTab] Audio playback started');

    } catch (error: any) {
      console.error('[TranscriptTab] Error playing audio:', error);
      // If file doesn't exist, set to no_audio; otherwise stopped
      if (error?.code === 'EXAV' || error?.message?.includes('doesn\'t exist') || error?.message?.includes('not found')) {
        setPlaybackStatus('no_audio');
        setAudioPath(null); // Clear invalid path
      } else {
        setPlaybackStatus('stopped');
      }
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      if (status.didJustFinish) {
        console.log('[TranscriptTab] Audio playback finished');
        setPlaybackStatus('stopped');
        // Reset to beginning
        soundRef.current?.setPositionAsync(0);
      }
    }
  };

  const getStatusText = (): string => {
    switch (playbackStatus) {
      case 'no_audio':
        return 'No audio';
      case 'loading':
        return 'Loading...';
      case 'playing':
        return 'Playing';
      case 'paused':
        return 'Paused';
      case 'stopped':
        return 'Ready';
      default:
        return '';
    }
  };

  const getButtonText = (): string => {
    switch (playbackStatus) {
      case 'playing':
        return '⏸ Pause';
      case 'paused':
      case 'stopped':
        return '▶ Play';
      default:
        return '▶ Play';
    }
  };

  const isButtonDisabled = playbackStatus === 'no_audio' || playbackStatus === 'loading';

  const renderItem = ({ item }: { item: Segment }) => (
    <View style={styles.segmentItem}>
      <Text style={styles.timestamp}>
        [{formatTimestamp(item.startMs)}-{formatTimestamp(item.endMs)}]
      </Text>
      <Text style={styles.segmentText}>{item.text}</Text>
    </View>
  );

  const handleReRecord = useCallback(() => {
    // Navigate back to MainTabs (which contains Record screen)
    navigation.navigate('MainTabs');
  }, [navigation]);

  const handleDeleteNote = useCallback(() => {
    // Delete note and navigate back to MainTabs
    deleteNote(noteId);
    console.log('[TranscriptTab] Deleted note:', noteId);
    navigation.navigate('MainTabs');
  }, [noteId, navigation]);

  const renderEmpty = () => {
    // Check if note is invalid to show appropriate message
    const note = getNote(noteId);
    const isInvalid = isNoteInvalid(note);
    const showFailureUI = transcriptionFailed || isInvalid;
    
    return (
    <View style={styles.emptyContainer}>
        {showFailureUI ? (
          <>
            <Text style={styles.emptyTitle}>Transcription not available</Text>
            <Text style={styles.emptySubtitle}>
              Recording too short or failed
            </Text>
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.actionButton, styles.reRecordButton]}
                onPress={handleReRecord}
                activeOpacity={0.7}
              >
                <Text style={styles.actionButtonText}>Re-record</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={handleDeleteNote}
                activeOpacity={0.7}
              >
                <Text style={styles.actionButtonText}>Delete note</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : isTranscribing ? (
          <>
            <Text style={styles.emptyTitle}>Transcribing...</Text>
            <Text style={styles.emptySubtitle}>
              Please wait while we process your audio
            </Text>
          </>
        ) : (
          <>
      <Text style={styles.emptyTitle}>No Transcript</Text>
      <Text style={styles.emptySubtitle}>
        No transcript segments available for this note
      </Text>
          </>
        )}
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.playerContainer}>
      <TouchableOpacity
        style={[styles.playButton, isButtonDisabled && styles.playButtonDisabled]}
        onPress={handlePlayPause}
        disabled={isButtonDisabled}
        activeOpacity={0.7}
      >
        <Text style={[styles.playButtonText, isButtonDisabled && styles.playButtonTextDisabled]}>
          {getButtonText()}
        </Text>
      </TouchableOpacity>
      <Text style={styles.statusText}>{getStatusText()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={segments}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={segments.length === 0 ? styles.emptyList : styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  playerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  playButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  playButtonDisabled: {
    backgroundColor: '#ccc',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  playButtonTextDisabled: {
    color: '#888',
  },
  statusText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#666',
  },
  listContent: {
    paddingBottom: 8,
  },
  segmentItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  timestamp: {
    fontSize: 12,
    color: '#007AFF',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  segmentText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyList: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  reRecordButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
