import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from './ThemeContext';

interface ToastOptions {
  duration?: number;
  onUndo?: () => void;
}

interface ToastContextType {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [onUndo, setOnUndo] = useState<(() => void) | undefined>();
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string, options?: ToastOptions) => {
    if (timeoutId) clearTimeout(timeoutId);
    setMessage(msg);
    setOnUndo(() => options?.onUndo);
    setVisible(true);

    const duration = options?.duration ?? (options?.onUndo ? 5000 : 3000);
    const id = setTimeout(() => {
      setVisible(false);
      setOnUndo(undefined);
      setTimeoutId(null);
    }, duration);
    setTimeoutId(id);
  }, [timeoutId]);

  const handleUndo = useCallback(() => {
    if (timeoutId) clearTimeout(timeoutId);
    setTimeoutId(null);
    onUndo?.();
    setVisible(false);
  }, [onUndo, timeoutId]);

  const styles = createStyles(theme);

  return (
    <ToastContext.Provider value={{ show }}>
      <View style={{ flex: 1 }} collapsable={false}>
        {children}
        {visible && (
          <View style={styles.container} pointerEvents="box-none">
            <View style={styles.toast}>
            <Text style={styles.message} numberOfLines={2}>{message}</Text>
            {onUndo && (
              <TouchableOpacity onPress={handleUndo} style={styles.undoBtn}>
                <Text style={styles.undoText}>Undo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 100,
      left: theme.spacing.lg,
      right: theme.spacing.lg,
      zIndex: 9999,
    },
    toast: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    message: { flex: 1, fontSize: theme.fontSize.md, color: theme.colors.text },
    undoBtn: { marginLeft: theme.spacing.md },
    undoText: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.primary },
  });
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
