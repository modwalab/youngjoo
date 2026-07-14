"use client";

import { useState } from "react";
import Login from "./_components/Login";
import ContractsPage from "./_components/ContractsPage";
import DashboardPage from "./_components/DashboardPage";
import AwardsPage from "./_components/AwardsPage";
import SettingsPage from "./_components/SettingsPage";

type Tab = "contracts" | "dashboard" | "awards" | "settings";

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
    { key: "awards", label: "시상" },
    { key: "settings", label: "설정" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-1 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <h1 className="mr-4 text-lg font-bold text-primary">계약관리</h1>
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-primary text-white" : "text-foreground/70 hover:bg-primary-light"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button onClick={logout} className="ml-auto text-sm text-foreground/50 hover:text-foreground">
          로그아웃
        </button>
      </header>
      <main className="flex-1">
        {tab === "contracts" && <ContractsPage />}
        {tab === "dashboard" && <DashboardPage />}
        {tab === "awards" && <AwardsPage />}
        {tab === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
