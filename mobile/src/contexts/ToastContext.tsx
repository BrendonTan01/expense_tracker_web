import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from './AuthContext';
import { getSessionGeneration } from '../utils/api';
import { useTheme } from './ThemeContext';

interface ToastOptions {
  duration?: number;
  onUndo?: () => Promise<void>;
}

interface ToastContextType {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const { user } = useAuth();
  const [onUndo, setOnUndo] = useState<(() => Promise<void>) | undefined>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const running = useRef(false);
  const owner = useRef(getSessionGeneration());
  const session = getSessionGeneration();
  const clearTimer = () => { if (timeout.current) clearTimeout(timeout.current); timeout.current = null; };
  useEffect(() => {
    revision.current += 1;
    clearTimer();
    setVisible(false);
    setOnUndo(undefined);
    setBusy(false);
    running.current = false;
    return clearTimer;
  }, [user?.id, session]);

  const show = useCallback((msg: string, options?: ToastOptions) => {
    clearTimer();
    const current = ++revision.current;
    owner.current = getSessionGeneration();
    running.current = false;
    setBusy(false);
    setFailed(false);
    setMessage(msg);
    setOnUndo(() => options?.onUndo);
    setVisible(true);
    timeout.current = setTimeout(() => {
      if (revision.current !== current) return;
      setVisible(false);
      setOnUndo(undefined);
    }, options?.duration ?? (options?.onUndo ? 8000 : 3000));
  }, []);

  const handleUndo = useCallback(async () => {
    if (!onUndo || running.current || owner.current !== getSessionGeneration()) return;
    const current = revision.current;
    clearTimer();
    running.current = true;
    setBusy(true);
    try {
      await onUndo();
      if (revision.current === current) { setVisible(false); setOnUndo(undefined); }
    } catch {
      if (revision.current === current && owner.current === getSessionGeneration()) {
        setMessage('Undo could not finish. Check your connection and retry.');
        setFailed(true);
      }
    } finally {
      if (revision.current === current) { running.current = false; setBusy(false); }
    }
  }, [onUndo]);

  const styles = createStyles(theme);

  return (
    <ToastContext.Provider value={{ show }}>
      <View style={{ flex: 1 }} collapsable={false}>
        {children}
        {visible && owner.current === session && (
          <View style={styles.container} pointerEvents="box-none">
            <View style={styles.toast}>
            <Text style={styles.message} numberOfLines={2}>{message}</Text>
            {onUndo && (
              <TouchableOpacity onPress={handleUndo} disabled={busy} accessibilityRole="button" style={styles.undoBtn}>
                <Text style={styles.undoText}>{busy ? 'Restoring…' : failed ? 'Retry undo' : 'Undo'}</Text>
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
