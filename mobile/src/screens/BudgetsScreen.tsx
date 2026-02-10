import React, { useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { formatCurrency } from '../utils/dateHelpers';
import { generateId } from '../utils/storage';
import { Budget } from '../types';

export default function BudgetsScreen() {
  const { theme } = useTheme();
  const { state, addBudget, updateBudget, deleteBudget } = useAppState();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [selectedBucketId, setSelectedBucketId] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [applyAllMonths, setApplyAllMonths] = useState(false);

  const now = new Date();

  // Group budgets by bucket
  const groupedBudgets = useMemo(() => {
    const groups = new Map<string, Budget[]>();
    state.budgets.forEach(b => {
      const key = b.bucketId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(b);
    });
    return Array.from(groups.entries()).map(([bucketId, budgets]) => ({
      bucketId,
      bucketName: state.buckets.find(b => b.id === bucketId)?.name || 'Unknown',
      bucketColor: state.buckets.find(b => b.id === bucketId)?.color || '#6366f1',
      budgets: budgets.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return (b.month || 0) - (a.month || 0);
      }),
    }));
  }, [state.budgets, state.buckets]);

  const openAdd = () => {
    setEditingBudget(null);
    setSelectedBucketId(state.buckets[0]?.id || '');
    setAmount('');
    setPeriod('monthly');
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setApplyAllMonths(false);
    setModalVisible(true);
  };

  const openEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setSelectedBucketId(budget.bucketId);
    setAmount(budget.amount.toString());
    setPeriod(budget.period);
    setYear(budget.year);
    setMonth(budget.month || 1);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!selectedBucketId) { Alert.alert('Error', 'Please select a bucket'); return; }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) { Alert.alert('Error', 'Please enter a valid amount'); return; }

    try {
      if (editingBudget) {
        await updateBudget(editingBudget.id, { amount: parseFloat(amount) });
      } else if (period === 'monthly' && applyAllMonths) {
        for (let m = 1; m <= 12; m++) {
          await addBudget({
            id: generateId(),
            bucketId: selectedBucketId,
            amount: parseFloat(amount),
            period: 'monthly',
            year,
            month: m,
          });
        }
      } else {
        await addBudget({
          id: generateId(),
          bucketId: selectedBucketId,
          amount: parseFloat(amount),
          period,
          year,
          month: period === 'monthly' ? month : undefined,
        });
      }
      setModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleDelete = (budget: Budget) => {
    const bucket = state.buckets.find(b => b.id === budget.bucketId);
    Alert.alert('Delete Budget', `Delete budget for ${bucket?.name || 'Unknown'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteBudget(budget.id) },
    ]);
  };

  const getSpent = (bucketId: string, budgetPeriod: 'monthly' | 'yearly', budgetYear: number, budgetMonth?: number) => {
    return state.transactions.filter(t => {
      if (t.type !== 'expense' || t.bucketId !== bucketId) return false;
      const d = new Date(t.date);
      if (d.getFullYear() !== budgetYear) return false;
      if (budgetPeriod === 'monthly' && budgetMonth && d.getMonth() + 1 !== budgetMonth) return false;
      return true;
    }).reduce((s, t) => s + t.amount, 0);
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <FlatList
        data={groupedBudgets}
        keyExtractor={item => item.bucketId}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: group }) => (
          <View style={styles.group}>
            <View style={styles.groupHeader}>
              <View style={[styles.colorDot, { backgroundColor: group.bucketColor }]} />
              <Text style={styles.groupName}>{group.bucketName}</Text>
            </View>
            {group.budgets.map(b => {
              const spent = getSpent(b.bucketId, b.period, b.year, b.month);
              const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
              return (
                <TouchableOpacity key={b.id} style={styles.budgetRow} onPress={() => openEdit(b)} onLongPress={() => handleDelete(b)}>
                  <View style={styles.budgetInfo}>
                    <Text style={styles.budgetLabel}>
                      {b.period === 'monthly' ? `${monthNames[(b.month || 1) - 1]} ${b.year}` : `${b.year} (Yearly)`}
                    </Text>
                    <Text style={styles.budgetAmount}>{formatCurrency(spent)} / {formatCurrency(b.amount)}</Text>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, {
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: pct > 100 ? theme.colors.danger : pct >= 80 ? theme.colors.warning : theme.colors.success,
                    }]} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Budgets</Text>
            <Text style={styles.emptySubtitle}>Set spending limits for your categories</Text>
          </View>
        }
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Text style={styles.addBtnText}>+ Add Budget</Text>
          </TouchableOpacity>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{editingBudget ? 'Edit Budget' : 'New Budget'}</Text>

              {!editingBudget && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Bucket</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {state.buckets.map(b => (
                      <TouchableOpacity
                        key={b.id}
                        style={[styles.bucketChip, selectedBucketId === b.id && { backgroundColor: (b.color || theme.colors.primary) + '20', borderColor: b.color || theme.colors.primary }]}
                        onPress={() => setSelectedBucketId(b.id)}
                      >
                        <Text style={[styles.bucketChipText, selectedBucketId === b.id && { color: b.color || theme.colors.primary }]}>{b.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Amount</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>

              {!editingBudget && (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Period</Text>
                    <View style={styles.periodRow}>
                      {(['monthly', 'yearly'] as const).map(p => (
                        <TouchableOpacity key={p} style={[styles.periodBtn, period === p && styles.periodBtnActive]} onPress={() => setPeriod(p)}>
                          <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {period === 'monthly' && (
                    <TouchableOpacity style={styles.checkRow} onPress={() => setApplyAllMonths(!applyAllMonths)}>
                      <View style={[styles.checkbox, applyAllMonths && styles.checkboxChecked]} />
                      <Text style={styles.checkLabel}>Apply to all months</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    listContent: { padding: theme.spacing.lg, paddingBottom: 100 },
    group: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.md,
    },
    groupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md },
    colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: theme.spacing.sm },
    groupName: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.text },
    budgetRow: { marginBottom: theme.spacing.md },
    budgetInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.xs },
    budgetLabel: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    budgetAmount: { fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: '500' },
    progressBg: { height: 6, borderRadius: 3, backgroundColor: theme.colors.borderLight, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    empty: { paddingVertical: theme.spacing.xxl * 2, alignItems: 'center' },
    emptyTitle: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.textSecondary },
    emptySubtitle: { fontSize: theme.fontSize.sm, color: theme.colors.textTertiary, marginTop: theme.spacing.sm },
    addBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, alignItems: 'center', marginBottom: theme.spacing.lg },
    addBtnText: { color: '#fff', fontSize: theme.fontSize.md, fontWeight: '600' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.borderRadius.xl, borderTopRightRadius: theme.borderRadius.xl, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    modalTitle: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.xl },
    inputGroup: { marginBottom: theme.spacing.lg },
    label: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: theme.spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, fontSize: theme.fontSize.md, color: theme.colors.text },
    bucketChip: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, marginRight: theme.spacing.sm },
    bucketChipText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    periodRow: { flexDirection: 'row', gap: theme.spacing.sm },
    periodBtn: { flex: 1, padding: theme.spacing.md, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.background, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
    periodBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    periodBtnText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    periodBtnTextActive: { color: '#fff', fontWeight: '600' },
    checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.lg },
    checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: theme.colors.border, marginRight: theme.spacing.sm },
    checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    checkLabel: { fontSize: theme.fontSize.sm, color: theme.colors.text },
    modalActions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg },
    cancelBtn: { flex: 1, padding: theme.spacing.lg, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.background, alignItems: 'center' },
    cancelBtnText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },
    saveBtn: { flex: 1, padding: theme.spacing.lg, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.primary, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: theme.fontSize.md, fontWeight: '600' },
  });
}
