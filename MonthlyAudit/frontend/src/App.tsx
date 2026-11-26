// frontend/src/App.tsx
import { useEffect, useState } from "react";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { apiFetch } from "./lib/api";
import type { UserProfile } from "./types/audit";

export function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiFetch<{ user: UserProfile }>("/api/v1/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#05070b] flex items-center justify-center font-mono text-xs text-slate-400">
        INICIALIZANDO TELEMETRIA SOFTLAN TI...
      </div>
    );
  }

  if (!user) {
    return <LoginPage onSuccess={setUser} />;
  }

  return (
    <DashboardPage
      user={user}
      onLogout={async () => {
        await apiFetch("/api/v1/auth/logout", { method: "POST" });
        setUser(null);
      }}
    />
  );
}

export default App;