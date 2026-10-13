import React, { Component, ComponentType, ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

/** A failed calculation hides its results, while the surrounding navigation stays usable. */
export class FinancialErrorBoundary extends Component<
  { children: ReactNode; fallback: (retry: () => void) => ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? this.props.fallback(() => this.setState({ failed: false }))
      : this.props.children;
  }
}

export function withFinancialErrorBoundary<P extends object>(Screen: ComponentType<P>) {
  return function FinancialScreen(props: P) {
    const { user } = useAuth();
    const { theme } = useTheme();
    const routeKey = (props as { route?: { key?: string } }).route?.key || '';
    return (
      <FinancialErrorBoundary key={`${user?.id || 'signed-out'}:${routeKey}`} fallback={retry => (
        <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, justifyContent: 'center' }}>
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger, fontSize: theme.fontSize.lg, marginBottom: theme.spacing.md }}>
            Unable to calculate these totals
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.md, marginBottom: theme.spacing.lg }}>
            A saved amount may be invalid or the total may be too large. Your records are unchanged. You can use Transactions to check the entries, or try again.
          </Text>
          <TouchableOpacity accessibilityRole="button" onPress={retry}
            style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md }}>
            <Text style={{ color: '#fff', fontSize: theme.fontSize.md }}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}>
        <Screen {...props} />
      </FinancialErrorBoundary>
    );
  };
}
