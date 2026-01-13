import { AppState, Transaction, Bucket, RecurringTransaction, Budget } from '../types';

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
    
    // Validate structure
    if (!backup.data || !backup.version) {
      throw new Error('Invalid backup format');
    }
    
    // Validate data structure
    if (!Array.isArray(backup.data.buckets) ||
        !Array.isArray(backup.data.transactions) ||
        !Array.isArray(backup.data.recurringTransactions) ||
        !Array.isArray(backup.data.budgets)) {
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

export function downloadBackup(state: AppState, filename?: string): void {
  const json = exportToJSON(state);
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
