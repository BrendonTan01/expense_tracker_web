import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { loadFromLocalStorage } from '../utils/storage';

const THEME_STORAGE_KEY = 'theme_preference';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Initialize from localStorage or document class
    const saved = loadFromLocalStorage<string>(THEME_STORAGE_KEY, 'light');
    return saved === 'dark' || document.documentElement.classList.contains('dark-mode');
  });
  const { login, register } = useAuth();

  useEffect(() => {
    // Check if dark mode is active
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark-mode'));
    };
    
    checkDarkMode();
    
    // Watch for changes to dark mode class
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: 'transparent',
    }}>
      <div style={{
        backgroundColor: 'var(--card-bg)',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-lg)',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid var(--border-color)',
      }}>
        <h2 style={{ 
          marginTop: 0, 
          marginBottom: '1.5rem', 
          textAlign: 'center',
          color: 'var(--text-color)',
        }}>
          {isRegister ? 'Create Account' : 'Sign In'}
        </h2>

        {error && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: isDarkMode ? 'rgba(248, 113, 113, 0.15)' : '#ffebee',
            color: isDarkMode ? 'var(--danger-color)' : '#c62828',
            borderRadius: '4px',
            marginBottom: '1rem',
            fontSize: '0.9rem',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="email" style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '500',
              color: 'var(--text-color)',
            }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text-color)',
              }}
              placeholder="your@email.com"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="password" style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '500',
              color: 'var(--text-color)',
            }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text-color)',
              }}
              placeholder={isRegister ? "At least 6 characters" : "Your password"}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: loading ? 'var(--secondary-color)' : 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '1rem',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = 'var(--primary-dark)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = 'var(--primary-color)';
              }
            }}
          >
            {loading ? 'Please wait...' : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div style={{ 
          textAlign: 'center', 
          fontSize: '0.9rem', 
          color: 'var(--text-muted)',
        }}>
          {isRegister ? (
            <>
              Already have an account?{' '}
              <button
                onClick={() => {
                  setIsRegister(false);
                  setError(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-color)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => {
                  setIsRegister(true);
                  setError(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-color)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Register
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
