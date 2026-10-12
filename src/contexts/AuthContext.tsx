import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const generation = useRef(0);

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      setToken(storedToken);
      // Verify token and get user info
      void verifyToken(storedToken, generation.current);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (tokenToVerify: string, attempt: number) => {
    try {
      const response = await fetch('/api/auth/verify', {
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`,
        },
      });

      if (attempt !== generation.current) return;
      if (response.ok) {
        const data = await response.json();
        if (attempt !== generation.current) return;
        setUser(data.user);
      } else {
        // Token is invalid, clear it
        localStorage.removeItem('auth_token');
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      if (attempt !== generation.current) return;
      console.error('Token verification failed:', error);
      localStorage.removeItem('auth_token');
      setToken(null);
      setUser(null);
    } finally {
      if (attempt === generation.current) setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const attempt = ++generation.current;
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let errorMessage = 'Login failed';
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } else {
          await response.text(); // Read response to consume body
          errorMessage = `Login failed: ${response.status} ${response.statusText}`;
        }
      } catch (e) {
        errorMessage = `Login failed: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (attempt !== generation.current) return;
    localStorage.setItem('auth_token', data.token);
    setLoading(false);
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (email: string, password: string) => {
    const attempt = ++generation.current;
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let errorMessage = 'Registration failed';
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } else {
          await response.text(); // Read response to consume body
          errorMessage = `Registration failed: ${response.status} ${response.statusText}`;
        }
      } catch (e) {
        errorMessage = `Registration failed: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (attempt !== generation.current) return;
    localStorage.setItem('auth_token', data.token);
    setLoading(false);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    generation.current++;
    setLoading(false);
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
