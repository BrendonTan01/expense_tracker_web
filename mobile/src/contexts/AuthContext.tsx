import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { authApi, invalidateAuthSession, getAuthToken, setAuthToken, clearAuthToken, setOnUnauthorized, saveCredentials, clearSavedCredentials, getSavedCredentials } from '../utils/api';
import { createAuthSession } from '../utils/authSession';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStorageKey } from '../utils/storage';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sessionRef = useRef<ReturnType<typeof createAuthSession> | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = createAuthSession({
      invalidate: invalidateAuthSession, api: authApi, getToken: getAuthToken, setToken: setAuthToken, clearToken: clearAuthToken,
      getCredentials: getSavedCredentials, saveCredentials, clearCredentials: clearSavedCredentials,
      remember: async enabled => {
        if (enabled) await AsyncStorage.setItem(getStorageKey('remember_me'), JSON.stringify(true));
        else {
          const results = await Promise.allSettled([
            AsyncStorage.removeItem(getStorageKey('remember_me')),
            AsyncStorage.removeItem(getStorageKey('biometrics_enabled')),
          ]);
          if (results.some(result => result.status === 'rejected')) {
            throw new Error('Saved sign-in preferences could not be completely cleared.');
          }
        }
      },
      publish: session => { setToken(session?.token ?? null); setUser(session?.user ?? null); },
    });
  }
  const session = sessionRef.current;
  const handleLogout = useCallback(() => {
    void session.logout().catch(() => Alert.alert(
      'Saved sign-in details could not be cleared',
      "You're signed out for now, but saved details may remain on this device. Sign in and try signing out again before sharing it."
    ));
  }, [session]);
  const login = session.login;
  const register = session.register;

  useEffect(() => {
    setOnUnauthorized(() => { void session.unauthorized().catch(() => console.error('Could not clear expired session')); });
    void session.initialize().catch(() => console.error('Could not load session')).finally(() => setLoading(false));
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') void session.foreground();
    });
    return () => { subscription.remove(); setOnUnauthorized(null); };
  }, [session]);

  const value = useMemo(
    () => ({ user, token, login, register, logout: handleLogout, loading }),
    [user, token, login, register, handleLogout, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
