import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../screens/SettingsScreen';
import BucketsScreen from '../screens/BucketsScreen';
import BudgetsScreen from '../screens/BudgetsScreen';
import RecurringScreen from '../screens/RecurringScreen';
import ReflectionsScreen from '../screens/ReflectionsScreen';
import BackupScreen from '../screens/BackupScreen';
import { useTheme } from '../contexts/ThemeContext';

const Stack = createNativeStackNavigator();

export default function MoreStack() {
  const { theme } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: theme.fontSize.lg },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Buckets" component={BucketsScreen} options={{ title: 'Buckets' }} />
      <Stack.Screen name="Budgets" component={BudgetsScreen} options={{ title: 'Budgets' }} />
      <Stack.Screen name="Recurring" component={RecurringScreen} options={{ title: 'Recurring' }} />
      <Stack.Screen name="Reflections" component={ReflectionsScreen} options={{ title: 'Reflections' }} />
      <Stack.Screen name="Backup" component={BackupScreen} options={{ title: 'Backup & Restore' }} />
    </Stack.Navigator>
  );
}
