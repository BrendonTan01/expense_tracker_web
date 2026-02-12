import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { downloadBackup, importFromJSON } from '../utils/backup';
import { hapticSelection } from '../utils/haptics';
import { bucketsApi, transactionsApi, recurringApi, budgetsApi } from '../utils/api';

export default function BackupScreen() {
  const { theme } = useTheme();
  const { state, refreshAll } = useAppState();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadBackup(state);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to export backup');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled) return;

      const file = result.assets[0];
      setImporting(true);

      const content = await FileSystem.readAsStringAsync(file.uri);
      const backup = importFromJSON(content);

      Alert.alert(
        'Restore Backup',
        `This will replace your current data with:\n${backup.data.buckets.length} buckets\n${backup.data.transactions.length} transactions\n${backup.data.recurringTransactions.length} recurring\n${backup.data.budgets.length} budgets\n\nContinue?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setImporting(false) },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              try {
                // Delete existing data
                for (const b of state.buckets) await bucketsApi.delete(b.id).catch(() => {});
                for (const t of state.transactions) await transactionsApi.delete(t.id).catch(() => {});
                for (const r of state.recurringTransactions) await recurringApi.delete(r.id).catch(() => {});
                for (const b of state.budgets) await budgetsApi.delete(b.id).catch(() => {});

                // Import new data
                for (const b of backup.data.buckets) await bucketsApi.create(b).catch(() => {});
                for (const t of backup.data.transactions) await transactionsApi.create(t).catch(() => {});
                for (const r of backup.data.recurringTransactions) await recurringApi.create(r).catch(() => {});
                for (const b of backup.data.budgets) await budgetsApi.create(b).catch(() => {});

                await refreshAll();
                Alert.alert('Success', 'Backup restored successfully');
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to restore backup');
              } finally {
                setImporting(false);
              }
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to read file');
      setImporting(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Backup & Restore</Text>
        <Text style={styles.subtitle}>Export your data as JSON or restore from a previous backup</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Export</Text>
          <Text style={styles.cardDesc}>
            Download a backup of all your data: {state.buckets.length} buckets, {state.transactions.length} transactions, {state.recurringTransactions.length} recurring, {state.budgets.length} budgets
          </Text>
          <TouchableOpacity
            style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
            onPress={() => { hapticSelection(); handleExport(); }}
            disabled={exporting}
          >
            {exporting ? <ActivityIndicator color="#fff" /> : <Text style={styles.exportBtnText}>Export Backup</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Import</Text>
          <Text style={styles.cardDesc}>
            Restore from a JSON backup file. This will replace all current data.
          </Text>
          <TouchableOpacity
            style={[styles.importBtn, importing && { opacity: 0.6 }]}
            onPress={() => { hapticSelection(); handleImport(); }}
            disabled={importing}
          >
            {importing ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={styles.importBtnText}>Import Backup</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.lg },
    title: { fontSize: theme.fontSize.xxl, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.sm },
    subtitle: { fontSize: theme.fontSize.md, color: theme.colors.textSecondary, marginBottom: theme.spacing.xl },
    card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg, marginBottom: theme.spacing.lg },
    cardTitle: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.text, marginBottom: theme.spacing.sm },
    cardDesc: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg, lineHeight: 20 },
    exportBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, alignItems: 'center' },
    exportBtnText: { color: '#fff', fontSize: theme.fontSize.md, fontWeight: '600' },
    importBtn: { backgroundColor: theme.colors.primary + '15', borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.primary },
    importBtnText: { color: theme.colors.primary, fontSize: theme.fontSize.md, fontWeight: '600' },
  });
}
