import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useTheme, ThemePreference } from '../contexts/ThemeContext';
import { useLayout, DEFAULT_DASHBOARD_SECTIONS, DEFAULT_TABS } from '../contexts/LayoutContext';
import { useAuth } from '../contexts/AuthContext';
import { ACCENT_PALETTES } from '../theme/colors';
import { FontSizePreset } from '../theme/typography';
import { authApi } from '../utils/api';

const FONT_SIZE_OPTIONS: { key: FontSizePreset; label: string }[] = [
  { key: 'small', label: 'S' },
  { key: 'medium', label: 'M' },
  { key: 'large', label: 'L' },
  { key: 'xlarge', label: 'XL' },
];

export default function SettingsScreen({ navigation }: any) {
  const { theme, prefs, setMode, setAccent, setFontSizePreset, setCompact } = useTheme();
  const { layout, toggleDashboardSection, toggleTab, resetLayout } = useLayout();
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Error', 'Please fill in both fields');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    setChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      Alert.alert('Success', 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const styles = createStyles(theme);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Appearance */}
      <Text style={styles.sectionHeader}>Appearance</Text>
      <View style={styles.card}>
        {/* Theme Mode */}
        <Text style={styles.label}>Theme</Text>
        <View style={styles.optionRow}>
          {(['system', 'light', 'dark'] as ThemePreference[]).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[styles.optionBtn, prefs.mode === mode && styles.optionBtnActive]}
              onPress={() => setMode(mode)}
            >
              <Text style={[styles.optionBtnText, prefs.mode === mode && styles.optionBtnTextActive]}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Accent Color */}
        <Text style={[styles.label, { marginTop: theme.spacing.lg }]}>Accent Color</Text>
        <View style={styles.colorRow}>
          {ACCENT_PALETTES.map(palette => (
            <TouchableOpacity
              key={palette.id}
              style={[
                styles.colorCircle,
                { backgroundColor: palette.primary },
                prefs.accentId === palette.id && styles.colorCircleActive,
              ]}
              onPress={() => setAccent(palette.id)}
            />
          ))}
        </View>

        {/* Font Size */}
        <Text style={[styles.label, { marginTop: theme.spacing.lg }]}>Font Size</Text>
        <View style={styles.optionRow}>
          {FONT_SIZE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.optionBtn, prefs.fontSizePreset === opt.key && styles.optionBtnActive]}
              onPress={() => setFontSizePreset(opt.key)}
            >
              <Text style={[styles.optionBtnText, prefs.fontSizePreset === opt.key && styles.optionBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Compact Mode */}
        <View style={[styles.switchRow, { marginTop: theme.spacing.lg }]}>
          <Text style={styles.switchLabel}>Compact Mode</Text>
          <Switch
            value={prefs.compact}
            onValueChange={setCompact}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Dashboard Customisation */}
      <Text style={styles.sectionHeader}>Dashboard Sections</Text>
      <View style={styles.card}>
        {layout.dashboardSections.map(section => (
          <View key={section.id} style={styles.switchRow}>
            <Text style={styles.switchLabel}>{section.label}</Text>
            <Switch
              value={section.visible}
              onValueChange={() => toggleDashboardSection(section.id)}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </View>

      {/* Tab Customisation */}
      <Text style={styles.sectionHeader}>Tabs</Text>
      <View style={styles.card}>
        {layout.tabs.map(tab => (
          <View key={tab.id} style={styles.switchRow}>
            <Text style={styles.switchLabel}>{tab.label}</Text>
            <Switch
              value={tab.visible}
              onValueChange={() => toggleTab(tab.id)}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#fff"
              disabled={tab.id === 'add' || tab.id === 'summary'}
            />
          </View>
        ))}
        <TouchableOpacity style={styles.resetBtn} onPress={() => {
          Alert.alert('Reset Layout', 'Reset dashboard and tabs to defaults?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', onPress: resetLayout },
          ]);
        }}>
          <Text style={styles.resetBtnText}>Reset to Default</Text>
        </TouchableOpacity>
      </View>

      {/* Manage */}
      <Text style={styles.sectionHeader}>Manage</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Buckets')}>
          <Text style={styles.navItemText}>Buckets</Text>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Recurring')}>
          <Text style={styles.navItemText}>Recurring Transactions</Text>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Budgets')}>
          <Text style={styles.navItemText}>Budgets</Text>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Reflections')}>
          <Text style={styles.navItemText}>Reflections</Text>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navItem, { borderBottomWidth: 0 }]} onPress={() => navigation.navigate('Backup')}>
          <Text style={styles.navItemText}>Backup & Restore</Text>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Account */}
      <Text style={styles.sectionHeader}>Account</Text>
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{user?.email || 'Unknown'}</Text>
        </View>

        <Text style={[styles.label, { marginTop: theme.spacing.lg }]}>Change Password</Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Current password"
          placeholderTextColor={theme.colors.textTertiary}
          secureTextEntry
        />
        <TextInput
          style={[styles.input, { marginTop: theme.spacing.sm }]}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password (min 6 characters)"
          placeholderTextColor={theme.colors.textTertiary}
          secureTextEntry
        />
        <TouchableOpacity
          style={[styles.changePasswordBtn, changingPassword && { opacity: 0.6 }]}
          onPress={handleChangePassword}
          disabled={changingPassword}
        >
          {changingPassword ? <ActivityIndicator color="#fff" /> : <Text style={styles.changePasswordBtnText}>Change Password</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { padding: theme.spacing.lg },
    sectionHeader: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: theme.spacing.sm, marginTop: theme.spacing.lg },
    card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg, marginBottom: theme.spacing.sm },
    label: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.colors.text, marginBottom: theme.spacing.sm },
    optionRow: { flexDirection: 'row', gap: theme.spacing.sm },
    optionBtn: { flex: 1, paddingVertical: theme.spacing.sm, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.background, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
    optionBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    optionBtnText: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, fontWeight: '500' },
    optionBtnTextActive: { color: '#fff', fontWeight: '600' },
    colorRow: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
    colorCircle: { width: 36, height: 36, borderRadius: 18 },
    colorCircleActive: { borderWidth: 3, borderColor: theme.colors.text },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing.sm },
    switchLabel: { fontSize: theme.fontSize.md, color: theme.colors.text },
    resetBtn: { marginTop: theme.spacing.md, alignItems: 'center', padding: theme.spacing.sm },
    resetBtnText: { fontSize: theme.fontSize.sm, color: theme.colors.danger },
    navItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
    navItemText: { fontSize: theme.fontSize.md, color: theme.colors.text },
    navArrow: { fontSize: theme.fontSize.xl, color: theme.colors.textTertiary },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoLabel: { fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
    infoValue: { fontSize: theme.fontSize.md, color: theme.colors.text, fontWeight: '500' },
    input: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, fontSize: theme.fontSize.md, color: theme.colors.text },
    changePasswordBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, alignItems: 'center', marginTop: theme.spacing.md },
    changePasswordBtnText: { color: '#fff', fontSize: theme.fontSize.md, fontWeight: '600' },
    logoutBtn: { backgroundColor: theme.colors.danger + '15', borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, alignItems: 'center', marginTop: theme.spacing.xl },
    logoutBtnText: { color: theme.colors.danger, fontSize: theme.fontSize.md, fontWeight: '600' },
  });
}
