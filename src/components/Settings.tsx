import './Settings.css';
import DarkModeToggle from './DarkModeToggle';

interface SettingsProps {
  activeSubTab: 'buckets' | 'recurring' | 'budgets';
  onNavigate: (tab: 'buckets' | 'recurring' | 'budgets') => void;
}

export default function Settings({ activeSubTab, onNavigate }: SettingsProps) {
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
    </div>
  );
}
