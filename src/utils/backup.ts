import { AppState } from '../types';

export interface BackupData {
  version: string;
  exportDate: string;
  data: AppState;
}

export const BACKUP_VERSION = '2.0.0';

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

export function downloadBackup(backup: BackupData, filename?: string): void {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `expense-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
