import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { TransactionTemplate, Bucket } from '../types';
import { loadFromStorage } from '../utils/storage';
import { hapticSelection } from '../utils/haptics';
import { formatCurrency } from '../utils/dateHelpers';

const STORAGE_KEY = 'transaction_templates';

interface TransactionTemplatesSectionProps {
  buckets: Bucket[];
  onUseTemplate: (template: TransactionTemplate) => void;
}

export default function TransactionTemplatesSection({ buckets, onUseTemplate }: TransactionTemplatesSectionProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);

  useEffect(() => {
    if (isFocused) {
      loadFromStorage<TransactionTemplate[]>(STORAGE_KEY, []).then(setTemplates);
    }
  }, [isFocused]);

  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Quick add from template</Text>
        <TouchableOpacity onPress={() => { hapticSelection(); navigation.navigate('MoreTab', { screen: 'Templates' }); }}>
          <Text style={styles.manageLink}>Manage</Text>
        </TouchableOpacity>
      </View>
      {templates.length === 0 ? (
        <TouchableOpacity style={styles.emptyChip} onPress={() => { hapticSelection(); navigation.navigate('MoreTab', { screen: 'Templates' }); }}>
          <Text style={styles.emptyChipText}>+ Create your first template</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
          {templates.map(template => {
            const bucket = template.bucketId ? buckets.find(b => b.id === template.bucketId) : null;
            return (
              <TouchableOpacity
                key={template.id}
                style={styles.chip}
                onPress={() => {
                  hapticSelection();
                  onUseTemplate(template);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.chipContent}>
                  <Text style={styles.chipName} numberOfLines={1}>{template.name}</Text>
                <Text style={styles.chipDesc} numberOfLines={1}>
                  {template.description}
                  {template.amount != null ? ` · ${formatCurrency(template.amount)}` : ''}
                </Text>
                  {bucket && (
                    <View style={[styles.bucketDot, { backgroundColor: bucket.color || theme.colors.primary }]} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { marginBottom: theme.spacing.lg },
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
    label: {
      fontSize: theme.fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    manageLink: { fontSize: theme.fontSize.sm, color: theme.colors.primary, fontWeight: '600' },
    emptyChip: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderStyle: 'dashed',
    },
    emptyChipText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, textAlign: 'center' },
    scroll: { flexGrow: 0 },
    chip: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginRight: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minWidth: 140,
    },
    chipContent: { position: 'relative' },
    chipName: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.text },
    chipDesc: { fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
    bucketDot: { position: 'absolute', top: 0, right: 0, width: 6, height: 6, borderRadius: 3 },
  });
}
