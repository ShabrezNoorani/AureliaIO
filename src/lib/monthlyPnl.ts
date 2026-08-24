// Pure, side-effect-free calculations for the "Breakdown P&L" page (src/pages/BreakdownPnlPage.tsx)
// — date-range preset math, status/channel filtering, and period grouping (day / ISO-ish week /
// month) with optional admin-cost allocation. No Supabase calls here; the page owns fetching
// bookings/admin_costs and passes the already-loaded arrays in.

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const lastDayOfMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0);

/** Parses a stored YYYY-MM-DD (optionally with a time/offset suffix, which is ignored) into a
    LOCAL Date at midnight. Never use `new Date(dateStr)` directly on a date-only string — JS
    parses bare "YYYY-MM-DD" as UTC midnight, which can silently shift the date by a day depending
    on the browser's timezone. All date-only arithmetic in this module goes through this. */
function parseYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export type PnlDateField = 'travel' | 'booking';

export type PnlDatePreset =
  | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'ytd' | 'last12Months' | 'all' | 'custom';

export const PNL_DATE_PRESETS: { value: PnlDatePreset; label: string }[] = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisQuarter', label: 'This quarter' },
  { value: 'ytd', label: 'YTD' },
  { value: 'last12Months', label: 'Last 12 months' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom range' },
];

export interface PnlDateRange {
  /** Inclusive YYYY-MM-DD bounds, comparable directly against travel_date/booking_date strings.
      null on either side means unbounded in that direction. */
  start: string | null;
  end: string | null;
}

/** Every preset except 'custom' — that one's bounds come from the caller's own date inputs, not
    from this function, since there's nothing to compute. */
export function computePresetRange(preset: PnlDatePreset, today: Date = new Date()): PnlDateRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case 'thisMonth':
      return { start: ymd(new Date(y, m, 1)), end: ymd(lastDayOfMonth(y, m)) };
    case 'lastMonth': {
      const lm = new Date(y, m - 1, 1);
      return { start: ymd(lm), end: ymd(lastDayOfMonth(lm.getFullYear(), lm.getMonth())) };
    }
    case 'thisQuarter': {
      const qStart = Math.floor(m / 3) * 3;
      return { start: ymd(new Date(y, qStart, 1)), end: ymd(lastDayOfMonth(y, qStart + 2)) };
    }
    case 'ytd':
      return { start: ymd(new Date(y, 0, 1)), end: ymd(today) };
    case 'last12Months':
      // Trailing 12 calendar months inclusive of the current (possibly partial) one.
      return { start: ymd(new Date(y, m - 11, 1)), end: ymd(today) };
    case 'all':
    case 'custom':
      return { start: null, end: null };
  }
}

// ── STATUS ──────────────────────────────────────────────────────────────────────────────────
// bookings.status stores UPCOMING / DONE / NO_SHOW / CANCELLED_EARLY / CANCELLED_LATE. This
// filter presents a single CANCELLED bucket (per the product spec) that matches either cancelled
// variant — the schema keeps the split, the filter UI doesn't need to expose it.
export const PNL_STATUS_BUCKETS = ['UPCOMING', 'DONE', 'NO_SHOW', 'CANCELLED'] as const;
export type PnlStatusBucket = typeof PNL_STATUS_BUCKETS[number];
export const DEFAULT_PNL_STATUSES: PnlStatusBucket[] = ['UPCOMING', 'DONE', 'NO_SHOW'];

export function statusBucket(status: string | null): PnlStatusBucket | null {
  if (!status) return null;
  if (status.startsWith('CANCELLED')) return 'CANCELLED';
  if (status === 'UPCOMING' || status === 'DONE' || status === 'NO_SHOW') return status;
  return null;
}

export interface PnlBooking {
  travel_date: string | null;
  booking_date: string | null;
  status: string | null;
  channel: string | null;
  gross_revenue: number | null;
  ticket_cost: number | null;
  guide_cost: number | null;
  extra_cost: number | null;
  gyg_cost: number | null;
  pax_adult: number | null;
  pax_youth: number | null;
  pax_child: number | null;
  pax_infant: number | null;
}

export interface PnlAdminCost {
  amount: number;
  month: number | null;
  year: number | null;
  /** Precise expense date, when recorded — used to pin an admin cost to a specific day/week (see
      computeAdminCostsByPeriod). Roughly half of existing rows have this null; those fall back to
      an even spread across the row's month. */
  expense_date: string | null;
}

