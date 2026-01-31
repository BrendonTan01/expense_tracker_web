import { useTheme } from '../contexts/ThemeContext';

export default function DarkModeToggle() {
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <div className="theme-setting">
      <div className="theme-setting-header">
        <div>
          <div className="theme-setting-title">Colour tone</div>
          <div className="theme-setting-subtitle">
            Set to System to follow your device ({resolvedTheme === 'dark' ? 'Dark' : 'Light'} right now).
          </div>
        </div>
      </div>

      <div className="theme-setting-controls" role="group" aria-label="Colour tone">
        <button
          type="button"
          className={`btn btn-sm ${preference === 'system' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setPreference('system')}
        >
          System
        </button>
        <button
          type="button"
          className={`btn btn-sm ${preference === 'light' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setPreference('light')}
        >
          Light
        </button>
        <button
          type="button"
          className={`btn btn-sm ${preference === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setPreference('dark')}
        >
          Dark
        </button>
      </div>
    </div>
  );
}
