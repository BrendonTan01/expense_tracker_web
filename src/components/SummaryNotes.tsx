import { useState, useEffect } from 'react';
import { MonthlySummary, YearlySummary } from '../types';
import { summariesApi } from '../utils/api';

interface SummaryNotesProps {
  type: 'monthly' | 'yearly';
  year: number;
  month?: number; // 1-12 for monthly
}

export default function SummaryNotes({ type, year, month }: SummaryNotesProps) {
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryId, setSummaryId] = useState<string | null>(null);

  useEffect(() => {
    loadSummary();
  }, [type, year, month]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (type === 'monthly' && month) {
        const summaries = await summariesApi.getMonthly(year, month);
        const found = summaries.find(s => s.year === year && s.month === month);
        if (found) {
          setSummary(found.summary || '');
          setSummaryId(found.id);
        } else {
          setSummary('');
          setSummaryId(null);
        }
      } else if (type === 'yearly') {
        const summaries = await summariesApi.getYearly(year);
        const found = summaries.find(s => s.year === year);
        if (found) {
          setSummary(found.summary || '');
          setSummaryId(found.id);
        } else {
          setSummary('');
          setSummaryId(null);
        }
      }
    } catch (err) {
      console.error('Failed to load summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const id = summaryId || `${type}-${year}${month ? `-${month}` : ''}-${Date.now()}`;
      const summaryText = summary.trim();

      if (summaryId) {
        // Update existing summary
        await summariesApi.update(id, summaryText, type);
      } else {
        // Create new summary
        if (type === 'monthly' && month) {
          const newSummary: MonthlySummary = {
            id,
            year,
            month,
            summary: summaryText,
          };
          await summariesApi.create(newSummary);
        } else {
          const newSummary: YearlySummary = {
            id,
            year,
            summary: summaryText,
          };
          await summariesApi.create(newSummary);
        }
        setSummaryId(id);
      }

      // Reload to get the saved data
      await loadSummary();
    } catch (err) {
      console.error('Failed to save summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to save summary');
    } finally {
      setSaving(false);
    }
  };

  const getTitle = () => {
    if (type === 'monthly' && month) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      return `${monthNames[month - 1]} ${year} Summary`;
    }
    return `${year} Year Summary`;
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ 
      marginTop: '32px', 
      padding: '20px', 
      backgroundColor: 'var(--light-bg)', 
      borderRadius: '8px',
      border: '1px solid var(--border-color)'
    }}>
      <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-color)' }}>{getTitle()}</h3>
      
      {error && (
        <div style={{ 
          padding: '12px', 
          backgroundColor: '#ffebee', 
          color: '#c62828',
          borderRadius: '4px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder={`Write your summary for ${type === 'monthly' && month ? `${new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : year}...`}
        style={{
          width: '100%',
          minHeight: '150px',
          padding: '12px',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          fontSize: '14px',
          fontFamily: 'inherit',
          resize: 'vertical',
          boxSizing: 'border-box',
          backgroundColor: 'var(--card-bg)',
          color: 'var(--text-color)',
        }}
      />

      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
          style={{
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save Summary'}
        </button>
      </div>
    </div>
  );
}