export interface PnlFilterOptions {
  dateField: PnlDateField;
  range: PnlDateRange;
  /** Both sets are literal, explicit membership tests — no hidden "empty means all" behavior.
      Deselecting every status/channel means zero bookings pass, same as any real faceted filter
      (Notion, Airtable, etc.): the caller initializes these to "everything selected" by default,
      so an empty set only ever happens when the person deliberately cleared every option. */
  statuses: Set<PnlStatusBucket>;
  channels: Set<string>;
}

export function filterPnlBookings<T extends PnlBooking>(bookings: T[], opts: PnlFilterOptions): T[] {
  const { dateField, range, statuses, channels } = opts;
  return bookings.filter((b) => {
    const raw = dateField === 'travel' ? b.travel_date : b.booking_date;
    if (!raw) return false;
    const day = raw.slice(0, 10);
    if (range.start && day < range.start) return false;
    if (range.end && day > range.end) return false;

    const bucket = statusBucket(b.status);
    if (!bucket || !statuses.has(bucket)) return false;

    if (!channels.has(b.channel || 'Unknown')) return false;

    return true;
  });
}

/** Distinct channel values present in a booking set, "Unknown" standing in for a blank channel —
    used both to seed the default (all-selected) filter state and to render the toggle list. */
export function uniqueChannelsFrom(bookings: { channel: string | null }[]): string[] {
  return Array.from(new Set(bookings.map((b) => b.channel || 'Unknown'))).sort();
}

const paxTotal = (b: PnlBooking) =>
  (b.pax_adult || 0) + (b.pax_youth || 0) + (b.pax_child || 0) + (b.pax_infant || 0);

/** ticket_cost + guide_cost + extra_cost + gyg_cost, null treated as 0. */
const tourCostOf = (b: PnlBooking) =>
  (b.ticket_cost || 0) + (b.guide_cost || 0) + (b.extra_cost || 0) + (b.gyg_cost || 0);

// ── GRANULARITY ─────────────────────────────────────────────────────────────────────────────
export const PNL_GRANULARITIES = ['day', 'week', 'month'] as const;
export type PnlGranularity = typeof PNL_GRANULARITIES[number];

/** Monday of the week containing dateStr, as a YYYY-MM-DD string. Weeks are keyed by their Monday
    date rather than an ISO year-week number ("2026-W50") — simpler, avoids ISO week-numbering's
    year-boundary edge cases entirely, sorts correctly as a plain string, and is exactly what the
    "Wk of 8 Dec 2026" label needs. */
function mondayOf(dateStr: string): string {
  const d = parseYmd(dateStr);
  const day = d.getDay(); // 0=Sun..6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return ymd(d);
}

function daysInMonth(year: number, month1: number): number {
  return lastDayOfMonth(year, month1 - 1).getDate();
}

