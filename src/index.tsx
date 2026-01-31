import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Root-level error boundary wrapper
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Root error boundary caught error:', error, errorInfo);
    // You could send this to an error reporting service here
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <h1 style={{ color: '#ef4444', marginBottom: '1rem' }}>Something went wrong</h1>
          <p style={{ color: '#64748b', marginBottom: '1rem' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  </React.StrictMode>,
)

// Register the PWA service worker (enables install + faster repeat loads).
const updateSW = registerSW({
  onNeedRefresh() {
    const shouldReload = window.confirm(
      'A new version of Expense Tracker is available. Reload to update?'
    )
    if (shouldReload) updateSW(true)
  },
  onOfflineReady() {
    // App shell is cached and ready for offline/poor-network use.
    // Intentionally quiet (no toast) to avoid interrupting users.
  },
})