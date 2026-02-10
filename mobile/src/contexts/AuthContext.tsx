import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { authApi, getAuthToken, setAuthToken, clearAuthToken, setOnUnauthorized, saveCredentials, clearSavedCredentials } from '../utils/api';
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
