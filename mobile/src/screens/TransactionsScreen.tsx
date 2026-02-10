import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  RefreshControl, Alert, Dimensions,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { formatCurrency, formatDate } from '../utils/dateHelpers';
import { Transaction } from '../types';
import { hapticMedium, hapticSelection } from '../utils/haptics';

type SortField = 'date' | 'amount';
type SortDir = 'asc' | 'desc';

export default function TransactionsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { state, deleteTransaction, deleteTransactions, refreshAll } = useAppState();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income' | 'investment'>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const filtered = useMemo(() => {
    let txns = [...state.transactions];

    // Type filter
    if (typeFilter !== 'all') {
      txns = txns.filter(t => t.type === typeFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      txns = txns.filter(t =>
        t.description.toLowerCase().includes(q) ||
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        t.amount.toString().includes(q)
      );
    }

    // Sort
    txns.sort((a, b) => {
      const valA = sortField === 'date' ? a.date : a.amount;
      const valB = sortField === 'date' ? b.date : b.amount;
      const cmp = typeof valA === 'string' ? valA.localeCompare(valB as string) : (valA as number) - (valB as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return txns;
  }, [state.transactions, typeFilter, search, sortField, sortDir]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLongPress = (id: string) => {
    hapticMedium();
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  };

  const handleDeleteSelected = () => {
    Alert.alert(
      'Delete Transactions',
      `Delete ${selectedIds.size} selected transaction(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTransactions(Array.from(selectedIds));
            setSelectedIds(new Set());
            setSelectionMode(false);
          },
        },
      ]
    );
  };

  const handleDelete = (txn: Transaction) => {
    Alert.alert('Delete Transaction', `Delete "${txn.description}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(txn.id) },
    ]);
  };

  const getBucketName = (bucketId?: string) => {
    if (!bucketId) return '';
    return state.buckets.find(b => b.id === bucketId)?.name || '';
  };

  const getBucketColor = (bucketId?: string) => {
    if (!bucketId) return theme.colors.textTertiary;
    return state.buckets.find(b => b.id === bucketId)?.color || theme.colors.textTertiary;
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'income': return theme.colors.income;
      case 'expense': return theme.colors.expense;
      case 'investment': return theme.colors.investment;
      default: return theme.colors.text;
    }
  };

  const styles = createStyles(theme);

  const renderItem = ({ item }: { item: Transaction }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.txnItem, isSelected && styles.txnItemSelected]}
        onPress={() => {
          if (selectionMode) {
            toggleSelect(item.id);
          } else {
            navigation.navigate('TransactionForm', { transaction: item });
          }
        }}
        onLongPress={() => handleLongPress(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.txnLeft}>
          <View style={[styles.typeDot, { backgroundColor: typeColor(item.type) }]} />
          <View style={styles.txnInfo}>
            <Text style={styles.txnDesc} numberOfLines={1}>{item.description}</Text>
            <View style={styles.txnMeta}>
              <Text style={styles.txnDate}>{formatDate(item.date)}</Text>
              {item.bucketId && (
                <View style={[styles.bucketBadge, { backgroundColor: getBucketColor(item.bucketId) + '20' }]}>
                  <Text style={[styles.bucketBadgeText, { color: getBucketColor(item.bucketId) }]} numberOfLines={1}>
                    {getBucketName(item.bucketId)}
                  </Text>
                </View>
              )}
              {item.isRecurring && <Text style={styles.recurringBadge}>Recurring</Text>}
            </View>
            {item.tags && item.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {item.tags.slice(0, 3).map(tag => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
        <View style={styles.txnRight}>
          <Text style={[styles.txnAmount, { color: typeColor(item.type) }]}>
            {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
          </Text>
          {!selectionMode && (
            <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search & Filters */}
      <View style={styles.filterBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search transactions..."
          placeholderTextColor={theme.colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.typeFilters}>
        {(['all', 'expense', 'income', 'investment'] as const).map(type => (
          <TouchableOpacity
            key={type}
            style={[styles.typeChip, typeFilter === type && styles.typeChipActive]}
            onPress={() => { hapticSelection(); setTypeFilter(type); }}
          >
            <Text style={[styles.typeChipText, typeFilter === type && styles.typeChipTextActive]}>
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sortBar}>
        <TouchableOpacity onPress={() => { setSortField('date'); setSortDir(prev => sortField === 'date' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'); }}>
          <Text style={[styles.sortBtn, sortField === 'date' && styles.sortBtnActive]}>
            Date {sortField === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setSortField('amount'); setSortDir(prev => sortField === 'amount' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'); }}>
          <Text style={[styles.sortBtn, sortField === 'amount' && styles.sortBtnActive]}>
            Amount {sortField === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </Text>
        </TouchableOpacity>
        <Text style={styles.countText}>{filtered.length} transactions</Text>
      </View>

      {selectionMode && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selectedIds.size} selected</Text>
          <TouchableOpacity onPress={handleDeleteSelected} style={styles.selectionDeleteBtn}>
            <Text style={styles.selectionDeleteText}>Delete Selected</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }} style={styles.selectionCancelBtn}>
            <Text style={styles.selectionCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Transactions</Text>
            <Text style={styles.emptySubtitle}>Tap the + button to add your first transaction</Text>
          </View>
        }
      />
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    filterBar: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
    searchInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      fontSize: theme.fontSize.md,
      color: theme.colors.text,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    typeFilters: {
      flexDirection: 'row',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    typeChip: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    typeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    typeChipText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    typeChipTextActive: { color: '#ffffff', fontWeight: '600' },
    sortBar: {
      flexDirection: 'row',
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.sm,
      alignItems: 'center',
      gap: theme.spacing.lg,
    },
    sortBtn: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    sortBtnActive: { color: theme.colors.primary, fontWeight: '600' },
    countText: { fontSize: theme.fontSize.xs, color: theme.colors.textTertiary, marginLeft: 'auto' },
    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.primary + '15',
      gap: theme.spacing.md,
    },
    selectionText: { fontSize: theme.fontSize.sm, color: theme.colors.primary, fontWeight: '600' },
    selectionDeleteBtn: { backgroundColor: theme.colors.danger, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, borderRadius: theme.borderRadius.sm },
    selectionDeleteText: { color: '#fff', fontSize: theme.fontSize.sm, fontWeight: '600' },
    selectionCancelBtn: { marginLeft: 'auto' },
    selectionCancelText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
    listContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: 100 },
    txnItem: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
    },
    txnItemSelected: {
      backgroundColor: theme.colors.primary + '15',
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },
    txnLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    typeDot: { width: 8, height: 8, borderRadius: 4, marginRight: theme.spacing.sm },
    txnInfo: { flex: 1 },
    txnDesc: { fontSize: theme.fontSize.md, color: theme.colors.text, fontWeight: '500' },
    txnMeta: { flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.xs, gap: theme.spacing.sm, flexWrap: 'wrap' },
    txnDate: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
    bucketBadge: { paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.borderRadius.sm },
    bucketBadgeText: { fontSize: theme.fontSize.xs, fontWeight: '500' },
    recurringBadge: { fontSize: theme.fontSize.xs, color: theme.colors.primary, fontWeight: '500' },
    tagsRow: { flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
    tagChip: { backgroundColor: theme.colors.borderLight, paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.borderRadius.sm },
    tagText: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary },
    txnRight: { alignItems: 'flex-end', marginLeft: theme.spacing.md },
    txnAmount: { fontSize: theme.fontSize.md, fontWeight: '700' },
    deleteBtn: { marginTop: theme.spacing.xs },
    deleteBtnText: { fontSize: theme.fontSize.xs, color: theme.colors.danger },
    emptyContainer: { paddingVertical: theme.spacing.xxl * 2, alignItems: 'center' },
    emptyTitle: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.colors.textSecondary },
    emptySubtitle: { fontSize: theme.fontSize.sm, color: theme.colors.textTertiary, marginTop: theme.spacing.sm },
  });
}