/** Every distinct Monday-week-key that overlaps at least one day of the given (year, month). */
function weekKeysInMonth(year: number, month1: number): string[] {
  const last = daysInMonth(year, month1);
  const keys = new Set<string>();
  for (let d = 1; d <= last; d++) keys.add(mondayOf(`${year}-${pad2(month1)}-${pad2(d)}`));
  return Array.from(keys);
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** e.g. "Wk of 8 Dec 2026" — the Monday date passed in is the week's key. */
export function weekLabel(mondayKey: string): string {
  const monday = parseYmd(mondayKey).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Wk of ${monday}`;
}

/** e.g. "22 Aug 2026". */
export function dayLabel(dayKey: string): string {
  return parseYmd(dayKey).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function periodKeyOf(dateStr: string, granularity: PnlGranularity): string {
  const day = dateStr.slice(0, 10);
  if (granularity === 'day') return day;
  if (granularity === 'week') return mondayOf(day);
  return day.slice(0, 7);
}

export function periodLabelOf(key: string, granularity: PnlGranularity): string {
  if (granularity === 'day') return dayLabel(key);
  if (granularity === 'week') return weekLabel(key);
  return monthLabel(key);
}

export interface PeriodRow {
  /** day: YYYY-MM-DD · week: YYYY-MM-DD of that week's Monday · month: YYYY-MM */
  key: string;
  label: string;
  bookings: number;
  travellers: number;
  gross: number;
  tourCost: number;
  tourProfit: number;
}

/**
 * Groups already-filtered bookings into day/week/month rows by the given date field. Rows are
 * generated strictly from periods that have at least one qualifying booking — a period with
 * admin costs but no bookings simply doesn't appear (zero-activity periods are omitted, not
 * padded with empty rows). Tour cost = ticket_cost+guide_cost+extra_cost+gyg_cost, null as 0.
 */
export function groupBookingsByPeriod(
  bookings: PnlBooking[],
  dateField: PnlDateField,
  granularity: PnlGranularity
): PeriodRow[] {
  const map = new Map<string, { bookings: number; travellers: number; gross: number; tourCost: number; tourProfit: number }>();
  bookings.forEach((b) => {
    const raw = dateField === 'travel' ? b.travel_date : b.booking_date;
    if (!raw) return;
    const key = periodKeyOf(raw, granularity);
    if (!map.has(key)) map.set(key, { bookings: 0, travellers: 0, gross: 0, tourCost: 0, tourProfit: 0 });
    const row = map.get(key)!;
    const gross = b.gross_revenue || 0;
    const cost = tourCostOf(b);
    row.bookings++;
    row.travellers += paxTotal(b);
    row.gross += gross;
    row.tourCost += cost;
    row.tourProfit += gross - cost;
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, r]) => ({ key, label: periodLabelOf(key, granularity), ...r }));
}

/**
 * Allocates admin_costs rows to day/week/month period keys.
 *  - MONTH: every row counts fully toward its own (year, month) — expense_date isn't needed, the
 *    row's month bucket IS the period.
 *  - WEEK / DAY: a row WITH expense_date is attributed in full to the single day/week containing
 *    it — precise and correct.
 *  - WEEK / DAY, row has NO expense_date: it can't be pinned to a specific day/week, so rather
 *    than dropping it (undercounts admin cost) or dumping the whole amount on one arbitrary
 *    day/week (overcounts that one period), its amount is split EVENLY across every day/week that
 *    overlaps its (year, month). This keeps the month's total admin cost correct when you sum
 *    across all its days/weeks, while giving each one a fair proportional estimate rather than a
 *    fabricated precise figure. This is a deliberate, documented approximation — the alternative
 *    (no allocation at all for undated rows) would silently make Day/Week P&L look more
 *    profitable than Month P&L for the exact same underlying costs.
 */
export function computeAdminCostsByPeriod(
  adminCosts: PnlAdminCost[],
  granularity: PnlGranularity
): Map<string, number> {
  const byPeriod = new Map<string, number>();
  const add = (key: string, amount: number) => byPeriod.set(key, (byPeriod.get(key) || 0) + amount);

  adminCosts.forEach((c) => {
    const amount = c.amount || 0;
    if (!amount) return;

    if (granularity === 'month') {
      if (c.year == null || c.month == null) return;
      add(`${c.year}-${pad2(c.month)}`, amount);
      return;
    }

    if (c.expense_date) {
      const day = c.expense_date.slice(0, 10);
      add(granularity === 'day' ? day : mondayOf(day), amount);
      return;
    }

    if (c.year == null || c.month == null) return; // nothing to spread across
    if (granularity === 'day') {
      const n = daysInMonth(c.year, c.month);
      for (let d = 1; d <= n; d++) add(`${c.year}-${pad2(c.month)}-${pad2(d)}`, amount / n);
    } else {
      const weeks = weekKeysInMonth(c.year, c.month);
      weeks.forEach((wk) => add(wk, amount / weeks.length));
    }
  });

  return byPeriod;
}

export interface PeriodRowWithAdmin extends PeriodRow {
  adminCost: number;
  netAfterAdmin: number;
}

/** Joins period rows with their admin-cost allocation. A period absent from adminByPeriod (no
    admin cost recorded for it) gets adminCost 0 — rendered as "—" by the page, not "€0". */
export function attachAdminCosts(rows: PeriodRow[], adminByPeriod: Map<string, number>): PeriodRowWithAdmin[] {
  return rows.map((r) => {
    const adminCost = adminByPeriod.get(r.key) || 0;
    return { ...r, adminCost, netAfterAdmin: r.tourProfit - adminCost };
  });
}
