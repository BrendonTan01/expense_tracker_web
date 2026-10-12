import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { hapticSelection } from '../utils/haptics';

type MenuItem = { label: string; description: string; route: string; screen?: string };
const groups: { title: string; items: MenuItem[] }[] = [
  { title: 'Money tools', items: [
    { label: 'Transaction Templates', description: 'Save shortcuts for entries you make often', route: 'Templates' },
    { label: 'Buckets', description: 'Organise expenses into categories', route: 'Buckets' },
    { label: 'Budgets', description: 'Set spending limits for your buckets', route: 'Budgets' },
    { label: 'Recurring Transactions', description: 'Manage repeating income and expenses', route: 'Recurring' },
  ] },
  { title: 'Review', items: [
    { label: 'Transactions', description: 'Search, edit and review your entries', route: 'TransactionsTab', screen: 'TransactionsList' },
    { label: 'Calendar', description: 'Browse your entries by date', route: 'CalendarTab', screen: 'CalendarView' },
    { label: 'Reflections', description: 'Write monthly and yearly notes', route: 'Reflections' },
  ] },
  { title: 'Your data', items: [
    { label: 'Backup & Restore', description: 'Export account data or restore a JSON backup', route: 'Backup' },
  ] },
  { title: 'App', items: [
    { label: 'Settings', description: 'Appearance, tabs, account and sign out', route: 'Settings' },
  ] },
];

export default function MoreScreen({ navigation }: any) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Your tools, account and preferences</Text>
      {groups.map(group => (
        <View key={group.title} style={styles.group}>
          <Text accessibilityRole="header" style={styles.heading}>{group.title}</Text>
          <View style={styles.card}>
            {group.items.map((item, index) => (
              <TouchableOpacity
                key={item.route}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityHint={item.description}
                style={[styles.row, index < group.items.length - 1 && styles.separator]}
                onPress={() => {
                  hapticSelection();
                  if (item.screen) navigation.navigate(item.route, { screen: item.screen, pop: true });
                  else navigation.navigate(item.route);
                }}
              >
                <View style={styles.copy}>
                  <Text style={styles.label}>{item.label}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                </View>
                <Text accessible={false} style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },
    intro: { fontSize: theme.fontSize.md, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg },
    group: { marginBottom: theme.spacing.lg },
    heading: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
    card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, padding: theme.spacing.lg, gap: theme.spacing.md },
    separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
    copy: { flex: 1 },
    label: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
    description: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
    arrow: { fontSize: theme.fontSize.xl, color: theme.colors.textTertiary },
  });
}
