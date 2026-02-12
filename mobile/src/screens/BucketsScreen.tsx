import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { generateId } from '../utils/storage';
import { hapticSelection } from '../utils/haptics';
import { Bucket } from '../types';

const COLORS = [
  '#6366f1', '#3b82f6', '#14b8a6', '#10b981', '#f59e0b',
  '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b',
];

export default function BucketsScreen() {
  const { theme } = useTheme();
  const { state, addBucket, updateBucket, deleteBucket } = useAppState();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  const openAdd = () => {
    setEditingBucket(null);
    setName('');
    setColor(COLORS[0]);
    setModalVisible(true);
  };

  const openEdit = (bucket: Bucket) => {
    setEditingBucket(bucket);
    setName(bucket.name);
    setColor(bucket.color || COLORS[0]);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }
    try {
      if (editingBucket) {
        await updateBucket(editingBucket.id, { name: name.trim(), color });
      } else {
        await addBucket({ id: generateId(), name: name.trim(), color });
      }
      setModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleDelete = (bucket: Bucket) => {
    Alert.alert('Delete Bucket', `Delete "${bucket.name}"? Transactions using this bucket will keep their data.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteBucket(bucket.id) },
    ]);
  };

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <FlatList
        data={state.buckets}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <TouchableOpacity style={styles.itemContent} onPress={() => { hapticSelection(); openEdit(item); }}>
              <View style={[styles.colorDot, { backgroundColor: item.color || COLORS[0] }]} />
              <Text style={styles.itemName}>{item.name}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { hapticSelection(); handleDelete(item); }} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Buckets</Text>
            <Text style={styles.emptySubtitle}>Add categories to organize your expenses</Text>
          </View>
        }
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} onPress={() => { hapticSelection(); openAdd(); }}>
            <Text style={styles.addBtnText}>+ Add Bucket</Text>
          </TouchableOpacity>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingBucket ? 'Edit Bucket' : 'New Bucket'}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Bucket name"
                placeholderTextColor={theme.colors.textTertiary}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Color</Text>
              <View style={styles.colorGrid}>
                {COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorOption, { backgroundColor: c }, color === c && styles.colorOptionSelected]}
                    onPress={() => { hapticSelection(); setColor(c); }}
                  />
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { hapticSelection(); setModalVisible(false); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => { hapticSelection(); handleSave(); }}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    listContent: { padding: theme.spacing.lg, paddingBottom: 100 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
    },
    itemContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    colorDot: { width: 16, height: 16, borderRadius: 8, marginRight: theme.spacing.md },
    itemName: { fontSize: theme.fontSize.md, color: theme.colors.text, fontWeight: '500' },
    deleteBtn: { paddingHorizontal: theme.spacing.md },
    deleteBtnText: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
    empty: { paddingVertical: theme.spacing.xxl * 2, alignItems: 'center' },
    emptyTitle: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.textSecondary },
    emptySubtitle: { fontSize: theme.fontSize.sm, color: theme.colors.textTertiary, marginTop: theme.spacing.sm },
    addBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg,
      alignItems: 'center',
      marginBottom: theme.spacing.lg,
    },
    addBtnText: { color: '#fff', fontSize: theme.fontSize.md, fontWeight: '600' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.borderRadius.xl,
      borderTopRightRadius: theme.borderRadius.xl,
      padding: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl,
    },
    modalTitle: { fontSize: theme.fontSize.xl, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.xl },
    inputGroup: { marginBottom: theme.spacing.lg },
    label: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: theme.spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: {
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      fontSize: theme.fontSize.md,
      color: theme.colors.text,
    },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    colorOption: { width: 36, height: 36, borderRadius: 18 },
    colorOptionSelected: { borderWidth: 3, borderColor: theme.colors.text },
    modalActions: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg },
    cancelBtn: { flex: 1, padding: theme.spacing.lg, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.background, alignItems: 'center' },
    cancelBtnText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },
    saveBtn: { flex: 1, padding: theme.spacing.lg, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.primary, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: theme.fontSize.md, fontWeight: '600' },
  });
}
