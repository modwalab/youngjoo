"use client";

import { useState } from "react";
import Login from "./_components/Login";
import ContractsPage from "./_components/ContractsPage";
import DashboardPage from "./_components/DashboardPage";
import SettingsPage from "./_components/SettingsPage";

type Tab = "contracts" | "dashboard" | "settings";

export default function Home() {
  const [authed, setAuthed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("cm_auth") === "ok"
  );
  const [tab, setTab] = useState<Tab>("contracts");

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  function logout() {
    localStorage.removeItem("cm_auth");
    setAuthed(false);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "contracts", label: "계약관리" },
    { key: "dashboard", label: "현황" },
    { key: "settings", label: "설정" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-1 bg-primary px-4 py-3 text-primary-foreground shadow-sm sm:px-6">
        <h1 className="mr-4 text-lg font-bold text-primary-foreground">계약관리</h1>
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-white/25 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button onClick={logout} className="ml-auto text-sm text-white/70 hover:text-white">
          로그아웃
        </button>
      </header>
      <main className="flex-1">
        {tab === "contracts" && <ContractsPage />}
        {tab === "dashboard" && <DashboardPage />}
        {tab === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
