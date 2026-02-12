import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { formatCurrency, formatDate, todayIsoLocal } from '../utils/dateHelpers';
import { hapticLight, hapticSelection } from '../utils/haptics';
import { Transaction } from '../types';

type CalendarMode = 'month' | 'day';

export default function CalendarScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { state, refreshAll } = useAppState();
  const [selectedDate, setSelectedDate] = useState(todayIsoLocal());
  const [mode, setMode] = useState<CalendarMode>('month');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  // Build expense amounts per day for the current month
  const dailyExpenses = useMemo(() => {
    const map = new Map<string, number>();
    state.transactions.forEach(t => {
      if (t.type === 'expense') {
        map.set(t.date, (map.get(t.date) || 0) + t.amount);
      }
    });
    return map;
  }, [state.transactions]);

  // Compute heat levels based on quartiles
  const markedDates = useMemo(() => {
    const values = Array.from(dailyExpenses.values()).filter(v => v > 0).sort((a, b) => a - b);
    const q1 = values[Math.floor(values.length * 0.25)] || 0;
    const q2 = values[Math.floor(values.length * 0.5)] || 0;
    const q3 = values[Math.floor(values.length * 0.75)] || 0;

    const marks: any = {};
    dailyExpenses.forEach((amount, date) => {
      if (amount <= 0) return;
      let color = theme.colors.success + '40';
      if (amount > q3) color = theme.colors.danger + '80';
      else if (amount > q2) color = theme.colors.warning + '60';
      else if (amount > q1) color = theme.colors.primary + '40';

      marks[date] = {
        customStyles: {
          container: { backgroundColor: color, borderRadius: 6 },
          text: { color: theme.colors.text },
        },
      };
    });

    // Mark selected date
    if (marks[selectedDate]) {
      marks[selectedDate] = {
        ...marks[selectedDate],
        customStyles: {
          ...marks[selectedDate].customStyles,
          container: {
            ...marks[selectedDate].customStyles.container,
            borderWidth: 2,
            borderColor: theme.colors.primary,
          },
        },
      };
    } else {
      marks[selectedDate] = {
        customStyles: {
          container: { borderWidth: 2, borderColor: theme.colors.primary, borderRadius: 6 },
          text: { color: theme.colors.text },
        },
      };
    }

    return marks;
  }, [dailyExpenses, selectedDate, theme]);

  // Transactions for selected date
  const selectedTransactions = useMemo(() => {
    return state.transactions
      .filter(t => t.date === selectedDate)
      .sort((a, b) => a.type.localeCompare(b.type));
  }, [state.transactions, selectedDate]);

  const selectedDayTotals = useMemo(() => {
    let income = 0, expenses = 0, investments = 0;
    selectedTransactions.forEach(t => {
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expenses += t.amount;
      else if (t.type === 'investment') investments += t.amount;
    });
    return { income, expenses, investments };
  }, [selectedTransactions]);

  const typeColor = (type: string) => {
    switch (type) {
      case 'income': return theme.colors.income;
      case 'expense': return theme.colors.expense;
      case 'investment': return theme.colors.investment;
      default: return theme.colors.text;
    }
  };

  const getBucketName = (bucketId?: string) => {
    if (!bucketId) return '';
    return state.buckets.find(b => b.id === bucketId)?.name || '';
  };

  const styles = createStyles(theme);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      <Calendar
        markingType="custom"
        markedDates={markedDates}
        enableSwipeMonths
        onMonthChange={() => hapticLight()}
        onPressArrowLeft={(goToPrevMonth) => {
          hapticLight();
          goToPrevMonth();
        }}
        onPressArrowRight={(goToNextMonth) => {
          hapticLight();
          goToNextMonth();
        }}
        onDayPress={(day: any) => {
          hapticSelection();
          setSelectedDate(day.dateString);
        }}
        theme={{
          calendarBackground: theme.colors.surface,
          textSectionTitleColor: theme.colors.textSecondary,
          dayTextColor: theme.colors.text,
          todayTextColor: theme.colors.primary,
          monthTextColor: theme.colors.text,
          textDisabledColor: theme.colors.textTertiary,
          arrowColor: theme.colors.primary,
          textDayFontSize: theme.fontSize.md,
          textMonthFontSize: theme.fontSize.lg,
          textDayHeaderFontSize: theme.fontSize.sm,
        }}
        style={styles.calendar}
      />

      {/* Selected Day Summary */}
      <View style={styles.daySummary}>
        <Text style={styles.dayTitle}>{formatDate(selectedDate)}</Text>
        <View style={styles.dayTotals}>
          {selectedDayTotals.income > 0 && (
            <View style={styles.dayTotal}>
              <Text style={[styles.dayTotalValue, { color: theme.colors.income }]}>+{formatCurrency(selectedDayTotals.income)}</Text>
              <Text style={styles.dayTotalLabel}>Income</Text>
            </View>
          )}
          {selectedDayTotals.expenses > 0 && (
            <View style={styles.dayTotal}>
              <Text style={[styles.dayTotalValue, { color: theme.colors.expense }]}>-{formatCurrency(selectedDayTotals.expenses)}</Text>
              <Text style={styles.dayTotalLabel}>Expenses</Text>
            </View>
          )}
          {selectedDayTotals.investments > 0 && (
            <View style={styles.dayTotal}>
              <Text style={[styles.dayTotalValue, { color: theme.colors.investment }]}>-{formatCurrency(selectedDayTotals.investments)}</Text>
              <Text style={styles.dayTotalLabel}>Investments</Text>
            </View>
          )}
        </View>
      </View>

      {/* Transactions for selected day */}
      <View style={styles.txnList}>
        {selectedTransactions.length > 0 ? (
          selectedTransactions.map(t => (
            <TouchableOpacity
              key={t.id}
              style={styles.txnItem}
              onPress={() => {
                hapticSelection();
                navigation.navigate('TransactionForm', { transaction: t });
              }}
            >
              <View style={[styles.typeDot, { backgroundColor: typeColor(t.type) }]} />
              <View style={styles.txnInfo}>
                <Text style={styles.txnDesc} numberOfLines={1}>{t.description}</Text>
                {t.bucketId && <Text style={styles.txnBucket}>{getBucketName(t.bucketId)}</Text>}
              </View>
              <Text style={[styles.txnAmount, { color: typeColor(t.type) }]}>
                {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
              </Text>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyDayText}>No transactions on this day</Text>
          </View>
        )}
      </View>

      {/* Budget Status for current month */}
      {state.budgets.length > 0 && (
        <View style={styles.budgetSection}>
          <Text style={styles.sectionTitle}>Monthly Budget Progress</Text>
          {(() => {
            const d = new Date(selectedDate + 'T00:00:00');
            const month = d.getMonth() + 1;
            const year = d.getFullYear();
            const monthBudgets = state.budgets.filter(b => b.period === 'monthly' && b.year === year && b.month === month);
            if (monthBudgets.length === 0) return <Text style={styles.emptyText}>No budgets for this month</Text>;
            return monthBudgets.map(b => {
              const bucket = state.buckets.find(bk => bk.id === b.bucketId);
              const spent = state.transactions
                .filter(t => t.type === 'expense' && t.bucketId === b.bucketId && new Date(t.date).getMonth() + 1 === month && new Date(t.date).getFullYear() === year)
                .reduce((s, t) => s + t.amount, 0);
              const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
              return (
                <View key={b.id} style={styles.budgetItem}>
                  <View style={styles.budgetHeader}>
                    <Text style={styles.budgetName}>{bucket?.name || 'Unknown'}</Text>
                    <Text style={styles.budgetValues}>{formatCurrency(spent)} / {formatCurrency(b.amount)}</Text>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, {
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: pct > 100 ? theme.colors.danger : pct >= 80 ? theme.colors.warning : theme.colors.success,
                    }]} />
                  </View>
                </View>
              );
            });
          })()}
        </View>
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    calendar: { borderRadius: theme.borderRadius.lg, margin: theme.spacing.lg, overflow: 'hidden' },
    daySummary: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: theme.spacing.lg,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.md,
    },
    dayTitle: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.text, marginBottom: theme.spacing.sm },
    dayTotals: { flexDirection: 'row', gap: theme.spacing.md },
    dayTotal: { flex: 1 },
    dayTotalValue: { fontSize: theme.fontSize.md, fontWeight: '700' },
    dayTotalLabel: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: 2 },
    txnList: { marginHorizontal: theme.spacing.lg },
    txnItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    typeDot: { width: 8, height: 8, borderRadius: 4, marginRight: theme.spacing.sm },
    txnInfo: { flex: 1 },
    txnDesc: { fontSize: theme.fontSize.md, color: theme.colors.text, fontWeight: '500' },
    txnBucket: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: 2 },
    txnAmount: { fontSize: theme.fontSize.md, fontWeight: '700', marginLeft: theme.spacing.md },
    emptyDay: { paddingVertical: theme.spacing.xl, alignItems: 'center' },
    emptyDayText: { color: theme.colors.textTertiary, fontSize: theme.fontSize.sm },
    budgetSection: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: theme.spacing.lg,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      marginTop: theme.spacing.md,
    },
    sectionTitle: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.text, marginBottom: theme.spacing.md },
    emptyText: { color: theme.colors.textTertiary, fontSize: theme.fontSize.sm },
    budgetItem: { marginBottom: theme.spacing.md },
    budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.xs },
    budgetName: { fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: '500' },
    budgetValues: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
    progressBg: { height: 6, borderRadius: 3, backgroundColor: theme.colors.borderLight, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
  });
}
