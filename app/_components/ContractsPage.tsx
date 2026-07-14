"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../_utils/supabase";
import { Contract, CustomFieldDef, Folder, FIXED_FIELDS } from "../_utils/types";

type FormState = Record<string, string>;

const UNASSIGNED = "__unassigned__";

function emptyForm(): FormState {
  const f: FormState = {};
  for (const field of FIXED_FIELDS) f[field.key] = "";
  return f;
}

function contractToForm(c: Contract): FormState {
  const f: FormState = {};
  for (const field of FIXED_FIELDS) {
    const v = c[field.key];
    f[field.key] = v === null || v === undefined ? "" : String(v);
  }
  for (const [k, v] of Object.entries(c.extra || {})) f[`extra.${k}`] = v ?? "";
  return f;
}

function formatNumber(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return n.toLocaleString("ko-KR");
}

const SORTABLE_KEYS = new Set([
  "contract_date",
  "customer_name",
  "product_name",
  "monthly_premium",
  "converted_premium",
  "insurance_company",
]);

const NUMERIC_KEYS = new Set(["monthly_premium", "converted_premium"]);

type SortDir = "asc" | "desc";

function compareValues(a: Contract, b: Contract, key: keyof Contract) {
  const av = a[key];
  const bv = b[key];
  if (av === null || av === undefined || av === "") return bv === null || bv === undefined || bv === "" ? 0 : 1;
  if (bv === null || bv === undefined || bv === "") return -1;
  if (NUMERIC_KEYS.has(key) || (typeof av === "number" && typeof bv === "number")) {
    return Number(av) - Number(bv);
  }
  return String(av).localeCompare(String(bv), "ko");
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const [showFieldManager, setShowFieldManager] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");

  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const [sortKey, setSortKey] = useState<keyof Contract | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState("");
  const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);

  function toggleSort(key: keyof Contract) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function loadAll() {
    if (!supabase) {
      setError("Supabase 환경변수가 설정되지 않았습니다.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const [
      { data: contractData, error: contractErr },
      { data: fieldData, error: fieldErr },
      { data: folderData, error: folderErr },
    ] = await Promise.all([
      supabase.from("cm_contracts").select("*").order("contract_date", { ascending: false }),
      supabase.from("cm_custom_fields").select("*").order("sort_order", { ascending: true }),
      supabase.from("cm_folders").select("*").order("sort_order", { ascending: true }),
    ]);
    if (contractErr) setError(contractErr.message);
    else if (fieldErr) setError(fieldErr.message);
    else {
      setContracts((contractData as Contract[]) || []);
      setCustomFields((fieldData as CustomFieldDef[]) || []);
      // cm_folders may not exist yet until the folder-feature SQL migration is run; degrade gracefully.
      setFolders(folderErr ? [] : (folderData as Folder[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of contracts) if (c.insurance_company) set.add(c.insurance_company);
    return Array.from(set).sort();
  }, [contracts]);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (selectedFolder === UNASSIGNED && c.folder_id) return false;
      if (selectedFolder && selectedFolder !== UNASSIGNED && c.folder_id !== selectedFolder) return false;
      if (companyFilter && c.insurance_company !== companyFilter) return false;
      if (monthFilter && (!c.contract_date || !c.contract_date.startsWith(monthFilter))) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${c.customer_name ?? ""} ${c.product_name ?? ""} ${c.memo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contracts, selectedFolder, companyFilter, monthFilter, search]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => compareValues(a, b, sortKey) * (sortDir === "asc" ? 1 : -1));
    return arr;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    setLastCheckedIndex(null);
  }, [selectedFolder, companyFilter, monthFilter, search, sortKey, sortDir]);

  const allVisibleSelected = sorted.length > 0 && sorted.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const c of sorted) next.delete(c.id);
        return next;
      }
      const next = new Set(prev);
      for (const c of sorted) next.add(c.id);
      return next;
    });
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCheckboxClick(e: React.MouseEvent<HTMLInputElement>, id: string, index: number) {
    if (e.shiftKey && lastCheckedIndex !== null) {
      const [start, end] = index < lastCheckedIndex ? [index, lastCheckedIndex] : [lastCheckedIndex, index];
      const rangeIds = sorted.slice(start, end + 1).map((c) => c.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const rid of rangeIds) next.add(rid);
        return next;
      });
    } else {
      toggleSelectOne(id);
    }
    setLastCheckedIndex(index);
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(c: Contract) {
    setEditingId(c.id);
    setForm(contractToForm(c));
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!supabase) return;
    if (!confirm("이 계약을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("cm_contracts").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setContracts((prev) => prev.filter((c) => c.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    const extra: Record<string, string> = {};
    for (const cf of customFields) {
      const v = form[`extra.${cf.field_key}`];
      if (v !== undefined && v !== "") extra[cf.field_key] = v;
    }

    const payload = {
      contract_date: form.contract_date || null,
      customer_name: form.customer_name || null,
      product_name: form.product_name || null,
      monthly_premium: form.monthly_premium ? Number(form.monthly_premium) : null,
      converted_premium: form.converted_premium ? Number(form.converted_premium) : null,
      payment_period: form.payment_period || null,
      insurance_company: form.insurance_company || null,
      design_number: form.design_number || null,
      memo: form.memo || null,
      extra,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { data, error } = await supabase
        .from("cm_contracts")
        .update(payload)
        .eq("id", editingId)
        .select()
        .single();
      if (error) {
        alert(error.message);
        return;
      }
      setContracts((prev) => prev.map((c) => (c.id === editingId ? (data as Contract) : c)));
    } else {
      const { data, error } = await supabase.from("cm_contracts").insert(payload).select().single();
      if (error) {
        alert(error.message);
        return;
      }
      setContracts((prev) => [data as Contract, ...prev]);
    }
    setShowForm(false);
  }

  async function handleAddField(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !newFieldLabel.trim()) return;
    const fieldKey = `f_${Date.now()}`;
    const { data, error } = await supabase
      .from("cm_custom_fields")
      .insert({ field_key: fieldKey, label: newFieldLabel.trim(), sort_order: customFields.length })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setCustomFields((prev) => [...prev, data as CustomFieldDef]);
    setNewFieldLabel("");
  }

  async function handleRemoveField(id: string) {
    if (!supabase) return;
    if (!confirm("이 항목을 삭제하시겠습니까? (기존 계약에 입력된 값은 숨겨지며 삭제되지 않습니다)")) return;
    const { error } = await supabase.from("cm_custom_fields").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setCustomFields((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleAddFolder() {
    if (!supabase) return;
    const name = prompt("새 폴더 이름을 입력하세요");
    if (!name || !name.trim()) return;
    const { data, error } = await supabase
      .from("cm_folders")
      .insert({ name: name.trim(), sort_order: folders.length })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setFolders((prev) => [...prev, data as Folder]);
  }

  async function handleDeleteFolder(id: string) {
    if (!supabase) return;
    if (!confirm("이 폴더를 삭제하시겠습니까? (폴더 안의 계약은 미분류로 이동합니다)")) return;
    const { error } = await supabase.from("cm_folders").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setContracts((prev) => prev.map((c) => (c.folder_id === id ? { ...c, folder_id: null } : c)));
    if (selectedFolder === id) setSelectedFolder(null);
  }

  async function handleRenameFolder(f: Folder) {
    if (!supabase) return;
    const name = prompt("폴더 이름 수정", f.name);
    if (!name || !name.trim() || name.trim() === f.name) return;
    const { error } = await supabase.from("cm_folders").update({ name: name.trim() }).eq("id", f.id);
    if (error) {
      alert(error.message);
      return;
    }
    setFolders((prev) => prev.map((x) => (x.id === f.id ? { ...x, name: name.trim() } : x)));
  }

  async function handleMoveFolder(index: number, direction: -1 | 1) {
    if (!supabase) return;
    const target = index + direction;
    if (target < 0 || target >= folders.length) return;
    const a = folders[index];
    const b = folders[target];
    const [{ error: errA }, { error: errB }] = await Promise.all([
      supabase.from("cm_folders").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("cm_folders").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    if (errA || errB) {
      alert((errA || errB)?.message);
      return;
    }
    setFolders((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [
        { ...next[target], sort_order: a.sort_order },
        { ...next[index], sort_order: b.sort_order },
      ];
      return next;
    });
  }

  async function handleMoveSelected() {
    if (!supabase || selectedIds.size === 0) return;
    const targetId = moveTarget === UNASSIGNED || moveTarget === "" ? null : moveTarget;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("cm_contracts").update({ folder_id: targetId }).in("id", ids);
    if (error) {
      alert(error.message);
      return;
    }
    setContracts((prev) => prev.map((c) => (selectedIds.has(c.id) ? { ...c, folder_id: targetId } : c)));
    setSelectedIds(new Set());
    setMoveTarget("");
  }

  if (loading) return <div className="p-6 text-foreground/60">불러오는 중...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  const gridFields = FIXED_FIELDS.filter((f) => f.key !== "customer_name");

  return (
    <div className="flex gap-4 p-4 sm:p-6">
      <aside className="w-40 flex-shrink-0 sm:w-48">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-foreground/50">폴더</span>
          <button onClick={handleAddFolder} className="text-xs font-medium text-primary hover:underline">
            + 추가
          </button>
        </div>
        <ul className="space-y-0.5">
          <li>
            <button
              onClick={() => setSelectedFolder(null)}
              className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm ${
                selectedFolder === null ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-primary-light"
              }`}
            >
              전체
            </button>
          </li>
          <li>
            <button
              onClick={() => setSelectedFolder(UNASSIGNED)}
              className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm ${
                selectedFolder === UNASSIGNED ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-primary-light"
              }`}
            >
              미분류
            </button>
          </li>
          {folders.map((f, i) => (
            <li key={f.id} className="group flex items-center">
              <button
                onClick={() => setSelectedFolder(f.id)}
                onDoubleClick={() => handleRenameFolder(f)}
                className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-sm ${
                  selectedFolder === f.id ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-primary-light"
                }`}
                title="더블클릭하면 이름 수정"
              >
                {f.name}
              </button>
              <div className="ml-0.5 hidden shrink-0 items-center group-hover:flex">
                <button
                  onClick={() => handleMoveFolder(i, -1)}
                  disabled={i === 0}
                  className="px-0.5 text-xs text-foreground/40 hover:text-primary disabled:opacity-20"
                  title="위로 이동"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMoveFolder(i, 1)}
                  disabled={i === folders.length - 1}
                  className="px-0.5 text-xs text-foreground/40 hover:text-primary disabled:opacity-20"
                  title="아래로 이동"
                >
                  ▼
                </button>
                <button
                  onClick={() => handleRenameFolder(f)}
                  className="px-0.5 text-xs text-foreground/40 hover:text-primary"
                  title="이름 수정"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDeleteFolder(f.id)}
                  className="px-0.5 text-xs text-foreground/40 hover:text-red-500"
                  title="폴더 삭제"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="고객명/상품명/비고 검색"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">전체 보험사</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowFieldManager(true)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-primary-light"
            >
              항목 관리
            </button>
            <button
              onClick={openNew}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              + 계약 추가
            </button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-primary-light px-3 py-2">
            <span className="text-sm font-medium text-primary">{selectedIds.size}개 선택됨</span>
            <select
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">이동할 폴더 선택</option>
              <option value={UNASSIGNED}>미분류</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleMoveSelected}
              disabled={!moveTarget}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              이동
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-sm text-foreground/50 hover:text-foreground"
            >
              선택 해제
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-primary/20 bg-panel shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-primary text-left text-primary-foreground">
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="accent-white" />
                </th>
                {FIXED_FIELDS.map((f) =>
                  SORTABLE_KEYS.has(f.key) ? (
                    <th
                      key={f.key}
                      onClick={() => toggleSort(f.key)}
                      className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-semibold hover:bg-white/10"
                    >
                      {f.label}
                      <span className="ml-0.5 inline-block w-3">
                        {sortKey === f.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </th>
                  ) : (
                    <th key={f.key} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                      {f.label}
                    </th>
                  )
                )}
                {customFields.map((f) => (
                  <th key={f.id} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {f.label}
                  </th>
                ))}
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={FIXED_FIELDS.length + customFields.length + 2} className="px-3 py-8 text-center text-foreground/40">
                    계약 데이터가 없습니다.
                  </td>
                </tr>
              )}
              {sorted.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => openEdit(c)}
                  className="cursor-pointer border-b border-primary/10 bg-surface last:border-0 hover:bg-primary-light/50"
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => {}}
                      onClick={(e) => handleCheckboxClick(e, c.id, i)}
                      className="accent-primary"
                      title="Shift+클릭으로 범위 선택"
                    />
                  </td>
                  {FIXED_FIELDS.map((f) => (
                    <td key={f.key} className="whitespace-nowrap px-3 py-2 text-foreground">
                      {f.type === "number" ? formatNumber(c[f.key] as number | null) : (c[f.key] as string) || ""}
                    </td>
                  ))}
                  {customFields.map((f) => (
                    <td key={f.id} className="whitespace-nowrap px-3 py-2 text-foreground">
                      {c.extra?.[f.field_key] || ""}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(c.id);
                      }}
                      className="text-red-500 hover:underline"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowForm(false)}>
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <input
              value={form.customer_name ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))}
              placeholder="고객명"
              className="mb-4 w-full border-b-2 border-primary/30 bg-transparent pb-2 text-xl font-bold text-primary outline-none focus:border-primary"
            />
            <div className="grid grid-cols-2 gap-3">
              {gridFields.map((f) => (
                <div key={f.key} className={f.key === "memo" ? "col-span-2" : ""}>
                  <label className="mb-1 block text-xs text-foreground/60">{f.label}</label>
                  <input
                    type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                    step={f.type === "number" ? "any" : undefined}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
              ))}
              {customFields.map((f) => (
                <div key={f.id}>
                  <label className="mb-1 block text-xs text-foreground/60">{f.label}</label>
                  <input
                    type="text"
                    value={form[`extra.${f.field_key}`] ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, [`extra.${f.field_key}`]: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-primary-light"
              >
                취소
              </button>
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
                저장
              </button>
            </div>
          </form>
        </div>
      )}

      {showFieldManager && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowFieldManager(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <h3 className="mb-4 text-lg font-bold text-foreground">항목 관리</h3>
            <ul className="mb-4 space-y-2">
              {customFields.length === 0 && <li className="text-sm text-foreground/40">추가 항목이 없습니다.</li>}
              {customFields.map((f) => (
                <li key={f.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="text-foreground">{f.label}</span>
                  <button onClick={() => handleRemoveField(f.id)} className="text-red-500 hover:underline">
                    삭제
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddField} className="flex gap-2">
              <input
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="새 항목 이름 (예: 담당설계사)"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover">
                추가
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
