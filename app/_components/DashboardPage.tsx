"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../_utils/supabase";
import { Contract } from "../_utils/types";

type Metric = "converted_premium" | "monthly_premium";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<Metric>("converted_premium");
  const [month, setMonth] = useState(todayMonthStr());
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setError("Supabase 환경변수가 설정되지 않았습니다.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.from("cm_contracts").select("*");
      if (error) setError(error.message);
      else setContracts((data as Contract[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  const metricLabel = metric === "converted_premium" ? "환산보험료" : "월납보험료";

  const weekly = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const weekCount = weekOfMonth(daysInMonth);
    const inMonth = contracts.filter((c) => c.contract_date && c.contract_date.startsWith(month));

    const byCompany = new Map<string, number[]>();
    for (const c of inMonth) {
      const company = c.insurance_company || "미지정";
      const day = Number(c.contract_date!.slice(8, 10));
      const week = weekOfMonth(day);
      const val = (c[metric] as number | null) || 0;
      if (!byCompany.has(company)) byCompany.set(company, new Array(weekCount).fill(0));
      byCompany.get(company)![week - 1] += val;
    }

    const rows = Array.from(byCompany.entries())
      .map(([company, weeks]) => ({ company, weeks, total: weeks.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);

    const weekTotals = new Array(weekCount).fill(0);
    for (const r of rows) r.weeks.forEach((v, i) => (weekTotals[i] += v));
    const grandTotal = weekTotals.reduce((a, b) => a + b, 0);

    return { weekCount, rows, weekTotals, grandTotal };
  }, [contracts, month, metric]);

  const monthly = useMemo(() => {
    const inYear = contracts.filter((c) => c.contract_date && c.contract_date.startsWith(String(year)));
    const byCompany = new Map<string, number[]>();
    for (const c of inYear) {
      const company = c.insurance_company || "미지정";
      const mo = Number(c.contract_date!.slice(5, 7));
      const val = (c[metric] as number | null) || 0;
      if (!byCompany.has(company)) byCompany.set(company, new Array(12).fill(0));
      byCompany.get(company)![mo - 1] += val;
    }

    const rows = Array.from(byCompany.entries())
      .map(([company, months]) => ({ company, months, total: months.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);

    const monthTotals = new Array(12).fill(0);
    for (const r of rows) r.months.forEach((v, i) => (monthTotals[i] += v));
    const grandTotal = monthTotals.reduce((a, b) => a + b, 0);

    return { rows, monthTotals, grandTotal };
  }, [contracts, year, metric]);

  if (loading) return <div className="p-6 text-foreground/60">불러오는 중...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <div className="flex items-center gap-2">
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
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-border bg-primary-light/60 text-left text-foreground/70">
                <th className="px-3 py-2 font-medium">보험사</th>
                {Array.from({ length: weekly.weekCount }, (_, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {i + 1}주차
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">합계</th>
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
                <tr key={r.company} className="border-b border-border last:border-0 hover:bg-primary-light/30">
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
                <tr className="border-t border-border bg-primary-light/40 font-medium">
                  <td className="px-3 py-2 text-foreground">합계</td>
                  {weekly.weekTotals.map((v, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-foreground">
                      {formatWon(v)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right text-primary">{formatWon(weekly.grandTotal)}</td>
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
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-border bg-primary-light/60 text-left text-foreground/70">
                <th className="px-3 py-2 font-medium">보험사</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {i + 1}월
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">합계</th>
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
                <tr key={r.company} className="border-b border-border last:border-0 hover:bg-primary-light/30">
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
                <tr className="border-t border-border bg-primary-light/40 font-medium">
                  <td className="px-3 py-2 text-foreground">합계</td>
                  {monthly.monthTotals.map((v, i) => (
                    <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-foreground">
                      {formatWon(v)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right text-primary">{formatWon(monthly.grandTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
