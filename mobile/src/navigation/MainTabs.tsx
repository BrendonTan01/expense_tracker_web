import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../contexts/ThemeContext';
import { useLayout } from '../contexts/LayoutContext';
import SummaryScreen from '../screens/SummaryScreen';
import CalendarScreen from '../screens/CalendarScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import TransactionFormScreen from '../screens/TransactionFormScreen';
import MoreStack from './MoreStack';

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
      <TransactionsStack.Screen name="TransactionForm" component={TransactionFormScreen} options={({ route }: any) => ({ title: route.params?.transaction ? 'Edit Transaction' : 'New Transaction' })} />
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
      <CalendarStack.Screen name="TransactionForm" component={TransactionFormScreen} options={({ route }: any) => ({ title: route.params?.transaction ? 'Edit Transaction' : 'New Transaction' })} />
    </CalendarStack.Navigator>
  );
}

// Placeholder for the Add tab (opens TransactionForm modally)
function AddPlaceholder() {
  return <View />;
}

export default function MainTabs() {
  const { theme } = useTheme();
  const { layout } = useLayout();

  const visibleTabs = layout.tabs.filter(t => t.visible || t.id === 'more');

  return (
    <Tab.Navigator
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
      {visibleTabs.map(tab => {
        switch (tab.id) {
          case 'summary':
            return (
              <Tab.Screen
                key="summary"
                name="SummaryTab"
                component={SummaryScreen}
                options={{
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
                options={{
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
                  tabBarLabel: '',
                  tabBarIcon: ({ size }) => <TabIcon name="add" color={theme.colors.primary} size={size} />,
                }}
                listeners={({ navigation }) => ({
                  tabPress: (e) => {
                    e.preventDefault();
                    navigation.navigate('TransactionsTab', { screen: 'TransactionForm' });
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
                options={{
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
                options={{
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
