import React, { useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { formatCurrency, formatDate, todayIsoLocal, parseIsoDateLocal, formatIsoDateLocal, getNextOccurrence } from '../utils/dateHelpers';
import { generateId } from '../utils/storage';
import { RecurringTransaction, RecurringFrequency } from '../types';

const FREQUENCIES: { key: RecurringFrequency; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'fortnightly', label: 'Fortnightly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

function getStatus(r: RecurringTransaction): 'active' | 'inactive' | 'closed' {
  const today = todayIsoLocal();
  if (r.endDate && r.endDate < today) return 'closed';
  if (r.startDate > today) return 'inactive';
  return 'active';
}

export default function RecurringScreen() {
  const { theme } = useTheme();
  const { state, addRecurring, updateRecurring, deleteRecurring } = useAppState();
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);

  // Form state
  const [type, setType] = useState<'expense' | 'income' | 'investment'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [bucketId, setBucketId] = useState<string | undefined>();
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [startDate, setStartDate] = useState(todayIsoLocal());
  const [endDate, setEndDate] = useState<string | undefined>();
  const [hasEndDate, setHasEndDate] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setType('expense');
    setAmount('');
    setDescription('');
    setBucketId(undefined);
    setFrequency('monthly');
    setStartDate(todayIsoLocal());
    setEndDate(undefined);
    setHasEndDate(false);
    setModalVisible(true);
  };

  const openEdit = (r: RecurringTransaction) => {
    setEditing(r);
    setType(r.transaction.type);
    setAmount(r.transaction.amount.toString());
    setDescription(r.transaction.description);
    setBucketId(r.transaction.bucketId);
    setFrequency(r.frequency);
    setStartDate(r.startDate);
    setEndDate(r.endDate);
    setHasEndDate(!!r.endDate);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!description.trim()) { Alert.alert('Error', 'Enter a description'); return; }
    if (!amount || parseFloat(amount) <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
    if (type === 'expense' && !bucketId) { Alert.alert('Error', 'Select a bucket'); return; }

    try {
      const data: RecurringTransaction = {
        id: editing?.id || generateId(),
        transaction: { type, amount: parseFloat(amount), description: description.trim(), bucketId: type === 'expense' ? bucketId : undefined },
        frequency,
        startDate,
        endDate: hasEndDate ? endDate : undefined,
        lastApplied: editing?.lastApplied,
      };

      if (editing) {
        await updateRecurring(editing.id, data);
      } else {
        await addRecurring(data);
      }
      setModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleDelete = (r: RecurringTransaction) => {
    Alert.alert('Delete Recurring', `Delete "${r.transaction.description}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRecurring(r.id) },
    ]);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return theme.colors.success;
      case 'inactive': return theme.colors.warning;
      case 'closed': return theme.colors.textTertiary;
      default: return theme.colors.textSecondary;
    }
  };

  const typeColor = (t: string) => {
    switch (t) { case 'income': return theme.colors.income; case 'expense': return theme.colors.expense; case 'investment': return theme.colors.investment; default: return theme.colors.text; }
  };

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <FlatList
        data={state.recurringTransactions}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const status = getStatus(item);
          const nextOccurrence = status === 'active' ? getNextOccurrence(item.frequency, item.startDate, item.lastApplied) : null;
          const bucket = state.buckets.find(b => b.id === item.transaction.bucketId);
          return (
            <TouchableOpacity style={styles.item} onPress={() => openEdit(item)} onLongPress={() => handleDelete(item)}>
              <View style={styles.itemHeader}>
                <View style={[styles.statusDot, { backgroundColor: statusColor(status) }]} />
                <Text style={styles.itemDesc} numberOfLines={1}>{item.transaction.description}</Text>
                <Text style={[styles.itemAmount, { color: typeColor(item.transaction.type) }]}>
                  {formatCurrency(item.transaction.amount)}
                </Text>
              </View>
              <View style={styles.itemMeta}>
                <Text style={styles.metaText}>{item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1)}</Text>
                {bucket && <Text style={styles.metaText}>{bucket.name}</Text>}
                <Text style={[styles.statusBadge, { color: statusColor(status) }]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
              </View>
              {nextOccurrence && (
                <Text style={styles.nextDate}>Next: {formatDate(nextOccurrence)}</Text>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Recurring Transactions</Text>
            <Text style={styles.emptySubtitle}>Set up automatic transactions</Text>
          </View>
        }
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Text style={styles.addBtnText}>+ Add Recurring Transaction</Text>
          </TouchableOpacity>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Recurring' : 'New Recurring'}</Text>

              {/* Type */}
              <View style={styles.typeRow}>
                {(['expense', 'income', 'investment'] as const).map(t => (
                  <TouchableOpacity key={t} style={[styles.typeBtn, type === t && { backgroundColor: typeColor(t) }]} onPress={() => setType(t)}>
                    <Text style={[styles.typeBtnText, type === t && { color: '#fff' }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Amount</Text>
                <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={theme.colors.textTertiary} keyboardType="decimal-pad" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={theme.colors.textTertiary} />
              </View>

              {type === 'expense' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Bucket</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {state.buckets.map(b => (
                      <TouchableOpacity key={b.id} style={[styles.bucketChip, bucketId === b.id && { backgroundColor: (b.color || theme.colors.primary) + '20', borderColor: b.color || theme.colors.primary }]} onPress={() => setBucketId(b.id)}>
                        <Text style={[styles.bucketChipText, bucketId === b.id && { color: b.color || theme.colors.primary }]}>{b.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Frequency</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {FREQUENCIES.map(f => (
                    <TouchableOpacity key={f.key} style={[styles.freqChip, frequency === f.key && styles.freqChipActive]} onPress={() => setFrequency(f.key)}>
                      <Text style={[styles.freqChipText, frequency === f.key && styles.freqChipTextActive]}>{f.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Start Date</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
                  <Text style={styles.dateBtnText}>{formatDate(startDate)}</Text>
                </TouchableOpacity>
                {showStartPicker && (
                  <DateTimePicker value={parseIsoDateLocal(startDate)} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={(_, d) => { setShowStartPicker(Platform.OS === 'ios'); if (d) setStartDate(formatIsoDateLocal(d)); }} themeVariant={theme.isDark ? 'dark' : 'light'} />
                )}
              </View>

              <TouchableOpacity style={styles.checkRow} onPress={() => setHasEndDate(!hasEndDate)}>
                <View style={[styles.checkbox, hasEndDate && styles.checkboxChecked]} />
                <Text style={styles.checkLabel}>Set end date</Text>
              </TouchableOpacity>

              {hasEndDate && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>End Date</Text>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
                    <Text style={styles.dateBtnText}>{endDate ? formatDate(endDate) : 'Select date'}</Text>
                  </TouchableOpacity>
                  {showEndPicker && (
                    <DateTimePicker value={endDate ? parseIsoDateLocal(endDate) : new Date()} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={(_, d) => { setShowEndPicker(Platform.OS === 'ios'); if (d) setEndDate(formatIsoDateLocal(d)); }} themeVariant={theme.isDark ? 'dark' : 'light'} />
                  )}
                </View>
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
    item: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, marginBottom: theme.spacing.sm },
    itemHeader: { flexDirection: 'row', alignItems: 'center' },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: theme.spacing.sm },
    itemDesc: { flex: 1, fontSize: theme.fontSize.md, color: theme.colors.text, fontWeight: '500' },
    itemAmount: { fontSize: theme.fontSize.md, fontWeight: '700', marginLeft: theme.spacing.sm },
    itemMeta: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.xs },
    metaText: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
    statusBadge: { fontSize: theme.fontSize.xs, fontWeight: '600' },
    nextDate: { fontSize: theme.fontSize.xs, color: theme.colors.textTertiary, marginTop: theme.spacing.xs },
    empty: { paddingVertical: theme.spacing.xxl * 2, alignItems: 'center' },
    emptyTitle: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.textSecondary },
    emptySubtitle: { fontSize: theme.fontSize.sm, color: theme.colors.textTertiary, marginTop: theme.spacing.sm },
    addBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, alignItems: 'center', marginBottom: theme.spacing.lg },
    addBtnText: { color: '#fff', fontSize: theme.fontSize.md, fontWeight: '600' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.borderRadius.xl, borderTopRightRadius: theme.borderRadius.xl, padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    modalTitle: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.xl },
    typeRow: { flexDirection: 'row', gap: theme.spacing.xs, marginBottom: theme.spacing.lg, backgroundColor: theme.colors.background, borderRadius: theme.borderRadius.md, padding: theme.spacing.xs },
    typeBtn: { flex: 1, paddingVertical: theme.spacing.sm, borderRadius: theme.borderRadius.sm, alignItems: 'center' },
    typeBtnText: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.textSecondary },
    inputGroup: { marginBottom: theme.spacing.lg },
    label: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: theme.spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, fontSize: theme.fontSize.md, color: theme.colors.text },
    bucketChip: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, marginRight: theme.spacing.sm },
    bucketChipText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    freqChip: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, marginRight: theme.spacing.sm },
    freqChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    freqChipText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    freqChipTextActive: { color: '#fff', fontWeight: '600' },
    dateBtn: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md, padding: theme.spacing.md },
    dateBtnText: { fontSize: theme.fontSize.md, color: theme.colors.text },
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
