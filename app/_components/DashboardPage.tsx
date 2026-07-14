"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../_utils/supabase";
import { Contract, DashboardCompany } from "../_utils/types";

type Metric = "converted_premium" | "monthly_premium";

const UNMATCHED = "미지정";

function todayMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekOfMonth(day: number) {
  return Math.min(Math.ceil(day / 7), 5);
}

function formatWon(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function DashboardPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [companies, setCompanies] = useState<DashboardCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<Metric>("converted_premium");
  const [month, setMonth] = useState(todayMonthStr());
  const [year, setYear] = useState(new Date().getFullYear());

  const [showManager, setShowManager] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setError("Supabase 환경변수가 설정되지 않았습니다.");
        setLoading(false);
        return;
      }
      const [{ data: contractData, error: contractErr }, { data: companyData, error: companyErr }] = await Promise.all([
        supabase.from("cm_contracts").select("*"),
        supabase.from("cm_dashboard_companies").select("*").order("sort_order", { ascending: true }),
      ]);
      if (contractErr) {
        setError(contractErr.message);
        setLoading(false);
        return;
      }
      const contractRows = (contractData as Contract[]) || [];
      setContracts(contractRows);

      if (companyErr) {
        setCompanies([]);
        setLoading(false);
        return;
      }

      const existing = (companyData as DashboardCompany[]) || [];
      const existingNames = new Set(existing.map((c) => c.name));
      // Keep the managed list in sync: any company name that shows up in contracts
      // but isn't tracked yet gets its own row automatically (new premiums should
      // always be visible in 현황, not silently folded into 미지정).
      const missingNames = Array.from(
        new Set(contractRows.map((c) => c.insurance_company).filter((n): n is string => !!n && !existingNames.has(n)))
      );

      if (missingNames.length > 0) {
        const { data: inserted, error: seedErr } = await supabase
          .from("cm_dashboard_companies")
          .insert(missingNames.map((name, i) => ({ name, sort_order: existing.length + i })))
          .select();
        setCompanies(seedErr ? existing : [...existing, ...((inserted as DashboardCompany[]) || [])]);
      } else {
        setCompanies(existing);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleAddCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !newCompanyName.trim()) return;
    const { data, error } = await supabase
      .from("cm_dashboard_companies")
      .insert({ name: newCompanyName.trim(), sort_order: companies.length })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setCompanies((prev) => [...prev, data as DashboardCompany]);
    setNewCompanyName("");
  }

  async function handleRemoveCompany(id: string) {
    if (!supabase) return;
    if (!confirm("이 보험사를 현황에서 제거하시겠습니까? (계약 데이터 자체는 삭제되지 않습니다)")) return;
    const { error } = await supabase.from("cm_dashboard_companies").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setCompanies((prev) => prev.filter((c) => c.id !== id));
  }

  const metricLabel = metric === "converted_premium" ? "환산보험료" : "월납보험료";
  const companyNames = useMemo(() => companies.map((c) => c.name), [companies]);

  // Managed list drives the row set once it's configured. Until then (table not
  // migrated yet, or simply empty), fall back to deriving rows straight from
  // whatever company names already appear in the contracts, so nothing regresses.
  const hasManagedList = companyNames.length > 0;

  const weekly = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const weekCount = weekOfMonth(daysInMonth);
    const inMonth = contracts.filter((c) => c.contract_date && c.contract_date.startsWith(month));

    const byCompany = new Map<string, number[]>();
    if (hasManagedList) for (const name of companyNames) byCompany.set(name, new Array(weekCount).fill(0));
    for (const c of inMonth) {
      const company = hasManagedList
        ? c.insurance_company && companyNames.includes(c.insurance_company)
          ? c.insurance_company
          : UNMATCHED
        : c.insurance_company || UNMATCHED;
      const day = Number(c.contract_date!.slice(8, 10));
      const week = weekOfMonth(day);
      const val = (c[metric] as number | null) || 0;
      if (!byCompany.has(company)) byCompany.set(company, new Array(weekCount).fill(0));
      byCompany.get(company)![week - 1] += val;
    }

    const rows = Array.from(byCompany.entries())
      .filter(([company, weeks]) => companyNames.includes(company) || weeks.some((v) => v !== 0))
      .map(([company, weeks]) => ({ company, weeks, total: weeks.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => {
        if (!hasManagedList) return b.total - a.total;
        if (a.company === UNMATCHED) return 1;
        if (b.company === UNMATCHED) return -1;
        return companyNames.indexOf(a.company) - companyNames.indexOf(b.company);
      });

    const weekTotals = new Array(weekCount).fill(0);
    for (const r of rows) r.weeks.forEach((v, i) => (weekTotals[i] += v));
    const grandTotal = weekTotals.reduce((a, b) => a + b, 0);

    return { weekCount, rows, weekTotals, grandTotal };
  }, [contracts, month, metric, companyNames, hasManagedList]);

  const monthly = useMemo(() => {
    const inYear = contracts.filter((c) => c.contract_date && c.contract_date.startsWith(String(year)));
    const byCompany = new Map<string, number[]>();
    if (hasManagedList) for (const name of companyNames) byCompany.set(name, new Array(12).fill(0));
    for (const c of inYear) {
      const company = hasManagedList
        ? c.insurance_company && companyNames.includes(c.insurance_company)
          ? c.insurance_company
          : UNMATCHED
        : c.insurance_company || UNMATCHED;
      const mo = Number(c.contract_date!.slice(5, 7));
      const val = (c[metric] as number | null) || 0;
      if (!byCompany.has(company)) byCompany.set(company, new Array(12).fill(0));
      byCompany.get(company)![mo - 1] += val;
    }

    const rows = Array.from(byCompany.entries())
      .filter(([company, months]) => companyNames.includes(company) || months.some((v) => v !== 0))
      .map(([company, months]) => ({ company, months, total: months.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => {
        if (!hasManagedList) return b.total - a.total;
        if (a.company === UNMATCHED) return 1;
        if (b.company === UNMATCHED) return -1;
        return companyNames.indexOf(a.company) - companyNames.indexOf(b.company);
      });

    const monthTotals = new Array(12).fill(0);
    for (const r of rows) r.months.forEach((v, i) => (monthTotals[i] += v));
    const grandTotal = monthTotals.reduce((a, b) => a + b, 0);

    return { rows, monthTotals, grandTotal };
  }, [contracts, year, metric, companyNames, hasManagedList]);

  if (loading) return <div className="p-6 text-foreground/60">불러오는 중...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-foreground/60">기준 금액:</span>
        {(["converted_premium", "monthly_premium"] as Metric[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              metric === m ? "bg-primary text-white" : "border border-border bg-surface text-foreground hover:bg-primary-light"
            }`}
          >
            {m === "converted_premium" ? "환산보험료" : "월납보험료"}
          </button>
        ))}
        <button
          onClick={() => setShowManager(true)}
          className="ml-auto rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-primary-light"
        >
          보험사 관리
        </button>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-bold text-foreground">주간 현황 ({metricLabel} 보험사별 합산)</h2>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="overflow-x-auto rounded-xl border border-primary/20 bg-panel shadow-sm">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="bg-primary text-left text-primary-foreground">
                <th className="px-3 py-2.5 font-semibold">보험사</th>
                {Array.from({ length: weekly.weekCount }, (_, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
                    {i + 1}주차
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">합계</th>
              </tr>
            </thead>
            <tbody>
              {weekly.rows.length === 0 && (
                <tr>
                  <td colSpan={weekly.weekCount + 2} className="px-3 py-8 text-center text-foreground/40">
                    이 달의 계약 데이터가 없습니다.
                  </td>
                </tr>
              )}
              {weekly.rows.map((r) => (
                <tr key={r.company} className="border-b border-primary/10 bg-surface last:border-0 hover:bg-primary-light/50">
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{r.company}</td>
                  {r.weeks.map((v, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-foreground">
                      {v ? formatWon(v) : ""}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-foreground">{formatWon(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {weekly.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-accent bg-primary-light/60 font-semibold">
                  <td className="px-3 py-2 text-foreground">합계</td>
                  {weekly.weekTotals.map((v, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-foreground">
                      {formatWon(v)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap rounded-br-xl bg-accent px-3 py-2 text-right text-accent-foreground">{formatWon(weekly.grandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-bold text-foreground">월간 현황 ({metricLabel} 보험사별 합산)</h2>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div className="overflow-x-auto rounded-xl border border-primary/20 bg-panel shadow-sm">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="bg-primary text-left text-primary-foreground">
                <th className="px-3 py-2.5 font-semibold">보험사</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
                    {i + 1}월
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">합계</th>
              </tr>
            </thead>
            <tbody>
              {monthly.rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-3 py-8 text-center text-foreground/40">
                    이 해의 계약 데이터가 없습니다.
                  </td>
                </tr>
              )}
              {monthly.rows.map((r) => (
                <tr key={r.company} className="border-b border-primary/10 bg-surface last:border-0 hover:bg-primary-light/50">
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{r.company}</td>
                  {r.months.map((v, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-foreground">
                      {v ? formatWon(v) : ""}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-foreground">{formatWon(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {monthly.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-accent bg-primary-light/60 font-semibold">
                  <td className="px-3 py-2 text-foreground">합계</td>
                  {monthly.monthTotals.map((v, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-foreground">
                      {formatWon(v)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap rounded-br-xl bg-accent px-3 py-2 text-right text-accent-foreground">{formatWon(monthly.grandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {showManager && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowManager(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <h3 className="mb-4 text-lg font-bold text-primary">보험사 관리</h3>
            <ul className="mb-4 max-h-80 space-y-2 overflow-y-auto">
              {companies.length === 0 && <li className="text-sm text-foreground/40">등록된 보험사가 없습니다.</li>}
              {companies.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="text-foreground">{c.name}</span>
                  <button onClick={() => handleRemoveCompany(c.id)} className="text-red-500 hover:underline">
                    제거
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={handleAddCompany} className="flex gap-2">
              <input
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="새 보험사 이름"
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
