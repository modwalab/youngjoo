"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (next !== confirm) {
      setMessage({ type: "error", text: "새 비밀번호가 일치하지 않습니다." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change", currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMessage({ type: "ok", text: "비밀번호가 변경되었습니다." });
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setMessage({ type: "error", text: data.error || "변경에 실패했습니다." });
      }
    } catch {
      setMessage({ type: "error", text: "서버에 연결할 수 없습니다." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h2 className="mb-6 text-lg font-bold text-primary">비밀번호 변경</h2>
      <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <label className="mb-1 block text-sm text-foreground/70">현재 비밀번호</label>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
        />
        <label className="mb-1 block text-sm text-foreground/70">새 비밀번호</label>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
        />
        <label className="mb-1 block text-sm text-foreground/70">새 비밀번호 확인</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground outline-none focus:border-primary"
        />
        {message && (
          <p className={`mb-4 text-sm ${message.type === "ok" ? "text-primary" : "text-red-500"}`}>
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !current || !next}
          className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </div>
  );
}
