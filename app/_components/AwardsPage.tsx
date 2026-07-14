"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../_utils/supabase";
import { AwardFile } from "../_utils/types";

const BUCKET = "award-images";

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${y}년 ${Number(mo)}월`;
}

function publicUrl(path: string) {
  if (!supabase) return "";
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export default function AwardsPage() {
  const [files, setFiles] = useState<AwardFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [extraMonths, setExtraMonths] = useState<string[]>([]);
  const [showAddMonth, setShowAddMonth] = useState(false);
  const [newMonth, setNewMonth] = useState("");
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<AwardFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadAll() {
    if (!supabase) {
      setError("Supabase 환경변수가 설정되지 않았습니다.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from("cm_award_files").select("*").order("month", { ascending: false });
    if (error) {
      // cm_award_files may not exist yet until the SQL migration is run; degrade gracefully.
      setFiles([]);
    } else {
      const rows = (data as AwardFile[]) || [];
      setFiles(rows);
      if (!selectedMonth && rows.length > 0) setSelectedMonth(rows[0].month);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) set.add(f.month);
    for (const m of extraMonths) set.add(m);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [files, extraMonths]);

  const currentFiles = useMemo(() => {
    if (!selectedMonth) return [];
    return files.filter((f) => f.month === selectedMonth);
  }, [files, selectedMonth]);

  function handleAddMonth(e: React.FormEvent) {
    e.preventDefault();
    if (!newMonth) return;
    setExtraMonths((prev) => (prev.includes(newMonth) ? prev : [...prev, newMonth]));
    setSelectedMonth(newMonth);
    setNewMonth("");
    setShowAddMonth(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!supabase || !selectedMonth || !e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    const picked = Array.from(e.target.files);
    for (const file of picked) {
      const path = `${selectedMonth}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) {
        alert(`${file.name}: ${upErr.message}`);
        continue;
      }
      const { data, error: insErr } = await supabase
        .from("cm_award_files")
        .insert({ month: selectedMonth, file_name: file.name, storage_path: path })
        .select()
        .single();
      if (insErr) {
        alert(insErr.message);
        continue;
      }
      setFiles((prev) => [...prev, data as AwardFile]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete(f: AwardFile) {
    if (!supabase) return;
    if (!confirm("이 이미지를 삭제하시겠습니까?")) return;
    await supabase.storage.from(BUCKET).remove([f.storage_path]);
    const { error } = await supabase.from("cm_award_files").delete().eq("id", f.id);
    if (error) {
      alert(error.message);
      return;
    }
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
    if (lightbox?.id === f.id) setLightbox(null);
  }

  if (loading) return <div className="p-6 text-foreground/60">불러오는 중...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="flex gap-4 p-4 sm:p-6">
      <aside className="w-40 flex-shrink-0 sm:w-48">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-foreground/50">폴더 (월별)</span>
          <button onClick={() => setShowAddMonth((v) => !v)} className="text-xs font-medium text-primary hover:underline">
            + 추가
          </button>
        </div>
        {showAddMonth && (
          <form onSubmit={handleAddMonth} className="mb-2 flex gap-1 px-1">
            <input
              type="month"
              value={newMonth}
              onChange={(e) => setNewMonth(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
            />
            <button type="submit" className="rounded-lg bg-primary px-2 text-xs font-medium text-white hover:bg-primary-hover">
              확인
            </button>
          </form>
        )}
        <ul className="space-y-0.5">
          {months.length === 0 && <li className="px-2.5 py-1.5 text-sm text-foreground/40">폴더가 없습니다.</li>}
          {months.map((m) => (
            <li key={m}>
              <button
                onClick={() => setSelectedMonth(m)}
                className={`w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm ${
                  selectedMonth === m ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-primary-light"
                }`}
              >
                {monthLabel(m)}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-bold text-primary">{selectedMonth ? monthLabel(selectedMonth) : "폴더를 선택하세요"} 시상</h2>
          <div className="ml-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
              id="award-upload"
            />
            <label
              htmlFor="award-upload"
              className={`cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover ${
                !selectedMonth || uploading ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {uploading ? "업로드 중..." : "+ 이미지 업로드"}
            </label>
          </div>
        </div>

        {!selectedMonth ? (
          <div className="rounded-xl border border-primary/20 bg-panel p-10 text-center text-foreground/40">
            왼쪽에서 폴더를 선택하거나 새로 추가해주세요.
          </div>
        ) : currentFiles.length === 0 ? (
          <div className="rounded-xl border border-primary/20 bg-panel p-10 text-center text-foreground/40">
            이 달의 시상 이미지가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {currentFiles.map((f) => (
              <div
                key={f.id}
                className="group relative overflow-hidden rounded-xl border border-primary/20 bg-surface shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicUrl(f.storage_path)}
                  alt={f.file_name}
                  onClick={() => setLightbox(f)}
                  className="aspect-square w-full cursor-pointer object-cover"
                />
                <button
                  onClick={() => handleDelete(f)}
                  className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-red-500 group-hover:flex"
                  title="삭제"
                >
                  ✕
                </button>
                <p className="truncate px-2 py-1.5 text-xs text-foreground/60">{f.file_name}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicUrl(lightbox.storage_path)}
            alt={lightbox.file_name}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white hover:bg-white/20"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
