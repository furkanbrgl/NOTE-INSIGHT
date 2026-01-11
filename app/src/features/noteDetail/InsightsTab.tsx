/**
 * InsightsTab - AI-generated insights from transcript
 *
 * HOW TO TEST:
 * 1. Record a note with speech (at least 20 chars of transcript)
 * 2. Wait for transcription to complete (check Transcript tab)
 * 3. Navigate to Insights tab:
 *    - Should show "Generate Insights" button if no insights exist
 *    - Should show "Transcribing..." if transcription is still in progress
 *    - Should show "No Transcript Yet" if no segments exist
 * 4. Tap "Generate Insights" button
 *    - Should show "Generating..." spinner
 *    - Should display Summary, Key Points, Action Items after generation
 *    - Should show "Regenerate" button in header
 * 5. Close and reopen the note:
 *    - Insights should be loaded from DB (no regeneration needed)
 * 6. Tap "Regenerate" button:
 *    - Should show confirmation alert
 *    - On confirm, should regenerate and overwrite existing insights
 * 7. Test language detection:
 *    - Record in English → insights should be in English
 *    - Record in Turkish → insights should be in Turkish
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { listSegments } from '../../services/storage/segmentsRepo';
import { getNote } from '../../services/storage/notesRepo';
import { getInsight, upsertInsight } from '../../services/storage/insightsRepo';
import { generateInsights } from '../../services/llm/insightsGenerator';
import type { Insight, Segment } from '../../services/models/types';

type InsightsTabParams = {
  Insights: { noteId: string };
};

type InsightsTabRouteProp = RouteProp<InsightsTabParams, 'Insights'>;

type InsightsState = 'loading' | 'no_transcript' | 'transcribing' | 'no_insights' | 'has_insights' | 'generating' | 'error';

export function InsightsTab() {
  const route = useRoute<InsightsTabRouteProp>();
  const { noteId } = route.params;

  const [state, setState] = useState<InsightsState>('loading');
  const [insight, setInsight] = useState<Insight | null>(null);
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  console.log('[InsightsTab] noteId received:', noteId);

  // Load transcript and insights
  const loadData = useCallback(() => {
    console.log('[InsightsTab] loadData called for noteId:', noteId);

    // Load segments
    const segments = listSegments(noteId);
    console.log('[InsightsTab] Loaded segments count:', segments.length);

    // Check if transcription is complete
    const allFinal = segments.length > 0 && segments.every((s: Segment) => s.isFinal);
    const hasSegments = segments.length > 0;

    setIsTranscribing(hasSegments && !allFinal);

    if (!hasSegments) {
      // No segments yet
      setState('no_transcript');
      setTranscriptText('');
      setInsight(null);
      return;
    }

    if (!allFinal) {
      // Still transcribing
      setState('transcribing');
      setTranscriptText('');
      setInsight(null);
      return;
    }

    // Join segments into transcript text
    const text = segments.map((s: Segment) => s.text).join(' ').trim();
    setTranscriptText(text);
    console.log('[InsightsTab] Transcript text length:', text.length);

    if (text.length < 20) {
      // Transcript too short
      setState('no_transcript');
      setInsight(null);
      return;
    }

    // Load existing insight
    const existingInsight = getInsight(noteId);
    if (existingInsight) {
      console.log('[InsightsTab] Found existing insight for noteId:', noteId);
      setInsight(existingInsight);
      setState('has_insights');
    } else {
      console.log('[InsightsTab] No existing insight for noteId:', noteId);
      setInsight(null);
      setState('no_insights');
    }
  }, [noteId]);

  // Load data on focus
  useFocusEffect(
    useCallback(() => {
      console.log('[InsightsTab] useFocusEffect triggered for noteId:', noteId);
      loadData();
    }, [noteId, loadData])
  );

  // Handle generate insights
  const handleGenerate = useCallback(async () => {
    if (transcriptText.length < 20) {
      Alert.alert('Error', 'Transcript is too short to generate insights.');
      return;
    }

    // Get note to get languageLock
    const note = getNote(noteId);
    const languageLock = note?.languageLock || 'auto';

    console.log('[InsightsTab] Generating insights for noteId:', noteId, 'languageLock:', languageLock);

    setState('generating');
    setError(null);

    try {
      // Generate insights
      const result = generateInsights({
        transcriptText,
        language: languageLock as 'auto' | 'auto_en' | 'auto_tr' | 'en' | 'tr',
        noteId,
      });

      // Save to database
      const now = Date.now();
      const insightData: Insight = {
        noteId,
        language: result.language,
        model: result.model,
        summary: result.summary,
        keyPoints: result.keyPoints,
        actionItems: result.actionItems,
        createdAt: now,
        updatedAt: now,
      };

      upsertInsight(insightData);
      console.log('[InsightsTab] Insights saved for noteId:', noteId);

      setInsight(insightData);
      setState('has_insights');
    } catch (err) {
      console.error('[InsightsTab] Error generating insights:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate insights');
      setState('error');
    }
  }, [noteId, transcriptText]);

  // Handle regenerate insights
  const handleRegenerate = useCallback(() => {
    Alert.alert(
      'Regenerate Insights',
      'This will replace the existing insights. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: handleGenerate,
        },
      ]
    );
  }, [handleGenerate]);

  // Render loading state
  if (state === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Render no transcript state
  if (state === 'no_transcript') {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyTitle}>No Transcript Yet</Text>
        <Text style={styles.emptySubtitle}>
          {isTranscribing
            ? 'Transcription is in progress...'
            : 'Complete a recording to generate insights'}
        </Text>
      </View>
    );
  }

  // Render transcribing state
  if (state === 'transcribing') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Transcribing...</Text>
        <Text style={styles.emptySubtitle}>Please wait while the transcript is being generated</Text>
      </View>
    );
  }

  // Render generating state
  if (state === 'generating') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Generating...</Text>
        <Text style={styles.emptySubtitle}>Creating insights from your transcript</Text>
      </View>
    );
  }

  // Render error state
  if (state === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Error</Text>
        <Text style={styles.errorText}>{error || 'Failed to generate insights'}</Text>
        <TouchableOpacity style={styles.button} onPress={handleGenerate}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render no insights state
  if (state === 'no_insights') {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyTitle}>No Insights Yet</Text>
        <Text style={styles.emptySubtitle}>
          Generate AI-powered insights from your transcript
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleGenerate}>
          <Text style={styles.buttonText}>Generate Insights</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render has insights state
  if (state === 'has_insights' && insight) {
    return (
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <TouchableOpacity style={styles.regenerateButton} onPress={handleRegenerate}>
            <Text style={styles.regenerateButtonText}>Regenerate</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.section}>
          <Text style={styles.summaryText}>{insight.summary}</Text>
        </View>

        <Text style={styles.sectionTitle}>Key Points</Text>
        <View style={styles.section}>
          {insight.keyPoints.map((point, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listItemText}>{point}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Action Items</Text>
        <View style={styles.section}>
          {insight.actionItems.map((item, index) => (
            <View key={index} style={styles.listItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listItemText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generated using {insight.model} ({insight.language.toUpperCase()})
          </Text>
          <Text style={styles.footerText}>
            Updated {new Date(insight.updatedAt).toLocaleString()}
          </Text>
        </View>
      </ScrollView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 150,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 24,
    marginBottom: 12,
  },
  section: {
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingRight: 16,
  },
  bullet: {
    fontSize: 16,
    color: '#007AFF',
    marginRight: 8,
    fontWeight: 'bold',
  },
  listItemText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  regenerateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  regenerateButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    marginTop: 32,
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 4,
  },
});
