import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { TranscriptTab } from './TranscriptTab';
import { InsightsTab } from './InsightsTab';

type NoteDetailRouteProp = RouteProp<RootStackParamList, 'NoteDetail'>;

const TopTab = createMaterialTopTabNavigator();

export function NoteDetailScreen() {
  const route = useRoute<NoteDetailRouteProp>();
  const { noteId } = route.params;

  console.log('[NoteDetailScreen] noteId from route:', noteId);

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
