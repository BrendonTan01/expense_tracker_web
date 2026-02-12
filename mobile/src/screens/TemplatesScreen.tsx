import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Alert, Modal, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { TransactionTemplate } from '../types';
import { loadFromStorage, saveToStorage, generateId } from '../utils/storage';
import { hapticSelection, hapticSuccess } from '../utils/haptics';
import { formatCurrency } from '../utils/dateHelpers';

const STORAGE_KEY = 'transaction_templates';

export default function TemplatesScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { state } = useAppState();
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TransactionTemplate | null>(null);
  const [formData, setFormData] = useState<Omit<TransactionTemplate, 'id'>>({
    name: '',
    type: 'expense',
    amount: undefined,
    description: '',
    bucketId: '',
    tags: [],
    notes: '',
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    loadFromStorage<TransactionTemplate[]>(STORAGE_KEY, []).then(setTemplates);
  }, []);

  const saveTemplates = (newTemplates: TransactionTemplate[]) => {
    setTemplates(newTemplates);
    saveToStorage(STORAGE_KEY, newTemplates);
  };

  const handleSubmit = () => {
    if (!formData.name?.trim() || !formData.description?.trim()) {
      Alert.alert('Error', 'Template name and description are required');
      return;
    }
    const template: TransactionTemplate = {
      id: editingTemplate?.id || generateId(),
      ...formData,
      bucketId: formData.type === 'expense' && formData.bucketId ? formData.bucketId : undefined,
    };
    if (editingTemplate) {
      saveTemplates(templates.map(t => t.id === editingTemplate.id ? template : t));
    } else {
      saveTemplates([...templates, template]);
    }
    hapticSuccess();
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'expense',
      amount: undefined,
      description: '',
      bucketId: '',
      tags: [],
      notes: '',
    });
    setTagInput('');
    setShowForm(false);
    setEditingTemplate(null);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Template', 'Delete this template?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => saveTemplates(templates.filter(t => t.id !== id)) },
    ]);
  };

  const handleEdit = (template: TransactionTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      type: template.type,
      amount: template.amount,
      description: template.description,
      bucketId: template.bucketId || '',
      tags: template.tags || [],
      notes: template.notes || '',
    });
    setShowForm(true);
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags?.includes(tag)) {
      setFormData({ ...formData, tags: [...(formData.tags || []), tag] });
      setTagInput('');
    }
  };

  const removeTag = (idx: number) => {
    setFormData({ ...formData, tags: formData.tags?.filter((_, i) => i !== idx) || [] });
  };

  const styles = createStyles(theme);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <TouchableOpacity style={styles.addBtn} onPress={() => {
        hapticSelection();
        setEditingTemplate(null);
        setFormData({ name: '', type: 'expense', amount: undefined, description: '', bucketId: '', tags: [], notes: '' });
        setTagInput('');
        setShowForm(true);
      }}>
        <Text style={styles.addBtnText}>+ New Template</Text>
      </TouchableOpacity>

      {templates.length === 0 && !showForm ? (
        <Text style={styles.emptyText}>No templates yet. Create one to quickly add common transactions.</Text>
      ) : (
        templates.map(template => {
          const bucket = template.bucketId ? state.buckets.find(b => b.id === template.bucketId) : null;
          return (
            <View key={template.id} style={styles.templateCard}>
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>{template.name}</Text>
                <Text style={styles.templateDesc}>
                  {template.description}
                  {template.amount != null ? ` · ${formatCurrency(template.amount)}` : ''}
                </Text>
                {bucket && (
                  <View style={[styles.bucketBadge, { backgroundColor: (bucket.color || theme.colors.primary) + '20' }]}>
                    <Text style={[styles.bucketBadgeText, { color: bucket.color || theme.colors.primary }]}>{bucket.name}</Text>
                  </View>
                )}
              </View>
              <View style={styles.templateActions}>
                <TouchableOpacity style={styles.useBtn} onPress={() => {
                  hapticSelection();
                  navigation.navigate('TransactionsTab', { screen: 'TransactionForm', params: { template } });
                }}>
                  <Text style={styles.useBtnText}>Use</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editBtn} onPress={() => { hapticSelection(); handleEdit(template); }}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => { hapticSelection(); handleDelete(template.id); }}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <Modal visible={showForm} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingTemplate ? 'Edit Template' : 'New Template'}</Text>
            <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Template Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={v => setFormData({ ...formData, name: v })}
                placeholder="e.g., Grocery Shopping"
                placeholderTextColor={theme.colors.textTertiary}
              />
              <Text style={styles.inputLabel}>Type</Text>
              <View style={styles.typeRow}>
                {(['expense', 'income', 'investment'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, formData.type === t && styles.typeBtnActive]}
                    onPress={() => { hapticSelection(); setFormData({ ...formData, type: t, bucketId: t !== 'expense' ? '' : formData.bucketId }); }}
                  >
                    <Text style={[styles.typeBtnText, formData.type === t && styles.typeBtnTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.inputLabel}>Description *</Text>
              <TextInput
                style={styles.input}
                value={formData.description}
                onChangeText={v => setFormData({ ...formData, description: v })}
                placeholder="Transaction description"
                placeholderTextColor={theme.colors.textTertiary}
              />
              <Text style={styles.inputLabel}>Amount (optional)</Text>
              <TextInput
                style={styles.input}
                value={formData.amount?.toString() ?? ''}
                onChangeText={v => setFormData({ ...formData, amount: v ? parseFloat(v) : undefined })}
                placeholder="0.00"
                placeholderTextColor={theme.colors.textTertiary}
                keyboardType="decimal-pad"
              />
              {formData.type === 'expense' && (
                <>
                  <Text style={styles.inputLabel}>Bucket (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bucketsScroll}>
                    <TouchableOpacity
                      style={[styles.bucketChip, !formData.bucketId && styles.bucketChipActive]}
                      onPress={() => { hapticSelection(); setFormData({ ...formData, bucketId: '' }); }}
                    >
                      <Text style={[styles.bucketChipText, !formData.bucketId && styles.bucketChipTextActive]}>None</Text>
                    </TouchableOpacity>
                    {state.buckets.map(b => (
                      <TouchableOpacity
                        key={b.id}
                        style={[styles.bucketChip, formData.bucketId === b.id && { backgroundColor: (b.color || theme.colors.primary) + '20', borderColor: b.color || theme.colors.primary }]}
                        onPress={() => { hapticSelection(); setFormData({ ...formData, bucketId: b.id }); }}
                      >
                        <View style={[styles.bucketDot, { backgroundColor: b.color || theme.colors.primary }]} />
                        <Text style={[styles.bucketChipText, formData.bucketId === b.id && { color: b.color || theme.colors.primary, fontWeight: '600' }]}>{b.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}
              <Text style={styles.inputLabel}>Tags</Text>
              <View style={styles.tagInputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="Add tag"
                  placeholderTextColor={theme.colors.textTertiary}
                  onSubmitEditing={addTag}
                />
                <TouchableOpacity style={styles.addTagBtn} onPress={() => { hapticSelection(); addTag(); }}>
                  <Text style={styles.addTagBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
              {formData.tags && formData.tags.length > 0 && (
                <View style={styles.tagsWrap}>
                  {formData.tags.map((tag, idx) => (
                    <TouchableOpacity key={idx} style={styles.tagChip} onPress={() => { hapticSelection(); removeTag(idx); }}>
                      <Text style={styles.tagChipText}>{tag} ×</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={styles.inputLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={formData.notes ?? ''}
                onChangeText={v => setFormData({ ...formData, notes: v })}
                placeholder="Additional notes"
                placeholderTextColor={theme.colors.textTertiary}
                multiline
              />
            </ScrollView>
            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { hapticSelection(); resetForm(); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={() => { hapticSelection(); handleSubmit(); }}>
                <Text style={styles.submitBtnText}>{editingTemplate ? 'Update' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { padding: theme.spacing.lg },
    addBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      alignItems: 'center',
      marginBottom: theme.spacing.lg,
    },
    addBtnText: { color: '#fff', fontSize: theme.fontSize.md, fontWeight: '600' },
    emptyText: { color: theme.colors.textTertiary, textAlign: 'center', paddingVertical: theme.spacing.xxl },
    templateCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    templateInfo: { flex: 1 },
    templateName: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.text },
    templateDesc: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
    bucketBadge: { alignSelf: 'flex-start', paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.borderRadius.sm, marginTop: theme.spacing.xs },
    bucketBadgeText: { fontSize: theme.fontSize.xs, fontWeight: '500' },
    templateActions: { flexDirection: 'row', gap: theme.spacing.sm },
    useBtn: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
    useBtnText: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: '600' },
    editBtn: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
    editBtnText: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: '600' },
    deleteBtn: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs },
    deleteBtnText: { color: theme.colors.danger, fontSize: theme.fontSize.sm, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.borderRadius.xl,
      borderTopRightRadius: theme.borderRadius.xl,
      maxHeight: '90%',
      padding: theme.spacing.lg,
    },
    modalTitle: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.lg },
    formScroll: { maxHeight: 400 },
    inputLabel: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: theme.spacing.xs, marginTop: theme.spacing.sm },
    input: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, fontSize: theme.fontSize.md, color: theme.colors.text },
    typeRow: { flexDirection: 'row', gap: theme.spacing.sm },
    typeBtn: { flex: 1, paddingVertical: theme.spacing.sm, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.background, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
    typeBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    typeBtnText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    typeBtnTextActive: { color: '#fff', fontWeight: '600' },
    bucketsScroll: { flexGrow: 0, marginTop: theme.spacing.sm },
    bucketChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginRight: theme.spacing.sm,
    },
    bucketChipActive: { backgroundColor: theme.colors.primary + '20', borderColor: theme.colors.primary },
    bucketDot: { width: 8, height: 8, borderRadius: 4, marginRight: theme.spacing.sm },
    bucketChipText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    bucketChipTextActive: { color: theme.colors.primary, fontWeight: '600' },
    tagInputRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
    addTagBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingHorizontal: theme.spacing.lg, justifyContent: 'center' },
    addTagBtnText: { color: '#fff', fontWeight: '600', fontSize: theme.fontSize.sm },
    tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
    tagChip: { backgroundColor: theme.colors.primary + '15', paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.borderRadius.full },
    tagChipText: { fontSize: theme.fontSize.sm, color: theme.colors.primary, fontWeight: '500' },
    notesInput: { height: 80, paddingTop: theme.spacing.md },
    formActions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg },
    cancelBtn: { flex: 1, padding: theme.spacing.md, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.background, alignItems: 'center' },
    cancelBtnText: { color: theme.colors.textSecondary, fontWeight: '600' },
    submitBtn: { flex: 1, padding: theme.spacing.md, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.primary, alignItems: 'center' },
    submitBtnText: { color: '#fff', fontWeight: '600' },
  });
}
