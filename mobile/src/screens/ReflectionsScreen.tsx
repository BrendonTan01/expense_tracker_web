import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { summariesApi } from '../utils/api';
import { formatCurrency } from '../utils/dateHelpers';
import { hapticSelection } from '../utils/haptics';
import { generateId } from '../utils/storage';
import { MonthlySummary, YearlySummary } from '../types';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type ViewMode = 'years' | 'year' | 'month';

export default function ReflectionsScreen() {
  const { theme } = useTheme();
  const { state } = useAppState();
  const [viewMode, setViewMode] = useState<ViewMode>('years');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([]);
  const [yearlySummaries, setYearlySummaries] = useState<YearlySummary[]>([]);
  const [editText, setEditText] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSummaries();
  }, []);

  const loadSummaries = async () => {
    try {
      const [monthly, yearly] = await Promise.all([
        summariesApi.getMonthly(),
        summariesApi.getYearly(),
      ]);
      setMonthlySummaries(monthly);
      setYearlySummaries(yearly);
    } catch (err) {
      console.error('Failed to load summaries:', err);
    }
  };

  // Get unique years from transactions
  const years = useMemo(() => {
    const yearSet = new Set<number>();
    state.transactions.forEach(t => yearSet.add(new Date(t.date).getFullYear()));
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [state.transactions]);

  const getYearTotals = (year: number) => {
    const yearTxns = state.transactions.filter(t => new Date(t.date).getFullYear() === year);
    let income = 0, expenses = 0, investments = 0;
    yearTxns.forEach(t => {
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expenses += t.amount;
      else if (t.type === 'investment') investments += t.amount;
    });
    return { income, expenses, investments };
  };

  const getMonthTotals = (year: number, month: number) => {
    const monthTxns = state.transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
    let income = 0, expenses = 0, investments = 0;
    monthTxns.forEach(t => {
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expenses += t.amount;
      else if (t.type === 'investment') investments += t.amount;
    });
    return { income, expenses, investments };
  };

  const handleSaveSummary = async (type: 'monthly' | 'yearly') => {
    setSaving(true);
    try {
      if (editId) {
        await summariesApi.update(editId, editText, type);
      } else {
        const summary = type === 'monthly'
          ? { id: generateId(), year: selectedYear, month: selectedMonth, summary: editText } as MonthlySummary
          : { id: generateId(), year: selectedYear, summary: editText } as YearlySummary;
        await summariesApi.create(summary);
      }
      await loadSummaries();
      setEditText('');
      setEditId(null);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const styles = createStyles(theme);

  if (viewMode === 'month') {
    const totals = getMonthTotals(selectedYear, selectedMonth);
    const existingSummary = monthlySummaries.find(s => s.year === selectedYear && s.month === selectedMonth);

    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity onPress={() => { hapticSelection(); setViewMode('year'); }} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Back to {selectedYear}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</Text>

          <View style={styles.totalsCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Income</Text>
              <Text style={[styles.totalValue, { color: theme.colors.income }]}>{formatCurrency(totals.income)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Expenses</Text>
              <Text style={[styles.totalValue, { color: theme.colors.expense }]}>{formatCurrency(totals.expenses)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Investments</Text>
              <Text style={[styles.totalValue, { color: theme.colors.investment }]}>{formatCurrency(totals.investments)}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Reflection</Text>
          <TextInput
            style={styles.textArea}
            value={editText || existingSummary?.summary || ''}
            onChangeText={(text) => {
              setEditText(text);
              if (existingSummary && !editId) setEditId(existingSummary.id);
            }}
            placeholder="Write your thoughts about this month..."
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={() => { hapticSelection(); handleSaveSummary('monthly'); }}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Reflection'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (viewMode === 'year') {
    const totals = getYearTotals(selectedYear);
    const existingSummary = yearlySummaries.find(s => s.year === selectedYear);

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity onPress={() => { hapticSelection(); setViewMode('years'); }} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back to all years</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{selectedYear}</Text>

        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Income</Text>
            <Text style={[styles.totalValue, { color: theme.colors.income }]}>{formatCurrency(totals.income)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Expenses</Text>
            <Text style={[styles.totalValue, { color: theme.colors.expense }]}>{formatCurrency(totals.expenses)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Investments</Text>
            <Text style={[styles.totalValue, { color: theme.colors.investment }]}>{formatCurrency(totals.investments)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Year Reflection</Text>
        <TextInput
          style={styles.textArea}
          value={editText || existingSummary?.summary || ''}
          onChangeText={(text) => {
            setEditText(text);
            if (existingSummary && !editId) setEditId(existingSummary.id);
          }}
          placeholder="Write your thoughts about this year..."
          placeholderTextColor={theme.colors.textTertiary}
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={() => { hapticSelection(); handleSaveSummary('yearly'); }}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Reflection'}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Months</Text>
        {MONTH_NAMES.map((name, i) => {
          const mt = getMonthTotals(selectedYear, i + 1);
          const hasSummary = monthlySummaries.some(s => s.year === selectedYear && s.month === i + 1);
          return (
            <TouchableOpacity
              key={i}
              style={styles.monthItem}
              onPress={() => { hapticSelection(); setSelectedMonth(i + 1); setEditText(''); setEditId(null); setViewMode('month'); }}
            >
              <View>
                <Text style={styles.monthName}>{name}</Text>
                <Text style={styles.monthMeta}>
                  {formatCurrency(mt.income)} in / {formatCurrency(mt.expenses)} out
                </Text>
              </View>
              {hasSummary && <View style={styles.hasSummaryDot} />}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  }

  // Years list view
  return (
    <View style={styles.container}>
      <FlatList
        data={years.length > 0 ? years : [new Date().getFullYear()]}
        keyExtractor={item => item.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: year }) => {
          const totals = getYearTotals(year);
          const hasSummary = yearlySummaries.some(s => s.year === year);
          return (
            <TouchableOpacity
              style={styles.yearItem}
              onPress={() => { hapticSelection(); setSelectedYear(year); setEditText(''); setEditId(null); setViewMode('year'); }}
            >
              <View>
                <Text style={styles.yearTitle}>{year}</Text>
                <Text style={styles.yearMeta}>
                  {formatCurrency(totals.income)} in / {formatCurrency(totals.expenses)} out
                </Text>
              </View>
              {hasSummary && <View style={styles.hasSummaryDot} />}
            </TouchableOpacity>
          );
        }}
        ListHeaderComponent={<Text style={styles.pageTitle}>Reflections</Text>}
      />
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { padding: theme.spacing.lg, paddingBottom: 100 },
    listContent: { padding: theme.spacing.lg, paddingBottom: 100 },
    pageTitle: { fontSize: theme.fontSize.xxl, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.lg },
    backBtn: { marginBottom: theme.spacing.md },
    backBtnText: { color: theme.colors.primary, fontSize: theme.fontSize.md, fontWeight: '500' },
    title: { fontSize: theme.fontSize.xxl, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.lg },
    totalsCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg, marginBottom: theme.spacing.lg },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.sm },
    totalLabel: { fontSize: theme.fontSize.md, color: theme.colors.textSecondary },
    totalValue: { fontSize: theme.fontSize.md, fontWeight: '600' },
    sectionTitle: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.text, marginBottom: theme.spacing.md, marginTop: theme.spacing.md },
    textArea: {
      backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md, padding: theme.spacing.md, fontSize: theme.fontSize.md,
      color: theme.colors.text, minHeight: 120, marginBottom: theme.spacing.md,
    },
    saveBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, alignItems: 'center', marginBottom: theme.spacing.lg },
    saveBtnText: { color: '#fff', fontSize: theme.fontSize.md, fontWeight: '600' },
    yearItem: {
      backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg, marginBottom: theme.spacing.sm,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    yearTitle: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.text },
    yearMeta: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
    monthItem: {
      backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg, marginBottom: theme.spacing.sm,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    monthName: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
    monthMeta: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
    hasSummaryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
  });
}
