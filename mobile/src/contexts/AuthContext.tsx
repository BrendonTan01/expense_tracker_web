import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { authApi, getAuthToken, setAuthToken, clearAuthToken, setOnUnauthorized, saveCredentials, clearSavedCredentials, getSavedCredentials } from '../utils/api';
import { saveToStorage, removeFromStorage } from '../utils/storage';

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

  // Called on explicit user logout - clears everything including saved credentials
  const handleLogout = useCallback(() => {
    setToken(null);
    setUser(null);
    (async () => {
      await clearAuthToken();
      await clearSavedCredentials();
      await removeFromStorage('remember_me');
      await removeFromStorage('biometrics_enabled');
    })();
  }, []);

  // Called on 401 - keeps saved credentials so biometric re-login still works
  const handleUnauthorized = useCallback(() => {
    setToken(null);
    setUser(null);
    clearAuthToken();
  }, []);

  // Set the global unauthorized handler
  useEffect(() => {
    setOnUnauthorized(handleUnauthorized);
  }, [handleUnauthorized]);

  // Keep refs for use in AppState callback (avoids stale closures)
  const userRef = useRef<User | null>(null);
  const handleUnauthorizedRef = useRef(handleUnauthorized);
  userRef.current = user;
  handleUnauthorizedRef.current = handleUnauthorized;

  // Load token from SecureStore on mount
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await getAuthToken();
        if (storedToken) {
          setToken(storedToken);
          try {
            const data = await authApi.verify();
            setUser(data.user);
          } catch {
            await clearAuthToken();
            setToken(null);
          }
        }
      } catch (error) {
        console.error('Token load failed:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // When app comes to foreground: re-verify or silent re-login to avoid token expiry surprises
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      const currentUser = userRef.current;
      if (!currentUser) return; // Not logged in, nothing to refresh

      try {
        const credentials = await getSavedCredentials();
        if (credentials) {
          // Silent re-login to get a fresh token every time app opens
          try {
            const data = await authApi.login(credentials.email, credentials.password);
            await setAuthToken(data.token);
            setToken(data.token);
            setUser(data.user);
          } catch {
            // Re-login failed (e.g. password changed); verify current token
            try {
              await authApi.verify();
            } catch {
              handleUnauthorizedRef.current();
            }
          }
        } else {
          // No saved credentials: verify token; if expired, show login
          try {
            await authApi.verify();
          } catch {
            handleUnauthorizedRef.current();
          }
        }
      } catch {
        // Ignore errors (e.g. network) - user can retry on next action
      }
    });
    return () => subscription.remove();
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe?: boolean) => {
    const data = await authApi.login(email, password);
    await setAuthToken(data.token);
    setToken(data.token);
    setUser(data.user);

    if (rememberMe) {
      await saveCredentials(email, password);
      await saveToStorage('remember_me', true);
    } else {
      await clearSavedCredentials();
      await removeFromStorage('remember_me');
      await removeFromStorage('biometrics_enabled');
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const data = await authApi.register(email, password);
    await setAuthToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

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
