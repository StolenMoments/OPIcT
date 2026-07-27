import { useEffect, useState } from 'react';
import { api } from './api';
import PracticePage from './pages/PracticePage';
import CorrectPage from './pages/CorrectPage';
import NotesPage from './pages/NotesPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';

const TABS = [
  { key: 'practice', label: '연습', el: <PracticePage /> },
  { key: 'correct', label: '교정', el: <CorrectPage /> },
  { key: 'notes', label: '노트', el: <NotesPage /> },
  { key: 'history', label: '기록', el: <HistoryPage /> },
  { key: 'settings', label: '설정', el: <SettingsPage /> },
] as const;

export default function App() {
  const [tab, setTab] = useState<string>('practice');
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ ok: boolean }>('/health').then((r) => setOnline(r.ok)).catch(() => setOnline(false));
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 64 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: 12 }}>
        <strong>OPIcT</strong>
        <span>{online == null ? '…' : online ? '서버 연결됨' : '서버 연결 안 됨'}</span>
      </header>
      <main style={{ padding: 12 }}>{TABS.find((t) => t.key === tab)!.el}</main>
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', borderTop: '1px solid #ccc', background: 'inherit' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex: 1, padding: 12, fontWeight: t.key === tab ? 700 : 400 }}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
