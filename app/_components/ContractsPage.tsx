"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../_utils/supabase";
import { Contract, CustomFieldDef, FIXED_FIELDS } from "../_utils/types";

type FormState = Record<string, string>;

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
    const [{ data: contractData, error: contractErr }, { data: fieldData, error: fieldErr }] = await Promise.all([
      supabase.from("cm_contracts").select("*").order("contract_date", { ascending: false }),
      supabase.from("cm_custom_fields").select("*").order("sort_order", { ascending: true }),
    ]);
    if (contractErr) setError(contractErr.message);
    else if (fieldErr) setError(fieldErr.message);
    else {
      setContracts((contractData as Contract[]) || []);
      setCustomFields((fieldData as CustomFieldDef[]) || []);
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
      if (companyFilter && c.insurance_company !== companyFilter) return false;
      if (monthFilter && (!c.contract_date || !c.contract_date.startsWith(monthFilter))) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${c.customer_name ?? ""} ${c.product_name ?? ""} ${c.memo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contracts, companyFilter, monthFilter, search]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => compareValues(a, b, sortKey) * (sortDir === "asc" ? 1 : -1));
    return arr;
  }, [filtered, sortKey, sortDir]);

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

  if (loading) return <div className="p-6 text-foreground/60">불러오는 중...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="p-4 sm:p-6">
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

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border bg-primary-light/60 text-left text-foreground/70">
              {FIXED_FIELDS.map((f) =>
                SORTABLE_KEYS.has(f.key) ? (
                  <th
                    key={f.key}
                    onClick={() => toggleSort(f.key)}
                    className="cursor-pointer select-none whitespace-nowrap px-3 py-2 font-medium hover:text-foreground"
                  >
                    {f.label}
                    <span className="ml-0.5 inline-block w-3 text-primary">
                      {sortKey === f.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </th>
                ) : (
                  <th key={f.key} className="whitespace-nowrap px-3 py-2 font-medium">
                    {f.label}
                  </th>
                )
              )}
              {customFields.map((f) => (
                <th key={f.id} className="whitespace-nowrap px-3 py-2 font-medium">
                  {f.label}
                </th>
              ))}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={FIXED_FIELDS.length + customFields.length + 1} className="px-3 py-8 text-center text-foreground/40">
                  계약 데이터가 없습니다.
                </td>
              </tr>
            )}
            {sorted.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-primary-light/30">
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
                  <button onClick={() => openEdit(c)} className="mr-2 text-primary hover:underline">
                    수정
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:underline">
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowForm(false)}>
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <h3 className="mb-4 text-lg font-bold text-primary">{editingId ? "계약 수정" : "계약 추가"}</h3>
            <div className="grid grid-cols-2 gap-3">
              {FIXED_FIELDS.map((f) => (
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
            <h3 className="mb-4 text-lg font-bold text-primary">항목 관리</h3>
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
