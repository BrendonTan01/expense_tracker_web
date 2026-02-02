import './Settings.css';
import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DarkModeToggle from './DarkModeToggle';

interface SettingsProps {
  activeSubTab: 'buckets' | 'recurring' | 'budgets';
  onNavigate: (tab: 'buckets' | 'recurring' | 'budgets') => void;
}

export default function Settings({ activeSubTab, onNavigate }: SettingsProps) {
  const { user, logout } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const canSubmitPasswordChange = useMemo(() => {
    if (isChangingPassword) return false;
    if (!newPassword || !confirmNewPassword) return false;
    if (newPassword.length < 6) return false;
    if (newPassword !== confirmNewPassword) return false;
    return true;
  }, [confirmNewPassword, isChangingPassword, newPassword]);

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordMessage(null);

    if (!newPassword || !confirmNewPassword) {
      setPasswordError('Please enter and confirm your new password.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    try {
      setIsChangingPassword(true);
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setPasswordError('You are not logged in. Please log in again.');
        return;
      }

      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update password');
        }
        const text = await response.text().catch(() => '');
        throw new Error(text || `Failed to update password (${response.status})`);
      }

      setPasswordMessage('Password updated successfully.');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update password';
      setPasswordError(message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <p className="settings-description">Choose a category to manage:</p>

      <div className="settings-section">
        <h3 className="settings-section-title">Appearance</h3>
        <DarkModeToggle />
      </div>

      <div className="settings-options">
        <button
          className={`settings-option ${activeSubTab === 'buckets' ? 'active' : ''}`}
          onClick={() => onNavigate('buckets')}
        >
          <div className="settings-option-icon">📦</div>
          <div className="settings-option-content">
            <h3>Buckets</h3>
            <p>Manage your expense categories</p>
          </div>
        </button>
        <button
          className={`settings-option ${activeSubTab === 'recurring' ? 'active' : ''}`}
          onClick={() => onNavigate('recurring')}
        >
          <div className="settings-option-icon">🔄</div>
          <div className="settings-option-content">
            <h3>Recurring</h3>
            <p>Manage recurring transactions</p>
          </div>
        </button>
        <button
          className={`settings-option ${activeSubTab === 'budgets' ? 'active' : ''}`}
          onClick={() => onNavigate('budgets')}
        >
          <div className="settings-option-icon">💰</div>
          <div className="settings-option-content">
            <h3>Budgets</h3>
            <p>Set and manage your budgets</p>
          </div>
        </button>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Account</h3>

        <div className="account-row">
          <div className="account-meta">
            <div className="account-label">Signed in as</div>
            <div className="account-email">{user?.email}</div>
          </div>
          <button onClick={logout} className="btn btn-danger">
            Logout
          </button>
        </div>

        <div className="account-divider" />

        <div className="account-change-password">
          <div className="account-label">Change password</div>
          <div className="account-help">
            Choose a new password (minimum 6 characters).
          </div>

          <div className="account-password-grid">
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                className="input"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter a new password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirm-new-password">Confirm new password</label>
              <input
                id="confirm-new-password"
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter the new password"
              />
            </div>
          </div>

          {passwordError && <div className="account-message account-message-error">{passwordError}</div>}
          {passwordMessage && <div className="account-message account-message-success">{passwordMessage}</div>}

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleChangePassword}
              disabled={!canSubmitPasswordChange}
            >
              {isChangingPassword ? 'Updating...' : 'Update password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
