import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { todayIsoLocal, parseIsoDateLocal, formatIsoDateLocal, formatDate } from '../utils/dateHelpers';
import { generateId } from '../utils/storage';
import { hapticSuccess, hapticError, hapticSelection } from '../utils/haptics';
import { Transaction, TransactionTemplate } from '../types';
import TransactionTemplatesSection from '../components/TransactionTemplatesSection';

export default function TransactionFormScreen({ navigation, route }: any) {
  const { theme } = useTheme();
  const { state, addTransaction, updateTransaction } = useAppState();
  const editTransaction: Transaction | undefined = route.params?.transaction;
  const templateFromNav: TransactionTemplate | undefined = route.params?.template;
  const isEditing = !!editTransaction;

  const [type, setType] = useState<'expense' | 'income' | 'investment'>(editTransaction?.type || templateFromNav?.type || 'expense');
  const [amount, setAmount] = useState(editTransaction ? editTransaction.amount.toString() : (templateFromNav?.amount?.toString() ?? ''));
  const [description, setDescription] = useState(editTransaction?.description || templateFromNav?.description || '');
  const [bucketId, setBucketId] = useState<string | undefined>(editTransaction?.bucketId ?? templateFromNav?.bucketId);
  const [date, setDate] = useState(editTransaction?.date || todayIsoLocal());
  const [tags, setTags] = useState<string[]>(editTransaction?.tags || templateFromNav?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState(editTransaction?.notes || templateFromNav?.notes || '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (templateFromNav) {
      setType(templateFromNav.type);
      setAmount(templateFromNav.amount?.toString() ?? '');
      setDescription(templateFromNav.description);
      setBucketId(templateFromNav.bucketId);
      setTags(templateFromNav.tags || []);
      setNotes(templateFromNav.notes || '');
    }
  }, [templateFromNav?.id]);

  const handleUseTemplate = (template: TransactionTemplate) => {
    setType(template.type);
    setAmount(template.amount?.toString() ?? '');
    setDescription(template.description);
    setBucketId(template.bucketId);
    setTags(template.tags || []);
    setNotes(template.notes || '');
  };

  const styles = createStyles(theme);

  const handleSave = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (type === 'expense' && !bucketId) {
      Alert.alert('Error', 'Please select a bucket for expenses');
      return;
    }

    setLoading(true);
    try {
      const txnData = {
        type,
        amount: parseFloat(amount),
        description: description.trim(),
        bucketId: type === 'expense' ? bucketId : undefined,
        date,
        tags: tags.length > 0 ? tags : undefined,
        notes: notes.trim() || undefined,
        isRecurring: editTransaction?.isRecurring || false,
        recurringId: editTransaction?.recurringId,
      };

      if (isEditing) {
        await updateTransaction(editTransaction.id, txnData);
      } else {
        await addTransaction({ id: generateId(), ...txnData });
      }
      hapticSuccess();
      navigation.goBack();
    } catch (err: any) {
      hapticError();
      Alert.alert('Error', err.message || 'Failed to save transaction');
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleDateChange = (_: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(formatIsoDateLocal(selectedDate));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Templates (when creating new only) */}
        {!isEditing && (
          <TransactionTemplatesSection
            buckets={state.buckets}
            onUseTemplate={handleUseTemplate}
          />
        )}

        {/* Type Selector */}
        <View style={styles.typeSelector}>
          {(['expense', 'income', 'investment'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, type === t && { backgroundColor: theme.colors[t === 'expense' ? 'expense' : t === 'income' ? 'income' : 'investment'] }]}
              onPress={() => { hapticSelection(); setType(t); }}
            >
              <Text style={[styles.typeBtnText, type === t && { color: '#fff' }]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Amount */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="What was this for?"
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>

        {/* Bucket (for expenses) */}
        {type === 'expense' && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bucket</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bucketsScroll}>
              {state.buckets.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.bucketChip, bucketId === b.id && { backgroundColor: (b.color || theme.colors.primary) + '20', borderColor: b.color || theme.colors.primary }]}
                  onPress={() => { hapticSelection(); setBucketId(b.id); }}
                >
                  <View style={[styles.bucketDot, { backgroundColor: b.color || theme.colors.primary }]} />
                  <Text style={[styles.bucketChipText, bucketId === b.id && { color: b.color || theme.colors.primary, fontWeight: '600' }]}>
                    {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Date */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => { hapticSelection(); setShowDatePicker(true); }}>
            <Text style={styles.dateBtnText}>{formatDate(date)}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={parseIsoDateLocal(date)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleDateChange}
              themeVariant={theme.isDark ? 'dark' : 'light'}
            />
          )}
        </View>

        {/* Tags */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tags</Text>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="Add a tag"
              placeholderTextColor={theme.colors.textTertiary}
              onSubmitEditing={addTag}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.addTagBtn} onPress={() => { hapticSelection(); addTag(); }}>
              <Text style={styles.addTagBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          {tags.length > 0 && (
            <View style={styles.tagsWrap}>
              {tags.map(tag => (
                <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => { hapticSelection(); removeTag(tag); }}>
                  <Text style={styles.tagChipText}>{tag} ×</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Notes */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional notes..."
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, loading && { opacity: 0.6 }]}
          onPress={() => { hapticSelection(); handleSave(); }}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>{isEditing ? 'Update Transaction' : 'Add Transaction'}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { padding: theme.spacing.lg, paddingBottom: 100 },
    typeSelector: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.xs,
      marginBottom: theme.spacing.lg,
      gap: theme.spacing.xs,
    },
    typeBtn: {
      flex: 1,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.sm,
      alignItems: 'center',
    },
    typeBtnText: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.textSecondary },
    inputGroup: { marginBottom: theme.spacing.lg },
    label: {
      fontSize: theme.fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      fontSize: theme.fontSize.md,
      color: theme.colors.text,
    },
    amountInput: { fontSize: theme.fontSize.xxl, fontWeight: '700', textAlign: 'center' },
    bucketsScroll: { flexGrow: 0 },
    bucketChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginRight: theme.spacing.sm,
    },
    bucketDot: { width: 8, height: 8, borderRadius: 4, marginRight: theme.spacing.sm },
    bucketChipText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    dateBtn: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
    },
    dateBtnText: { fontSize: theme.fontSize.md, color: theme.colors.text },
    tagInputRow: { flexDirection: 'row', gap: theme.spacing.sm },
    addTagBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.lg,
      justifyContent: 'center',
    },
    addTagBtnText: { color: '#fff', fontWeight: '600', fontSize: theme.fontSize.sm },
    tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
    tagChip: {
      backgroundColor: theme.colors.primary + '15',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.borderRadius.full,
    },
    tagChipText: { fontSize: theme.fontSize.sm, color: theme.colors.primary, fontWeight: '500' },
    notesInput: { height: 100, paddingTop: theme.spacing.md },
    saveBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg,
      alignItems: 'center',
      marginTop: theme.spacing.md,
    },
    saveBtnText: { color: '#fff', fontSize: theme.fontSize.lg, fontWeight: '600' },
  });
}
