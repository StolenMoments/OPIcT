import { useEffect, useState } from "react";
import {
  BookOpenText,
  History,
  Mic2,
  Radio,
  Settings,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "./api";
import PracticePage from "./pages/PracticePage";
import CorrectPage from "./pages/CorrectPage";
import NotesPage from "./pages/NotesPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";
import LoginScreen from "./components/LoginScreen";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";

type SessionState = "checking" | "authenticated" | "unauthenticated";
export type TabKey = "practice" | "correct" | "notes" | "history" | "settings";

const TABS = [
  { key: "practice", label: "연습", icon: Mic2 },
  { key: "correct", label: "교정", icon: Sparkles },
  { key: "notes", label: "노트", icon: BookOpenText },
  { key: "history", label: "기록", icon: History },
  { key: "settings", label: "설정", icon: Settings },
] as const satisfies ReadonlyArray<{
  key: TabKey;
  label: string;
  icon: typeof Mic2;
}>;

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
      <Toaster position="top-center" />
    </ThemeProvider>
  );
}

function AppContent() {
  const [session, setSession] = useState<SessionState>("checking");

  useEffect(() => {
    api<{ authenticated: boolean }>("/auth/session")
      .then(({ authenticated }) =>
        setSession(authenticated ? "authenticated" : "unauthenticated"),
      )
      .catch(() => setSession("unauthenticated"));
  }, []);

  if (session === "checking")
    return (
      <main className="auth-screen auth-screen--checking" aria-live="polite">
        <div className="auth-screen__panel auth-screen__panel--checking">
          <Radio className="auth-screen__signal" aria-hidden="true" />
          <p>접속 확인 중...</p>
        </div>
      </main>
    );
  if (session === "unauthenticated")
    return (
      <LoginScreen
        onLogin={async (password) => {
          await api("/auth/login", {
            method: "POST",
            body: JSON.stringify({ password }),
          });
          setSession("authenticated");
        }}
      />
    );
  return <AuthenticatedApp onLogout={() => setSession("unauthenticated")} />;
}

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<TabKey>("practice");
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ ok: boolean }>("/health")
      .then((response) => setOnline(response.ok))
      .catch(() => setOnline(false));
  }, []);

  const statusLabel =
    online == null
      ? "회선 확인 중"
      : online
        ? "스튜디오 연결됨"
        : "스튜디오 연결 끊김";
  const StatusIcon = online === false ? WifiOff : Wifi;
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <span className="app-brand">
            <Radio aria-hidden="true" /> OPIcT
          </span>
          <span
            className={`connection-status connection-status--${online == null ? "checking" : online ? "online" : "offline"}`}
            role="status"
            aria-live="polite"
          >
            <StatusIcon aria-hidden="true" />
            {statusLabel}
          </span>
        </div>
      </header>
      <main className="app-main">
        <div hidden={tab !== "practice"}>
          <PracticePage visible={tab === "practice"} />
        </div>
        <div hidden={tab !== "correct"}>
          <CorrectPage visible={tab === "correct"} />
        </div>
        <div hidden={tab !== "notes"}>
          <NotesPage />
        </div>
        <div hidden={tab !== "history"}>
          <HistoryPage />
        </div>
        <div hidden={tab !== "settings"}>
          <SettingsPage onLogout={onLogout} />
        </div>
      </main>
      <nav className="bottom-nav" aria-label="주요 화면 전환">
        <div className="bottom-nav__inner">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className="bottom-nav__item"
              data-active={key === tab}
              aria-current={key === tab ? "page" : undefined}
              onClick={() => setTab(key)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
