// MONTH-END BONUS (guide_monthly.bonus / bonus_note) — a lump sum for a guide for a whole month,
// never tied to a tour. Pure helpers shared by the admin Guide Dashboard, the guide's own earnings
// views, the invoice PDF and the P&L/analytics pages, so every surface reads it the same way:
//  - it belongs to its `month` (YYYY-MM) and is included in a date window whenever that month
//    falls inside the window (same month-prefix rule as filterMonthlyRowsByDateRange);
//  - it is PAID when that month's row is marked paid (guide_monthly.payment_sent), else pending;
//  - it is never counted as a tour.

import type { DateRangeBounds } from './guidePerformance';

export interface MonthBonusSource {
  id?: string;
  guide_id: string | null;
  month: string | null;
  bonus?: number | null;
  bonus_note?: string | null;
  payment_sent?: boolean | null;
}

export interface MonthEndBonus {
  /** guide_monthly.id the bonus lives on. */
  id?: string;
  guide_id: string;
  month: string;
  amount: number;
  note: string | null;
  paid: boolean;
}

/** Every non-zero month-end bonus in `rows`, optionally limited to one guide and/or a window. */
export function listMonthEndBonuses(
  rows: MonthBonusSource[],
  opts: { guideId?: string; bounds?: DateRangeBounds } = {}
): MonthEndBonus[] {
  const startMonth = opts.bounds?.start.slice(0, 7);
  const endMonth = opts.bounds?.end.slice(0, 7);
  const out: MonthEndBonus[] = [];
  for (const r of rows) {
    const amount = Number(r.bonus) || 0;
    if (!amount || !r.guide_id || !r.month) continue;
    if (opts.guideId && r.guide_id !== opts.guideId) continue;
    if (startMonth && r.month < startMonth) continue;
    if (endMonth && r.month > endMonth) continue;
    out.push({ id: r.id, guide_id: r.guide_id, month: r.month, amount, note: r.bonus_note ?? null, paid: !!r.payment_sent });
  }
  return out.sort((a, b) => b.month.localeCompare(a.month));
}

export interface BonusTotals { total: number; paid: number; pending: number }

export function sumMonthEndBonuses(bonuses: MonthEndBonus[]): BonusTotals {
  let total = 0, paid = 0, pending = 0;
  for (const b of bonuses) {
    total += b.amount;
    if (b.paid) paid += b.amount; else pending += b.amount;
  }
  return { total, paid, pending };
}

/** Per guide, within a window — what the admin dashboard adds to each guide's earnings. */
export function bonusTotalsByGuide(rows: MonthBonusSource[], bounds: DateRangeBounds): Map<string, BonusTotals> {
  const byGuide = new Map<string, MonthEndBonus[]>();
  for (const b of listMonthEndBonuses(rows, { bounds })) {
    const arr = byGuide.get(b.guide_id) || [];
    arr.push(b);
    byGuide.set(b.guide_id, arr);
  }
  const out = new Map<string, BonusTotals>();
  byGuide.forEach((list, guideId) => out.set(guideId, sumMonthEndBonuses(list)));
  return out;
}

/** Company-wide guide-pay cost per month (YYYY-MM → total bonus) — for P&L / analytics. Summed
    once per guide_monthly row, so it can never be double-counted by a booking join. */
export function monthEndBonusCostByMonth(rows: { month: string | null; bonus?: number | null }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const amount = Number(r.bonus) || 0;
    if (!amount || !r.month) continue;
    out.set(r.month, (out.get(r.month) || 0) + amount);
  }
  return out;
}

/** True when a Supabase error means the bonus columns aren't migrated yet. */
export function isMissingBonusColumnError(error: { message?: string } | null | undefined): boolean {
  return !!error && /bonus/i.test(error.message || '');
}

/**
 * Runs a guide_monthly select with the bonus columns added, falling back to the original column
 * list if the migration hasn't been run yet — so nothing breaks before the SQL is applied.
 */
export async function selectWithBonusColumns<T>(
  baseColumns: string,
  // Loosely typed on purpose: a dynamic column string can't be checked against the generated
  // Supabase row types, so the caller states the row type via T.
  run: (columns: string) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
): Promise<T[]> {
  const withBonus = await run(`${baseColumns}, bonus, bonus_note`);
  if (!withBonus.error) return (withBonus.data as T[] | null) || [];
  if (!isMissingBonusColumnError(withBonus.error)) return [];
  const fallback = await run(baseColumns);
  return (fallback.data as T[] | null) || [];
}
