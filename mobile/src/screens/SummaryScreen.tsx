import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Dimensions,
} from 'react-native';
import { BarChart, PieChart, LineChart } from 'react-native-gifted-charts';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { useLayout } from '../contexts/LayoutContext';
import { formatCurrency, todayIsoLocal, startOfMonthIsoLocal, endOfMonthIsoLocal, startOfYearIsoLocal, endOfYearIsoLocal, parseIsoDateLocal } from '../utils/dateHelpers';
import { calculateSpendingTrends, calculateCategoryAverages } from '../utils/analytics';
import { Transaction, Bucket, Budget } from '../types';
import { hapticSelection } from '../utils/haptics';

type PeriodFilter = 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'allTime';

const PERIOD_OPTIONS: { key: PeriodFilter; label: string }[] = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisYear', label: 'This Year' },
  { key: 'lastYear', label: 'Last Year' },
  { key: 'allTime', label: 'All Time' },
];

function getDateRange(period: PeriodFilter): { start: string; end: string } {
  const today = todayIsoLocal();
  const now = new Date();
  switch (period) {
    case 'thisMonth':
      return { start: startOfMonthIsoLocal(today), end: endOfMonthIsoLocal(today) };
    case 'lastMonth': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const lm = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-15`;
      return { start: startOfMonthIsoLocal(lm), end: endOfMonthIsoLocal(lm) };
    }
    case 'thisYear':
      return { start: startOfYearIsoLocal(today), end: endOfYearIsoLocal(today) };
    case 'lastYear': {
      const ly = `${now.getFullYear() - 1}-06-15`;
      return { start: startOfYearIsoLocal(ly), end: endOfYearIsoLocal(ly) };
    }
    case 'allTime':
    default:
      return { start: '1970-01-01', end: '2099-12-31' };
  }
}

function filterTransactions(transactions: Transaction[], start: string, end: string): Transaction[] {
  return transactions.filter(t => t.date >= start && t.date <= end);
}

function computeTotals(transactions: Transaction[]) {
  let income = 0, expenses = 0, investments = 0;
  transactions.forEach(t => {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expenses += t.amount;
    else if (t.type === 'investment') investments += t.amount;
  });
  const net = income - expenses - investments;
  const savingPct = income > 0 ? ((income - expenses - investments) / income) * 100 : 0;
  return { income, expenses, investments, net, savingPct };
}

function computeSavingsScore(transactions: Transaction[], budgets: Budget[], buckets: Bucket[]): number {
  const { income, expenses, investments } = computeTotals(transactions);
  let score = 0;
  // Saving rate (40 pts)
  if (income > 0) {
    const rate = (income - expenses - investments) / income;
    score += Math.max(0, Math.min(40, rate * 100));
  }
  // Expense trend (30 pts) - simple: if current month expenses < last month
  const now = new Date();
  const thisMonthTxns = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && t.type === 'expense';
  });
  const lastMonthTxns = transactions.filter(t => {
    const d = new Date(t.date);
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear() && t.type === 'expense';
  });
  const thisMonthExp = thisMonthTxns.reduce((s, t) => s + t.amount, 0);
  const lastMonthExp = lastMonthTxns.reduce((s, t) => s + t.amount, 0);
  if (lastMonthExp > 0 && thisMonthExp <= lastMonthExp) score += 30;
  else if (lastMonthExp > 0) score += Math.max(0, 30 - ((thisMonthExp - lastMonthExp) / lastMonthExp) * 30);
  else score += 15;
  // Balance (20 pts)
  if (income > expenses + investments) score += 20;
  else if (income > 0) score += Math.max(0, 20 * (income / (expenses + investments + 1)));
  // Budget adherence (10 pts)
  if (budgets.length > 0) {
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const monthBudgets = budgets.filter(b => b.period === 'monthly' && b.year === year && b.month === month);
    let adherent = 0;
    monthBudgets.forEach(b => {
      const spent = transactions.filter(t => t.type === 'expense' && t.bucketId === b.bucketId && new Date(t.date).getMonth() + 1 === month && new Date(t.date).getFullYear() === year).reduce((s, t) => s + t.amount, 0);
      if (spent <= b.amount) adherent++;
    });
    if (monthBudgets.length > 0) score += (adherent / monthBudgets.length) * 10;
    else score += 5;
  } else {
    score += 5;
  }
  return Math.round(Math.min(100, Math.max(0, score)));
}

export default function SummaryScreen() {
  const { theme } = useTheme();
  const { state, loading, refreshAll } = useAppState();
  const { layout } = useLayout();
  const [period, setPeriod] = useState<PeriodFilter>('thisMonth');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const { start, end } = getDateRange(period);
  const filtered = useMemo(() => filterTransactions(state.transactions, start, end), [state.transactions, start, end]);
  const totals = useMemo(() => computeTotals(filtered), [filtered]);
  const savingsScore = useMemo(() => computeSavingsScore(state.transactions, state.budgets, state.buckets), [state.transactions, state.budgets, state.buckets]);
  const trends = useMemo(() => calculateSpendingTrends(state.transactions, 6), [state.transactions]);
  const categoryAvgs = useMemo(() => calculateCategoryAverages(filtered, state.buckets), [filtered, state.buckets]);

  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - theme.spacing.xl * 2 - 40;

  const isVisible = (id: string) => layout.dashboardSections.find(s => s.id === id)?.visible ?? true;
  const orderedSections = layout.dashboardSections;

  const styles = createStyles(theme);

  const renderSection = (section: { id: string }) => {
    switch (section.id) {
      case 'overview':
        if (!isVisible('overview')) return null;
        return (
          <View key="overview" style={styles.section}>
            <View style={styles.cardsRow}>
              <View style={[styles.card, { borderLeftColor: theme.colors.income }]}>
                <Text style={styles.cardLabel}>Income</Text>
                <Text style={[styles.cardValue, { color: theme.colors.income }]}>{formatCurrency(totals.income)}</Text>
              </View>
              <View style={[styles.card, { borderLeftColor: theme.colors.expense }]}>
                <Text style={styles.cardLabel}>Expenses</Text>
                <Text style={[styles.cardValue, { color: theme.colors.expense }]}>{formatCurrency(totals.expenses)}</Text>
              </View>
            </View>
            <View style={styles.cardsRow}>
              <View style={[styles.card, { borderLeftColor: theme.colors.investment }]}>
                <Text style={styles.cardLabel}>Investments</Text>
                <Text style={[styles.cardValue, { color: theme.colors.investment }]}>{formatCurrency(totals.investments)}</Text>
              </View>
              <View style={[styles.card, { borderLeftColor: totals.net >= 0 ? theme.colors.success : theme.colors.danger }]}>
                <Text style={styles.cardLabel}>Net</Text>
                <Text style={[styles.cardValue, { color: totals.net >= 0 ? theme.colors.success : theme.colors.danger }]}>{formatCurrency(totals.net)}</Text>
              </View>
            </View>
            <View style={[styles.savingCard, { backgroundColor: theme.colors.primary + '15' }]}>
              <Text style={styles.savingLabel}>Saving Rate</Text>
              <Text style={[styles.savingValue, { color: theme.colors.primary }]}>
                {totals.savingPct.toFixed(1)}%
              </Text>
            </View>
          </View>
        );

      case 'chart':
        if (!isVisible('chart')) return null;
        return (
          <View key="chart" style={styles.section}>
            <Text style={styles.sectionTitle}>Income vs Expenses</Text>
            <View style={styles.chartContainer}>
              {trends.length > 0 ? (
                <BarChart
                  stackData={trends.map(t => ({
                    stacks: [
                      { value: t.income, color: theme.colors.income },
                      { value: t.expenses, color: theme.colors.expense },
                    ],
                    label: t.period.slice(5),
                  }))}
                  barWidth={Math.max(16, chartWidth / trends.length / 2)}
                  spacing={Math.max(8, chartWidth / trends.length / 4)}
                  xAxisLabelTextStyle={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}
                  yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}
                  noOfSections={4}
                  yAxisColor={theme.colors.border}
                  xAxisColor={theme.colors.border}
                  rulesColor={theme.colors.borderLight}
                  width={chartWidth}
                  height={180}
                />
              ) : (
                <Text style={styles.emptyText}>No data for this period</Text>
              )}
            </View>
          </View>
        );

      case 'savingsScore':
        if (!isVisible('savingsScore')) return null;
        return (
          <View key="savingsScore" style={styles.section}>
            <Text style={styles.sectionTitle}>Savings Score</Text>
            <View style={styles.scoreContainer}>
              <View style={[styles.scoreCircle, { borderColor: savingsScore >= 70 ? theme.colors.success : savingsScore >= 40 ? theme.colors.warning : theme.colors.danger }]}>
                <Text style={[styles.scoreValue, { color: savingsScore >= 70 ? theme.colors.success : savingsScore >= 40 ? theme.colors.warning : theme.colors.danger }]}>
                  {savingsScore}
                </Text>
                <Text style={styles.scoreLabel}>/ 100</Text>
              </View>
              <Text style={styles.scoreDescription}>
                {savingsScore >= 70 ? 'Great job! Keep it up.' : savingsScore >= 40 ? 'Room for improvement.' : 'Consider reducing expenses.'}
              </Text>
            </View>
          </View>
        );

      case 'categoryAnalysis':
        if (!isVisible('categoryAnalysis')) return null;
        return (
          <View key="categoryAnalysis" style={styles.section}>
            <Text style={styles.sectionTitle}>Spending by Category</Text>
            {categoryAvgs.length > 0 ? (
              <>
                <View style={styles.chartContainer}>
                  <PieChart
                    data={categoryAvgs.slice(0, 6).map((c, i) => {
                      const bucket = state.buckets.find(b => b.id === c.bucketId);
                      return { value: c.total, color: bucket?.color || ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'][i % 6], text: '' };
                    })}
                    radius={80}
                    innerRadius={50}
                    backgroundColor={theme.colors.surface}
                    innerCircleColor={theme.colors.surface}
                    innerCircleBorderColor={theme.colors.border}
                    textColor={theme.colors.text}
                    strokeColor={theme.colors.border}
                    centerLabelComponent={() => (
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textSecondary }}>Total</Text>
                        <Text style={{ fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.text }}>{formatCurrency(categoryAvgs.reduce((s, c) => s + c.total, 0))}</Text>
                      </View>
                    )}
                  />
                </View>
                {categoryAvgs.slice(0, 6).map((c, i) => {
                  const bucket = state.buckets.find(b => b.id === c.bucketId);
                  return (
                    <View key={c.bucketId} style={styles.categoryRow}>
                      <View style={[styles.categoryDot, { backgroundColor: bucket?.color || '#6366f1' }]} />
                      <Text style={styles.categoryName} numberOfLines={1}>{c.bucketName}</Text>
                      <Text style={styles.categoryValue}>{formatCurrency(c.total)}</Text>
                    </View>
                  );
                })}
              </>
            ) : (
              <Text style={styles.emptyText}>No expense data for this period</Text>
            )}
          </View>
        );

      case 'investmentInsights':
        if (!isVisible('investmentInsights')) return null;
        const investmentTxns = filtered.filter(t => t.type === 'investment');
        if (investmentTxns.length === 0) return (
          <View key="investmentInsights" style={styles.section}>
            <Text style={styles.sectionTitle}>Investment Insights</Text>
            <Text style={styles.emptyText}>No investments in this period</Text>
          </View>
        );
        const totalInvested = investmentTxns.reduce((s, t) => s + t.amount, 0);
        const avgInvestment = totalInvested / investmentTxns.length;
        const largest = Math.max(...investmentTxns.map(t => t.amount));
        return (
          <View key="investmentInsights" style={styles.section}>
            <Text style={styles.sectionTitle}>Investment Insights</Text>
            <View style={styles.insightsGrid}>
              <View style={styles.insightItem}>
                <Text style={styles.insightLabel}>Total</Text>
                <Text style={[styles.insightValue, { color: theme.colors.investment }]}>{formatCurrency(totalInvested)}</Text>
              </View>
              <View style={styles.insightItem}>
                <Text style={styles.insightLabel}>Average</Text>
                <Text style={styles.insightValue}>{formatCurrency(avgInvestment)}</Text>
              </View>
              <View style={styles.insightItem}>
                <Text style={styles.insightLabel}>Largest</Text>
                <Text style={styles.insightValue}>{formatCurrency(largest)}</Text>
              </View>
              <View style={styles.insightItem}>
                <Text style={styles.insightLabel}>Count</Text>
                <Text style={styles.insightValue}>{investmentTxns.length}</Text>
              </View>
            </View>
          </View>
        );

      case 'budgetStatus':
        if (!isVisible('budgetStatus')) return null;
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const monthBudgets = state.budgets.filter(b => b.period === 'monthly' && b.year === currentYear && b.month === currentMonth);
        if (monthBudgets.length === 0) return (
          <View key="budgetStatus" style={styles.section}>
            <Text style={styles.sectionTitle}>Budget Status</Text>
            <Text style={styles.emptyText}>No budgets set for this month</Text>
          </View>
        );
        return (
          <View key="budgetStatus" style={styles.section}>
            <Text style={styles.sectionTitle}>Budget Status</Text>
            {monthBudgets.map(b => {
              const bucket = state.buckets.find(bk => bk.id === b.bucketId);
              const spent = state.transactions
                .filter(t => t.type === 'expense' && t.bucketId === b.bucketId && new Date(t.date).getMonth() + 1 === currentMonth && new Date(t.date).getFullYear() === currentYear)
                .reduce((s, t) => s + t.amount, 0);
              const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
              const overBudget = pct > 100;
              return (
                <View key={b.id} style={styles.budgetItem}>
                  <View style={styles.budgetHeader}>
                    <Text style={styles.budgetName}>{bucket?.name || 'Unknown'}</Text>
                    <Text style={[styles.budgetPct, { color: overBudget ? theme.colors.danger : pct >= 80 ? theme.colors.warning : theme.colors.success }]}>
                      {pct.toFixed(0)}%
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, {
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: overBudget ? theme.colors.danger : pct >= 80 ? theme.colors.warning : theme.colors.success,
                    }]} />
                  </View>
                  <Text style={styles.budgetDetail}>{formatCurrency(spent)} / {formatCurrency(b.amount)}</Text>
                </View>
              );
            })}
          </View>
        );

      case 'expenseBreakdown':
        if (!isVisible('expenseBreakdown')) return null;
        const expensesByBucket = new Map<string, number>();
        filtered.filter(t => t.type === 'expense' && t.bucketId).forEach(t => {
          expensesByBucket.set(t.bucketId!, (expensesByBucket.get(t.bucketId!) || 0) + t.amount);
        });
        const sortedBuckets = Array.from(expensesByBucket.entries()).sort((a, b) => b[1] - a[1]);
        const totalExpenses = totals.expenses;
        return (
          <View key="expenseBreakdown" style={styles.section}>
            <Text style={styles.sectionTitle}>Expense Breakdown</Text>
            {sortedBuckets.length > 0 ? sortedBuckets.map(([bucketId, amount]) => {
              const bucket = state.buckets.find(b => b.id === bucketId);
              const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
              return (
                <View key={bucketId} style={styles.breakdownRow}>
                  <View style={[styles.categoryDot, { backgroundColor: bucket?.color || '#6366f1' }]} />
                  <Text style={styles.breakdownName} numberOfLines={1}>{bucket?.name || 'Unknown'}</Text>
                  <Text style={styles.breakdownPct}>{pct.toFixed(1)}%</Text>
                  <Text style={styles.breakdownValue}>{formatCurrency(amount)}</Text>
                </View>
              );
            }) : (
              <Text style={styles.emptyText}>No expenses in this period</Text>
            )}
          </View>
        );

      case 'summaryNotes':
        if (!isVisible('summaryNotes')) return null;
        return (
          <View key="summaryNotes" style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.emptyText}>View and manage reflections in the Reflections screen</Text>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Period Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll}>
          {PERIOD_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.periodChip, period === opt.key && styles.periodChipActive]}
              onPress={() => { hapticSelection(); setPeriod(opt.key); }}
            >
              <Text style={[styles.periodChipText, period === opt.key && styles.periodChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Dashboard sections in configurable order */}
        {orderedSections.map(section => renderSection(section))}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { padding: theme.spacing.lg, paddingBottom: 100 },
    periodScroll: { marginBottom: theme.spacing.lg, flexGrow: 0 },
    periodChip: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginRight: theme.spacing.sm,
    },
    periodChipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    periodChipText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    periodChipTextActive: { color: '#ffffff', fontWeight: '600' },
    section: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    },
    sectionTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: theme.spacing.md,
    },
    cardsRow: { flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.md },
    card: {
      flex: 1,
      backgroundColor: theme.colors.surfaceElevated,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      borderLeftWidth: 3,
    },
    cardLabel: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
    cardValue: { fontSize: theme.fontSize.lg, fontWeight: '700' },
    savingCard: {
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    savingLabel: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
    savingValue: { fontSize: theme.fontSize.xl, fontWeight: '700' },
    chartContainer: { alignItems: 'center', paddingVertical: theme.spacing.md },
    emptyText: { fontSize: theme.fontSize.sm, color: theme.colors.textTertiary, textAlign: 'center', paddingVertical: theme.spacing.lg },
    scoreContainer: { alignItems: 'center', paddingVertical: theme.spacing.md },
    scoreCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 6,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: theme.spacing.md,
    },
    scoreValue: { fontSize: theme.fontSize.xxxl, fontWeight: '700' },
    scoreLabel: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    scoreDescription: { fontSize: theme.fontSize.md, color: theme.colors.textSecondary, textAlign: 'center' },
    categoryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.sm },
    categoryDot: { width: 10, height: 10, borderRadius: 5, marginRight: theme.spacing.sm },
    categoryName: { flex: 1, fontSize: theme.fontSize.sm, color: theme.colors.text },
    categoryValue: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.text },
    insightsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    insightItem: {
      width: '47%',
      backgroundColor: theme.colors.surfaceElevated,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
    },
    insightLabel: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
    insightValue: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.text },
    budgetItem: { marginBottom: theme.spacing.md },
    budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.xs },
    budgetName: { fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: '500' },
    budgetPct: { fontSize: theme.fontSize.sm, fontWeight: '600' },
    progressBarBg: {
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.borderLight,
      overflow: 'hidden',
    },
    progressBarFill: { height: '100%', borderRadius: 4 },
    budgetDetail: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
    breakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.sm },
    breakdownName: { flex: 1, fontSize: theme.fontSize.sm, color: theme.colors.text, marginLeft: theme.spacing.sm },
    breakdownPct: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginRight: theme.spacing.sm, width: 45, textAlign: 'right' },
    breakdownValue: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.text, width: 80, textAlign: 'right' },
  });
}
