import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RecordScreen } from '../../features/record/RecordScreen';
import { NotesListScreen } from '../../features/notes/NotesListScreen';
import { SettingsScreen } from '../../features/settings/SettingsScreen';

export type MainTabsParamList = {
  Record: undefined;
  Notes: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        headerShown: true,
        headerTitleAlign: 'center',
      }}
    >
      <Tab.Screen
        name="Record"
        component={RecordScreen}
        options={{
          title: 'Record',
        }}
      />
      <Tab.Screen
        name="Notes"
        component={NotesListScreen}
        options={{
          title: 'Notes',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
}

