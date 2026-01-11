import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { listSegments } from '../../services/storage/segmentsRepo';
import { getNote } from '../../services/storage/notesRepo';
import type { Segment } from '../../services/models/types';

type TranscriptTabParams = {
  Transcript: { noteId: string };
};

type TranscriptTabRouteProp = RouteProp<TranscriptTabParams, 'Transcript'>;

type PlaybackStatus = 'no_audio' | 'loading' | 'playing' | 'paused' | 'stopped';

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function TranscriptTab() {
  const route = useRoute<TranscriptTabRouteProp>();
  const { noteId } = route.params;
  const [segments, setSegments] = useState<Segment[]>([]);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('loading');
  const soundRef = useRef<Audio.Sound | null>(null);

  const [isTranscribing, setIsTranscribing] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  console.log('[TranscriptTab] noteId received:', noteId);

  // Function to load segments
  const loadSegments = useCallback(() => {
    const loadedSegments = listSegments(noteId);
    console.log('[TranscriptTab] Loaded segments count:', loadedSegments.length);
    if (loadedSegments.length > 0) {
      console.log('[TranscriptTab] First segment:', JSON.stringify(loadedSegments[0]));
      setIsTranscribing(false);
      // Stop polling once we have segments
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    setSegments(loadedSegments);
    return loadedSegments.length;
  }, [noteId]);

  // Load note and segments on focus
  useFocusEffect(
    useCallback(() => {
      console.log('[TranscriptTab] useFocusEffect triggered, loading segments for noteId:', noteId);
      
      // Load segments initially
      const count = loadSegments();
      
      // If no segments yet, start polling (whisper transcription is async)
      if (count === 0) {
        setIsTranscribing(true);
        console.log('[TranscriptTab] No segments yet, starting poll for transcription...');
        
        // Poll every 1 second for up to 60 seconds
        let pollCount = 0;
        pollIntervalRef.current = setInterval(() => {
          pollCount++;
          const newCount = loadSegments();
          
          if (newCount > 0 || pollCount >= 60) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsTranscribing(false);
            if (pollCount >= 60 && newCount === 0) {
              console.log('[TranscriptTab] Polling timed out, no transcription received');
            }
          }
        }, 1000);
      }

      // Load note to get audioPath
      const note = getNote(noteId);
      if (note?.audioPath) {
        console.log('[TranscriptTab] Audio path found:', note.audioPath);
        setAudioPath(note.audioPath);
        setPlaybackStatus('stopped');
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
      };
    }, [noteId, loadSegments])
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

    } catch (error) {
      console.error('[TranscriptTab] Error playing audio:', error);
      setPlaybackStatus('stopped');
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

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      {isTranscribing ? (
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
  },
});
