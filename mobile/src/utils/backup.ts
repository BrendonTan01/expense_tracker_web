import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AppState } from '../types';

export interface BackupData {
  version: string;
  exportDate: string;
  data: AppState;
}

export const BACKUP_VERSION = '1.0.0';

export function exportToJSON(state: AppState): string {
  const backup: BackupData = {
    version: BACKUP_VERSION,
    exportDate: new Date().toISOString(),
    data: state,
  };
  return JSON.stringify(backup, null, 2);
}

export function importFromJSON(jsonString: string): BackupData {
  try {
    const backup: BackupData = JSON.parse(jsonString);
    if (!backup.data || !backup.version) {
      throw new Error('Invalid backup format');
    }
    if (
      !Array.isArray(backup.data.buckets) ||
      !Array.isArray(backup.data.transactions) ||
      !Array.isArray(backup.data.recurringTransactions) ||
      !Array.isArray(backup.data.budgets)
    ) {
      throw new Error('Invalid backup data structure');
    }
    return backup;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format');
    }
    throw error;
  }
}

export async function downloadBackup(state: AppState, filename?: string): Promise<void> {
  const json = exportToJSON(state);
  const fname = filename || `expense-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
  const file = new File(Paths.cache, fname);
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export Backup',
      UTI: 'public.json',
    });
  }
}
