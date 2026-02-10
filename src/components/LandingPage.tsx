import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing">
      {/* Navigation */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <span className="landing-logo">Expense Tracker</span>
          <div className="landing-nav-links">
            {user ? (
              <Link to="/app" className="landing-btn landing-btn-primary">
                Go to App
              </Link>
            ) : (
              <>
                <Link to="/login" className="landing-btn landing-btn-ghost">
                  Sign In
                </Link>
                <Link to="/login?register=true" className="landing-btn landing-btn-primary">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <h1 className="landing-hero-title">
          Take Control of Your Finances
        </h1>
        <p className="landing-hero-subtitle">
          Track expenses, set budgets, and gain insights into your spending habits — all in one simple, beautiful app.
        </p>
        <div className="landing-hero-actions">
          <Link
            to={user ? '/app' : '/login?register=true'}
            className="landing-btn landing-btn-primary landing-btn-lg"
          >
            {user ? 'Open App' : 'Get Started — It\'s Free'}
          </Link>
          {!user && (
            <Link to="/login" className="landing-btn landing-btn-outline landing-btn-lg">
              Sign In
            </Link>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-features">
        <h2 className="landing-features-title">Everything you need to manage your money</h2>
        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <h3 className="landing-feature-name">Track Expenses</h3>
            <p className="landing-feature-desc">
              Log income, expenses, and investments with categories and tags for effortless organization.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h3 className="landing-feature-name">Set Budgets</h3>
            <p className="landing-feature-desc">
              Create budgets by category and get alerts when you're approaching your spending limits.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
            <h3 className="landing-feature-name">Visual Analytics</h3>
            <p className="landing-feature-desc">
              See where your money goes with interactive charts, trends, and a savings score.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="landing-feature-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h3 className="landing-feature-name">Recurring Transactions</h3>
            <p className="landing-feature-desc">
              Automate regular bills and income so you never miss tracking a recurring payment.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>Built to help you save smarter.</p>
      </footer>
    </div>
  );
}
