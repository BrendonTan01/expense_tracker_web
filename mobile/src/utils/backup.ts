import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AppState } from '../types';

export interface BackupData {
  version: string;
  exportDate: string;
  data: AppState;
}

export const BACKUP_VERSION = '2.0.0';

/** Keep file selection and its read permission in the same Expo module. */
export async function pickBackup(): Promise<BackupData | null> {
  const selection = await File.pickFileAsync({ mimeTypes: ['application/json'], multipleFiles: false });
  if (selection.canceled) return null;
  let content: string;
  try {
    content = await selection.result.text();
  } catch {
    throw new Error('Could not read this backup. Save it to Downloads on your phone, then select it again. No data has been changed.');
  }
  return importFromJSON(content);
}

export function importFromJSON(jsonString: string): BackupData {
  let backup: BackupData;
  try { backup = JSON.parse(jsonString); } catch { throw new Error('Invalid JSON format'); }
  if (!backup || !['1.0.0', BACKUP_VERSION].includes(backup.version) || !backup.data ||
      !['buckets', 'transactions', 'recurringTransactions', 'budgets'].every(key =>
        Array.isArray((backup.data as unknown as Record<string, unknown>)[key]))) {
    throw new Error('Invalid or unsupported backup file');
  }
  if (backup.version === BACKUP_VERSION &&
      (!Array.isArray(backup.data.monthlySummaries) || !Array.isArray(backup.data.yearlySummaries))) {
    throw new Error('Backup is missing summaries');
  }
  return backup;
}

export async function downloadBackup(backup: BackupData, filename?: string): Promise<void> {
  const json = JSON.stringify(backup, null, 2);
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
