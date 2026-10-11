import { useState } from 'react';
import { AppState } from '../types';
import { backupApi } from '../utils/api';
import { importFromJSON, downloadBackup, BackupData } from '../utils/backup';

interface DataBackupProps {
  appState: AppState;
  onImport: (backup: BackupData) => Promise<void>;
}

export default function DataBackup({ onImport }: DataBackupProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      downloadBackup(await backupApi.export());
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to export data');
    } finally { setBusy(false); }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (busy) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      setBusy(true);
      try {
        const content = e.target?.result as string;
        const backup: BackupData = importFromJSON(content);
        
        // Confirm before importing
        if (window.confirm(
          `Import backup from ${new Date(backup.exportDate).toLocaleDateString()}?\n\n` +
          `This will replace your current data:\n` +
          `- ${backup.data.buckets.length} buckets\n` +
          `- ${backup.data.transactions.length} transactions\n` +
          `- ${backup.data.recurringTransactions.length} recurring transactions\n` +
          `- ${backup.data.budgets.length} budgets`
        )) {
          await onImport(backup);
          setImportSuccess(true);
          setImportError(null);
          setTimeout(() => setImportSuccess(false), 3000);
        }
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Failed to import backup');
        setImportSuccess(false);
      } finally { setBusy(false); }
    };
    reader.onerror = () => { setImportError('Could not read backup file'); setBusy(false); };
    reader.readAsText(file);
    
    // Reset input
    event.target.value = '';
  };

  return (
    <div style={{ padding: '20px', background: 'var(--light-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
      <h3 style={{ marginBottom: '16px' }}>Data Backup & Restore</h3>
      <p style={{ marginBottom: '20px', color: 'var(--text-muted)', fontSize: '14px' }}>
        Export saved account records and reflections. Device templates and preferences are not included. Restoring an older backup without reflections keeps existing reflections.
      </p>
      
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button disabled={busy} onClick={handleExport} className="btn btn-primary">
          📥 Export Backup
        </button>
        
        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          📤 Import Backup
          <input
            disabled={busy}
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {importError && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#fee',
          color: '#c33',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          Error: {importError}
        </div>
      )}

      {importSuccess && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#efe',
          color: '#3c3',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          ✓ Backup imported successfully!
        </div>
      )}
    </div>
  );
}
