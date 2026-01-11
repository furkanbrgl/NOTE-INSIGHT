import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { getNote } from '../../services/storage/notesRepo';
import { TranscriptTab } from './TranscriptTab';
import { InsightsTab } from './InsightsTab';

type NoteDetailRouteProp = RouteProp<RootStackParamList, 'NoteDetail'>;

const TopTab = createMaterialTopTabNavigator();

export function NoteDetailScreen() {
  const route = useRoute<NoteDetailRouteProp>();
  const navigation = useNavigation();
  const { noteId } = route.params;

  console.log('[NoteDetailScreen] noteId from route:', noteId);

  // Get note to display language badge in header
  const note = getNote(noteId);
  const languageLock = note?.languageLock || 'auto';
  const languageBadgeText =
    languageLock === 'tr'
      ? 'TR'
      : languageLock === 'en'
      ? 'EN'
      : languageLock === 'auto'
      ? 'AUTO'
      : languageLock.toUpperCase();

  // Set header options with language badge
  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        languageLock ? (
          <View style={styles.headerBadgeContainer}>
            <Text style={styles.headerBadgeText}>{languageBadgeText}</Text>
          </View>
        ) : null,
    });
  }, [navigation, languageLock, languageBadgeText]);

  return (
    <TopTab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#666',
        tabBarIndicatorStyle: {
          backgroundColor: '#007AFF',
        },
        tabBarLabelStyle: {
          fontWeight: '600',
          textTransform: 'none',
        },
        tabBarStyle: {
          backgroundColor: '#fff',
        },
      }}
    >
      <TopTab.Screen
        name="Transcript"
        component={TranscriptTab}
        initialParams={{ noteId }}
      />
      <TopTab.Screen
        name="Insights"
        component={InsightsTab}
        initialParams={{ noteId }}
      />
    </TopTab.Navigator>
  );
}

const styles = StyleSheet.create({
  headerBadgeContainer: {
    marginRight: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
