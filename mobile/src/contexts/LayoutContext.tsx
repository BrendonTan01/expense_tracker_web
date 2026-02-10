import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { saveToStorage, loadFromStorage } from '../utils/storage';

const LAYOUT_STORAGE_KEY = 'layout_prefs';

export interface DashboardSection {
  id: string;
  label: string;
  visible: boolean;
}

export interface TabConfig {
  id: string;
  label: string;
  icon: string;
  visible: boolean;
}

export interface LayoutPrefs {
  dashboardSections: DashboardSection[];
  tabs: TabConfig[];
}

export const DEFAULT_DASHBOARD_SECTIONS: DashboardSection[] = [
  { id: 'overview', label: 'Overview Cards', visible: true },
  { id: 'chart', label: 'Main Chart', visible: true },
  { id: 'savingsScore', label: 'Savings Score', visible: true },
  { id: 'categoryAnalysis', label: 'Category Analysis', visible: true },
  { id: 'investmentInsights', label: 'Investment Insights', visible: true },
  { id: 'budgetStatus', label: 'Budget Status', visible: true },
  { id: 'expenseBreakdown', label: 'Expense Breakdown', visible: true },
  { id: 'summaryNotes', label: 'Summary Notes', visible: true },
];

export const DEFAULT_TABS: TabConfig[] = [
  { id: 'summary', label: 'Summary', icon: 'chart-pie', visible: true },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', visible: true },
  { id: 'add', label: 'Add', icon: 'plus-circle', visible: true },
  { id: 'transactions', label: 'Transactions', icon: 'list', visible: true },
  { id: 'more', label: 'More', icon: 'ellipsis-h', visible: true },
];

const DEFAULT_LAYOUT: LayoutPrefs = {
  dashboardSections: DEFAULT_DASHBOARD_SECTIONS,
  tabs: DEFAULT_TABS,
};

interface LayoutContextType {
  layout: LayoutPrefs;
  setDashboardSections: (sections: DashboardSection[]) => void;
  toggleDashboardSection: (sectionId: string) => void;
  reorderDashboardSections: (fromIndex: number, toIndex: number) => void;
  setTabs: (tabs: TabConfig[]) => void;
  toggleTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  resetLayout: () => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<LayoutPrefs>(DEFAULT_LAYOUT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadFromStorage<LayoutPrefs>(LAYOUT_STORAGE_KEY, DEFAULT_LAYOUT).then((saved) => {
      // Merge with defaults to handle new sections added in updates
      const mergedSections = DEFAULT_DASHBOARD_SECTIONS.map(def => {
        const saved_s = saved.dashboardSections?.find(s => s.id === def.id);
        return saved_s || def;
      });
      const mergedTabs = DEFAULT_TABS.map(def => {
        const saved_t = saved.tabs?.find(t => t.id === def.id);
        return saved_t || def;
      });
      setLayout({ dashboardSections: mergedSections, tabs: mergedTabs });
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) {
      saveToStorage(LAYOUT_STORAGE_KEY, layout);
    }
  }, [layout, loaded]);

  const setDashboardSections = useCallback((sections: DashboardSection[]) => {
    setLayout(prev => ({ ...prev, dashboardSections: sections }));
  }, []);

  const toggleDashboardSection = useCallback((sectionId: string) => {
    setLayout(prev => ({
      ...prev,
      dashboardSections: prev.dashboardSections.map(s =>
        s.id === sectionId ? { ...s, visible: !s.visible } : s
      ),
    }));
  }, []);

  const reorderDashboardSections = useCallback((fromIndex: number, toIndex: number) => {
    setLayout(prev => {
      const sections = [...prev.dashboardSections];
      const [removed] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, removed);
      return { ...prev, dashboardSections: sections };
    });
  }, []);

  const setTabs = useCallback((tabs: TabConfig[]) => {
    setLayout(prev => ({ ...prev, tabs }));
  }, []);

  const toggleTab = useCallback((tabId: string) => {
    // Don't allow hiding 'add' or 'summary' tabs
    if (tabId === 'add' || tabId === 'summary') return;
    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(t =>
        t.id === tabId ? { ...t, visible: !t.visible } : t
      ),
    }));
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setLayout(prev => {
      const tabs = [...prev.tabs];
      const [removed] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, removed);
      return { ...prev, tabs };
    });
  }, []);

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
  }, []);

  const value = useMemo(
    () => ({ layout, setDashboardSections, toggleDashboardSection, reorderDashboardSections, setTabs, toggleTab, reorderTabs, resetLayout }),
    [layout, setDashboardSections, toggleDashboardSection, reorderDashboardSections, setTabs, toggleTab, reorderTabs, resetLayout]
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within a LayoutProvider');
  return ctx;
}
