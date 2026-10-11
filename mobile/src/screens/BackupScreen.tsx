import { useAuth } from '../contexts/AuthContext';
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { downloadBackup, pickBackup } from '../utils/backup';
import { hapticSelection } from '../utils/haptics';
import { backupApi } from '../utils/api';

export default function BackupScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { state, refreshAll } = useAppState();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadBackup(await backupApi.export());
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to export backup');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const backup = await pickBackup();
      if (!backup) { setImporting(false); return; }

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
                if (!user) throw new Error('Sign in before restoring a backup.');
                await backupApi.restore(backup, user.id);
                try { await refreshAll(false); } catch {
                  Alert.alert('Backup restored', 'Your backup was saved, but the screen could not refresh. Reopen the app to load it.');
                  return;
                }
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
            Download your saved account data: {state.buckets.length} buckets, {state.transactions.length} transactions, {state.recurringTransactions.length} recurring, {state.budgets.length} budgets, plus monthly and yearly reflections. Device templates and preferences are not included.
          </Text>
          <TouchableOpacity
            style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
            onPress={() => { hapticSelection(); handleExport(); }}
            disabled={exporting || importing}
          >
            {exporting ? <ActivityIndicator color="#fff" /> : <Text style={styles.exportBtnText}>Export Backup</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Import</Text>
          <Text style={styles.cardDesc}>
            Restore from a JSON backup file. This replaces saved account records together. Older backups without reflections leave existing reflections unchanged. Device templates and preferences are not included.
          </Text>
          <TouchableOpacity
            style={[styles.importBtn, importing && { opacity: 0.6 }]}
            onPress={() => { hapticSelection(); handleImport(); }}
            disabled={importing || exporting}
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
