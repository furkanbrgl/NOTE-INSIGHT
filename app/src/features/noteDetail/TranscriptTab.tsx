import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { listSegments } from '../../services/storage/segmentsRepo';
import type { Segment } from '../../services/models/types';

type TranscriptTabParams = {
  Transcript: { noteId: string };
};

type TranscriptTabRouteProp = RouteProp<TranscriptTabParams, 'Transcript'>;

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

  console.log('[TranscriptTab] noteId received:', noteId);

  useFocusEffect(
    useCallback(() => {
      console.log('[TranscriptTab] useFocusEffect triggered, loading segments for noteId:', noteId);
      const loadedSegments = listSegments(noteId);
      console.log('[TranscriptTab] Loaded segments count:', loadedSegments.length);
      if (loadedSegments.length > 0) {
        console.log('[TranscriptTab] First segment:', JSON.stringify(loadedSegments[0]));
      }
      setSegments(loadedSegments);
    }, [noteId])
  );

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
      <Text style={styles.emptyTitle}>No Transcript</Text>
      <Text style={styles.emptySubtitle}>
        No transcript segments available for this note
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={segments}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
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
  listContent: {
    paddingVertical: 8,
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
