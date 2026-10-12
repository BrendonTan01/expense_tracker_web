import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { hapticLight } from '../utils/haptics';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { useLayout } from '../contexts/LayoutContext';
import SummaryScreen from '../screens/SummaryScreen';
import CalendarScreen from '../screens/CalendarScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import TransactionFormScreen from '../screens/TransactionFormScreen';
import MoreStack from './MoreStack';
import BucketsScreen from '../screens/BucketsScreen';
import { transactionEntry } from './transactionEntry';

// Simple icon components using basic shapes
function TabIcon({ name, color, size }: { name: string; color: string; size: number }) {
  const s = size;
  switch (name) {
    case 'summary':
      return (
        <View style={{ width: s, height: s, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end' }}>
            <View style={{ width: 4, height: s * 0.4, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: 4, height: s * 0.7, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: 4, height: s * 0.5, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: 4, height: s * 0.9, backgroundColor: color, borderRadius: 1 }} />
          </View>
        </View>
      );
    case 'calendar':
      return (
        <View style={{ width: s, height: s, borderWidth: 2, borderColor: color, borderRadius: 3, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            <View style={{ width: 3, height: 3, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: 3, height: 3, backgroundColor: color, borderRadius: 1 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
            <View style={{ width: 3, height: 3, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: 3, height: 3, backgroundColor: color, borderRadius: 1 }} />
          </View>
        </View>
      );
    case 'add':
      return (
        <View style={{
          width: s + 8, height: s + 8, borderRadius: (s + 8) / 2,
          backgroundColor: color, justifyContent: 'center', alignItems: 'center',
        }}>
          <View style={{ width: s * 0.5, height: 2, backgroundColor: '#fff', position: 'absolute' }} />
          <View style={{ width: 2, height: s * 0.5, backgroundColor: '#fff', position: 'absolute' }} />
        </View>
      );
    case 'transactions':
      return (
        <View style={{ width: s, height: s, justifyContent: 'center', gap: 3 }}>
          <View style={{ width: s, height: 2, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ width: s * 0.7, height: 2, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ width: s * 0.85, height: 2, backgroundColor: color, borderRadius: 1 }} />
        </View>
      );
    case 'more':
      return (
        <View style={{ width: s, height: s, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 3 }}>
          <View style={{ width: 4, height: 4, backgroundColor: color, borderRadius: 2 }} />
          <View style={{ width: 4, height: 4, backgroundColor: color, borderRadius: 2 }} />
          <View style={{ width: 4, height: 4, backgroundColor: color, borderRadius: 2 }} />
        </View>
      );
    default:
      return <View style={{ width: s, height: s, backgroundColor: color, borderRadius: s / 2 }} />;
  }
}

const Tab = createBottomTabNavigator();
const TransactionsStack = createNativeStackNavigator();

function TransactionsStackScreen() {
  const { theme } = useTheme();
  return (
    <TransactionsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <TransactionsStack.Screen name="TransactionsList" component={TransactionsScreen} options={{ title: 'Transactions' }} />
      <TransactionsStack.Screen name="TransactionForm" component={TransactionFormScreen} getId={({ params }: any) => params?.entryId} options={({ route }: any) => ({ title: route.params?.transaction ? 'Edit Transaction' : 'New Transaction' })} />
      <TransactionsStack.Screen name="TransactionBuckets" component={BucketsScreen} options={{ title: 'Create a bucket' }} />
    </TransactionsStack.Navigator>
  );
}

// Calendar stack so we can navigate to transaction form from calendar
const CalendarStack = createNativeStackNavigator();

function CalendarStackScreen() {
  const { theme } = useTheme();
  return (
    <CalendarStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <CalendarStack.Screen name="CalendarView" component={CalendarScreen} options={{ title: 'Calendar' }} />
      <CalendarStack.Screen name="TransactionForm" component={TransactionFormScreen} getId={({ params }: any) => params?.entryId} options={({ route }: any) => ({ title: route.params?.transaction ? 'Edit Transaction' : 'New Transaction' })} />
      <CalendarStack.Screen name="TransactionBuckets" component={BucketsScreen} options={{ title: 'Create a bucket' }} />
    </CalendarStack.Navigator>
  );
}

// Placeholder for the Add action (opens a fresh transaction editor).
function AddPlaceholder() {
  return <View />;
}

export default function MainTabs() {
  const { theme } = useTheme();
  const { layout } = useLayout();

  // Visibility controls tab buttons, never route registration. Add and templates
  // still need TransactionsTab when its button is hidden.
  const registeredTabs = layout.tabs;
  const initialTab = registeredTabs.find(t => t.visible && t.id !== 'add')?.id || 'more';
  const routeNames: Record<string, string> = { summary: 'SummaryTab', calendar: 'CalendarTab', transactions: 'TransactionsTab', more: 'MoreTab' };

  return (
    <Tab.Navigator
      initialRouteName={routeNames[initialTab]}
      screenOptions={{
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.tabBarBorder,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarLabelStyle: { fontSize: theme.fontSize.xs, fontWeight: '500' },
        headerShown: false,
      }}
    >
      {registeredTabs.map(tab => {
        const tabBarItemStyle = !tab.visible && tab.id !== 'more' ? { display: 'none' as const } : undefined;
        switch (tab.id) {
          case 'summary':
              return (
              <Tab.Screen
                key="summary"
                name="SummaryTab"
                component={SummaryScreen}
                listeners={{ tabPress: () => hapticLight() }}
                options={{
                  tabBarItemStyle,
                  tabBarLabel: 'Summary',
                  headerShown: true,
                  headerTitle: 'Dashboard',
                  headerStyle: { backgroundColor: theme.colors.surface },
                  headerTintColor: theme.colors.text,
                  headerTitleStyle: { fontWeight: '700', fontSize: theme.fontSize.xl },
                  headerShadowVisible: false,
                  tabBarIcon: ({ color, size }) => <TabIcon name="summary" color={color} size={size} />,
                }}
              />
            );
          case 'calendar':
            return (
              <Tab.Screen
                key="calendar"
                name="CalendarTab"
                component={CalendarStackScreen}
                listeners={{ tabPress: () => hapticLight() }}
                options={{
                  tabBarItemStyle,
                  tabBarLabel: 'Calendar',
                  tabBarIcon: ({ color, size }) => <TabIcon name="calendar" color={color} size={size} />,
                }}
              />
            );
          case 'add':
            return (
              <Tab.Screen
                key="add"
                name="AddTab"
                component={AddPlaceholder}
                options={{
                  tabBarItemStyle,
                  tabBarLabel: 'Add',
                  tabBarAccessibilityLabel: 'Add transaction',
                  tabBarIcon: ({ size }) => <TabIcon name="add" color={theme.colors.primary} size={size} />,
                }}
                listeners={({ navigation }) => ({
                  tabPress: (e) => {
                    e.preventDefault();
                    hapticLight();
                    navigation.navigate('TransactionsTab', { screen: 'TransactionForm', params: transactionEntry(), initial: false });
                  },
                })}
              />
            );
          case 'transactions':
            return (
              <Tab.Screen
                key="transactions"
                name="TransactionsTab"
                component={TransactionsStackScreen}
                listeners={({ navigation }) => ({
                  tabPress: (e) => {
                    e.preventDefault();
                    hapticLight();
                    // Always show list view when Transactions tab is tapped (pop any stacked screens like TransactionForm)
                    navigation.navigate('TransactionsTab', { screen: 'TransactionsList', pop: true });
                  },
                })}
                options={{
                  tabBarItemStyle,
                  tabBarLabel: 'Transactions',
                  tabBarIcon: ({ color, size }) => <TabIcon name="transactions" color={color} size={size} />,
                }}
              />
            );
          case 'more':
            return (
              <Tab.Screen
                key="more"
                name="MoreTab"
                component={MoreStack}
                listeners={({ navigation }) => ({ tabPress: (e) => {
                  e.preventDefault();
                  hapticLight();
                  navigation.navigate('MoreTab', { screen: 'MoreHome', initial: false, pop: true });
                } })}
                options={{
                  tabBarItemStyle,
                  tabBarLabel: 'More',
                  tabBarIcon: ({ color, size }) => <TabIcon name="more" color={color} size={size} />,
                }}
              />
            );
          default:
            return null;
        }
      })}
    </Tab.Navigator>
  );
}
