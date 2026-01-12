import { useState, useEffect, useMemo } from 'react';
import { MonthlySummary, YearlySummary } from '../types';
import { summariesApi } from '../utils/api';
import SummaryNotes from './SummaryNotes';

export default function Reflections() {
  const [yearlySummaries, setYearlySummaries] = useState<YearlySummary[]>([]);
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all summaries on mount
  useEffect(() => {
    loadSummaries();
  }, []);

  const loadSummaries = async () => {
    try {
      setLoading(true);
      setError(null);
      const [yearly, monthly] = await Promise.all([
        summariesApi.getYearly(),
        summariesApi.getMonthly(),
      ]);
      setYearlySummaries(yearly);
      setMonthlySummaries(monthly);
    } catch (err) {
      console.error('Failed to load summaries:', err);
      setError(err instanceof Error ? err.message : 'Failed to load reflections');
    } finally {
      setLoading(false);
    }
  };

  // Get all unique years from both yearly and monthly summaries
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    yearlySummaries.forEach(s => years.add(s.year));
    monthlySummaries.forEach(s => years.add(s.year));
    return Array.from(years).sort((a, b) => b - a); // Sort descending (newest first)
  }, [yearlySummaries, monthlySummaries]);

  // Get months for selected year that have summaries
  const monthsForYear = useMemo(() => {
    if (!selectedYear) return [];
    const months = monthlySummaries
      .filter(s => s.year === selectedYear)
      .map(s => s.month)
      .sort((a, b) => a - b);
    return months;
  }, [selectedYear, monthlySummaries]);

  // Check if selected year has a yearly summary
  const hasYearlySummary = useMemo(() => {
    if (!selectedYear) return false;
    return yearlySummaries.some(s => s.year === selectedYear);
  }, [selectedYear, yearlySummaries]);

  const handleYearClick = (year: number) => {
    if (selectedYear === year) {
      // If clicking the same year, collapse it
      setSelectedYear(null);
      setSelectedMonth(null);
    } else {
      setSelectedYear(year);
      setSelectedMonth(null);
    }
  };

  const handleMonthClick = (month: number) => {
    if (selectedMonth === month) {
      // If clicking the same month, collapse it
      setSelectedMonth(null);
    } else {
      setSelectedMonth(month);
    }
  };

  const handleBackToYears = () => {
    setSelectedYear(null);
    setSelectedMonth(null);
  };

  const handleBackToMonths = () => {
    setSelectedMonth(null);
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading reflections...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '1rem', 
        backgroundColor: '#ffebee', 
        color: '#c62828',
        borderRadius: '4px'
      }}>
        Error: {error}
      </div>
    );
  }

  // Show month view
  if (selectedYear && selectedMonth) {
    return (
      <div className="reflections">
        <div className="reflections-header">
          <button
            onClick={handleBackToMonths}
            className="btn btn-secondary"
            style={{ marginBottom: '16px' }}
          >
            ← Back to {selectedYear}
          </button>
          <h2>{monthNames[selectedMonth - 1]} {selectedYear}</h2>
        </div>
        <SummaryNotes
          type="monthly"
          year={selectedYear}
          month={selectedMonth}
        />
      </div>
    );
  }

  // Show year view (with months list)
  if (selectedYear) {
    return (
      <div className="reflections">
        <div className="reflections-header">
          <button
            onClick={handleBackToYears}
            className="btn btn-secondary"
            style={{ marginBottom: '16px' }}
          >
            ← Back to Years
          </button>
          <h2>{selectedYear}</h2>
        </div>

        {/* Yearly Summary Section */}
        {hasYearlySummary && (
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--primary-color)' }}>
              Year Summary
            </h3>
            <SummaryNotes
              type="yearly"
              year={selectedYear}
            />
          </div>
        )}

        {/* Monthly Summaries Section */}
        {monthsForYear.length > 0 && (
          <div>
            <h3 style={{ marginBottom: '16px', color: 'var(--primary-color)' }}>
              Monthly Reflections
            </h3>
            <div className="months-list">
              {monthsForYear.map(month => (
                <button
                  key={month}
                  onClick={() => handleMonthClick(month)}
                  className="month-item"
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '16px',
                    marginBottom: '12px',
                    textAlign: 'left',
                    backgroundColor: 'var(--light-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '16px',
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--light-bg)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {monthNames[month - 1]} {selectedYear}
                  <span style={{ float: 'right', color: 'var(--text-muted)' }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* If no summaries exist for this year, show option to create */}
        {!hasYearlySummary && monthsForYear.length === 0 && (
          <div>
            <h3 style={{ marginBottom: '16px', color: 'var(--primary-color)' }}>
              Year Summary
            </h3>
            <SummaryNotes
              type="yearly"
              year={selectedYear}
            />
          </div>
        )}
      </div>
    );
  }

  // Show years list (default view)
  return (
    <div className="reflections">
      <div className="reflections-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2>Reflections</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0 }}>
              View and manage your yearly and monthly reflections
            </p>
          </div>
          <button
            onClick={loadSummaries}
            className="btn btn-secondary"
            style={{ marginTop: '8px' }}
            title="Refresh reflections"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {availableYears.length === 0 ? (
        <div style={{ 
          padding: '48px', 
          textAlign: 'center',
          backgroundColor: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '18px', marginBottom: '8px' }}>
            No reflections yet
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Create your first reflection from the Summary tab
          </p>
        </div>
      ) : (
        <div className="years-list">
          {availableYears.map(year => {
            const yearMonthlyCount = monthlySummaries.filter(s => s.year === year).length;
            const hasYearly = yearlySummaries.some(s => s.year === year);
            
            return (
              <button
                key={year}
                onClick={() => handleYearClick(year)}
                className="year-item"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '20px',
                  marginBottom: '16px',
                  textAlign: 'left',
                  backgroundColor: 'var(--light-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  borderLeft: '4px solid var(--primary-color)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--light-bg)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--text-color)' }}>
                      {year}
                    </h3>
                    <div style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>
                      {hasYearly && <span>Year summary</span>}
                      {hasYearly && yearMonthlyCount > 0 && <span> • </span>}
                      {yearMonthlyCount > 0 && (
                        <span>{yearMonthlyCount} month{yearMonthlyCount !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: '24px', color: 'var(--text-muted)' }}>→</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
