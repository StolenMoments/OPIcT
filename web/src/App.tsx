import { useEffect, useState } from 'react';
import { api } from './api';
import PracticePage from './pages/PracticePage';
import CorrectPage from './pages/CorrectPage';
import NotesPage from './pages/NotesPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import LoginScreen from './components/LoginScreen';
import './App.css';

type SessionState = 'checking' | 'authenticated' | 'unauthenticated';

export default function App() {
  const [session, setSession] = useState<SessionState>('checking');

  useEffect(() => {
    api<{ authenticated: boolean }>('/auth/session')
      .then(({ authenticated }) => setSession(authenticated ? 'authenticated' : 'unauthenticated'))
      .catch(() => setSession('unauthenticated'));
  }, []);

  if (session === 'checking') {
    return <main className="auth-screen" aria-live="polite"><p className="auth-screen__checking">접속 확인 중...</p></main>;
  }
  if (session === 'unauthenticated') {
    return (
      <LoginScreen
        onLogin={async (password) => {
          await api('/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
          setSession('authenticated');
        }}
      />
    );
  }
  return <AuthenticatedApp onLogout={() => setSession('unauthenticated')} />;
}

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<string>('practice');
  const [online, setOnline] = useState<boolean | null>(null);

  const tabs = [
    { key: 'practice', label: '연습', el: <PracticePage /> },
    { key: 'correct', label: '교정', el: <CorrectPage /> },
    { key: 'notes', label: '노트', el: <NotesPage /> },
    { key: 'history', label: '기록', el: <HistoryPage /> },
    { key: 'settings', label: '설정', el: <SettingsPage onLogout={onLogout} /> },
  ] as const;

  useEffect(() => {
    api<{ ok: boolean }>('/health')
      .then((r) => setOnline(r.ok))
      .catch(() => setOnline(false));
  }, []);

  const statusLabel = online == null ? '확인 중' : online ? '서버 연결됨' : '서버 연결 안 됨';
  const statusDotClass = online == null ? '' : online ? 'app__status-dot--online' : 'app__status-dot--offline';

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand">OPIcT</span>
        <span className="app__status" role="status" aria-live="polite">
          <span className={`app__status-dot ${statusDotClass}`} aria-hidden="true" />
          {statusLabel}
        </span>
      </header>

      <main className="app__main">{tabs.find((t) => t.key === tab)!.el}</main>

      <nav className="app__tabbar" aria-label="주요 화면 전환">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`app__tab ${t.key === tab ? 'app__tab--active' : ''}`}
            aria-current={t.key === tab ? 'page' : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
