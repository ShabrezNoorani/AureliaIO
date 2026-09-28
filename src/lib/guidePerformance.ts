// Pure, side-effect-free stats derived from guide_assignments / guide_ratings — shared by the
// guide-facing dashboard (GuideHome.tsx) and the owner-facing all-guides overview
// (GuideDashboard.tsx), so both sides compute the same numbers the same way.

import { localDateStr } from '@/lib/utils';

export type DateRangePreset = 'today' | 'yesterday' | 'month' | 'mtd' | 'ytd';

export interface DateRangeBounds {
  /** Inclusive, local calendar date (YYYY-MM-DD) — comparable directly against travel_date with
      no timezone shift. */
  start: string;
  end: string;
}

/**
 * The ONE place every dashboard's date-range preset is computed — both the header totals and the
 * per-guide cards on GuideDashboard.tsx call this (via filterAssignmentsByDateRange below) with
 * the exact same bounds, so they can never disagree the way they did before this existed. All
 * arithmetic stays in local time throughout (Date's own getFullYear/getMonth/getDate + localDateStr
 * — never toISOString, which would shift by the browser's UTC offset and could push a boundary
 * date to the wrong side of midnight).
 */
export function getDateRangeBounds(preset: DateRangePreset, today: Date = new Date()): DateRangeBounds {
  const todayStr = localDateStr(today);
  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = localDateStr(y);
      return { start: yStr, end: yStr };
    }
    case 'month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: localDateStr(first), end: localDateStr(last) };
    }
    case 'mtd': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: localDateStr(first), end: todayStr };
    }
    case 'ytd': {
      const first = new Date(today.getFullYear(), 0, 1);
      return { start: localDateStr(first), end: todayStr };
    }
  }
}

/** Filters any travel_date-bearing rows to a DateRangeBounds window — the single function both
    the header totals and the per-guide cards run through, so "the same filtered set feeds both". */
export function filterAssignmentsByDateRange<T extends { travel_date: string | null }>(
  rows: T[],
  bounds: DateRangeBounds
): T[] {
  return rows.filter(r => !!r.travel_date && r.travel_date >= bounds.start && r.travel_date <= bounds.end);
}

export interface GuideAssignmentRow {
  id: string;
  guide_id: string | null;
  travel_date: string | null;
  travel_time: string | null;
  tour_name: string | null;
  tour_type: string | null;
  language: string | null;
  calculated_pay: number | null;
  rate_override: number | null;
  bonus: number | null;
  total_pay: number | null;
  is_paid: boolean | null;
  paid_date: string | null;
  product_code: string | null;
  option_name: string | null;
  booking_ref: string | null;
  clients: string | null;
  notes: string | null;
  pax_count: number | null;
}

export interface GuideRatingRow {
  id: string;
  guide_id: string;
  stars: number;
  quantity: number;
  source: string | null;
  note: string | null;
  verified: boolean | null;
  verified_at: string | null;
  created_at: string | null;
  added_by: string;
}

export interface GuideMonthlyRow {
  id: string;
  guide_id: string | null;
  guide_name: string | null;
  month: string | null;
  tours_completed: number | null;
  amount_owed: number | null;
  invoice_received: string | null;
  invoice_amount: number | null;
  tva: number | null;
  difference: number | null;
  payment_sent: boolean | null;
  payment_date: string | null;
}

/**
 * What a single tour actually paid — total_pay when set, otherwise rate_override (falling back to
 * calculated_pay if no override) plus bonus. Matches the pre-existing owner dashboard convention
 * (total_pay || calculated_pay for the "Total" column) while honoring the task's explicit
 * "total_pay, or rate_override+bonus" fallback rule.
 */
export function assignmentEarned(a: GuideAssignmentRow): number {
  if (a.total_pay != null) return Number(a.total_pay);
  const base = a.rate_override != null ? Number(a.rate_override) : (Number(a.calculated_pay) || 0);
  return base + (Number(a.bonus) || 0);
}

export interface AssignmentStats {
  toursDone: number;
  toursUpcoming: number;
  totalEarned: number;
  paidAmount: number;
  pendingAmount: number;
}

/** `todayStr` must be a YYYY-MM-DD local date string (see localDateStr in lib/utils). A tour dated
    today counts as DONE (owed), matching the session-based pay rule ("tour_date <= today, or the
    guest was checked in, counts as happened") — a tour dated after today is the only thing that
    counts as upcoming/not-yet-owed. */
export function computeAssignmentStats(assignments: GuideAssignmentRow[], todayStr: string): AssignmentStats {
  let toursDone = 0, toursUpcoming = 0, totalEarned = 0, paidAmount = 0, pendingAmount = 0;
  for (const a of assignments) {
    const earned = assignmentEarned(a);
    totalEarned += earned;
    if (a.is_paid) paidAmount += earned; else pendingAmount += earned;
    if (a.travel_date && a.travel_date <= todayStr) toursDone++;
    else toursUpcoming++;
  }
  return { toursDone, toursUpcoming, totalEarned, paidAmount, pendingAmount };
}

export interface MonthlyEarningPoint {
  /** YYYY-MM, sortable */
  month: string;
  /** e.g. "Jan 25" */
  label: string;
  total: number;
}

/** Groups earnings by the month of travel_date. Rows with no travel_date are excluded — there's
    no month to plot them under. */
export function groupMonthlyEarnings(assignments: GuideAssignmentRow[]): MonthlyEarningPoint[] {
  const byMonth = new Map<string, number>();
  for (const a of assignments) {
    if (!a.travel_date) continue;
    const month = a.travel_date.slice(0, 7); // YYYY-MM
    byMonth.set(month, (byMonth.get(month) || 0) + assignmentEarned(a));
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => {
      const [y, m] = month.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      return { month, label, total };
    });
}

export interface RatingStats {
  /** null renders as "—" — no verified reviews to average. */
  avgRating: number | null;
  verifiedReviewCount: number;
  /** null renders as "—" — either no completed tours or no verified reviews to divide by.
      Otherwise 0-100, capped at 100 even if reviews outnumber tours (e.g. group bookings). */
  reviewRatePct: number | null;
}

/** Average = sum(stars*quantity)/sum(quantity) over VERIFIED rows only — unverified rows never
    affect the score. Review rate = verified review count / completed tours, capped at 100%. */
export function computeRatingStats(ratings: GuideRatingRow[], toursDoneCount: number): RatingStats {
  const verified = ratings.filter(r => r.verified);
  const verifiedQty = verified.reduce((sum, r) => sum + r.quantity, 0);
  const weighted = verified.reduce((sum, r) => sum + r.stars * r.quantity, 0);

  const avgRating = verifiedQty > 0 ? weighted / verifiedQty : null;
  const reviewRatePct = (toursDoneCount > 0 && verifiedQty > 0)
    ? Math.min(100, (verifiedQty / toursDoneCount) * 100)
    : null;

  return { avgRating, verifiedReviewCount: verifiedQty, reviewRatePct };
}

// ─── GUIDE SCORE (Quality · Engagement · Punctuality) ──────────────────────────────────────────
// A single fairness rule governs every piece of this: nothing here is a raw count. A brand-new
// guide with 2 perfect reviews must score the same Quality as a veteran with 80, and a guide with
// zero data in a component must never be scored a 0 for it — that would punish "no data yet"
// exactly as if it were "bad", which it isn't. Each component is independently nullable, and the
// combined score renormalizes its weights across whichever components actually have data (see
// computeGuideScore below) rather than ever dividing by a component that isn't there.

/** minutes_late <= this still counts as on-time — a small buffer for a guide who beat the meeting
    point by a minute of clock drift, not a loophole for genuine lateness. */
export const PUNCTUALITY_GRACE_MINUTES = 5;

export const GUIDE_SCORE_WEIGHTS = {
  quality: 0.6,
  engagement: 0.2,
  punctuality: 0.2,
} as const;

export interface ArrivalPunctualityRow {
  minutes_late: number | null;
}

export interface PunctualityStats {
  /** Arrivals recorded WITH a minutes_late value — an arrival logged for a session with no
      parsable meeting time (minutes_late: null) is excluded entirely, never counted as either
      on-time or late. */
  countedArrivals: number;
  onTimeCount: number;
  /** 0-100, or null when there are no counted arrivals yet ("—", never a fabricated 0/100%). */
  onTimePct: number | null;
}

/** On-time = minutes_late <= PUNCTUALITY_GRACE_MINUTES. Rows with minutes_late === null (no
    schedule to measure against) are skipped, not counted as late. */
export function computePunctualityStats(arrivals: ArrivalPunctualityRow[]): PunctualityStats {
  const counted = arrivals.filter((a): a is { minutes_late: number } => a.minutes_late != null);
  const onTime = counted.filter(a => a.minutes_late <= PUNCTUALITY_GRACE_MINUTES);
  return {
    countedArrivals: counted.length,
    onTimeCount: onTime.length,
    onTimePct: counted.length > 0 ? (onTime.length / counted.length) * 100 : null,
  };
}

export interface GuideScoreResult {
  /** Combined 0-100 score, or null only when NONE of the three components have any data at all
      (a brand new guide with no reviews and no arrivals) — never a fake 0. */
  score: number | null;
  quality: { stars: number | null; reviewCount: number };
  engagement: { pct: number | null; toursDone: number; reviewCount: number };
  punctuality: { pct: number | null; arrivalsCount: number };
}

/**
 * COMBINED SCORE = 60% quality + 20% engagement + 20% punctuality, each normalized to 0-100
 * first (quality: stars/5*100). Any component with no data (null) is dropped from both the
 * numerator and the weight total — a guide with reviews but no arrivals yet is scored 60/60
 * quality-only (75%-weighted-equivalent... in practice: 100% of a renormalized 0.6-weight pool),
 * never quality*0.6 + 0 + 0 against the full 1.0. If ALL components are null, score is null.
 */
export function computeGuideScore(
  ratingStats: RatingStats,
  punctualityStats: PunctualityStats,
  toursDoneCount: number,
): GuideScoreResult {
  const qualityPct = ratingStats.avgRating != null ? (ratingStats.avgRating / 5) * 100 : null;
  const engagementPct = ratingStats.reviewRatePct;
  const punctualityPct = punctualityStats.onTimePct;

  const allComponents: { value: number | null; weight: number }[] = [
    { value: qualityPct, weight: GUIDE_SCORE_WEIGHTS.quality },
    { value: engagementPct, weight: GUIDE_SCORE_WEIGHTS.engagement },
    { value: punctualityPct, weight: GUIDE_SCORE_WEIGHTS.punctuality },
  ];
  const components = allComponents.filter((c): c is { value: number; weight: number } => c.value != null);

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const score = totalWeight > 0
    ? components.reduce((sum, c) => sum + c.value * c.weight, 0) / totalWeight
    : null;

  return {
    score,
    quality: { stars: ratingStats.avgRating, reviewCount: ratingStats.verifiedReviewCount },
    engagement: { pct: engagementPct, toursDone: toursDoneCount, reviewCount: ratingStats.verifiedReviewCount },
    punctuality: { pct: punctualityPct, arrivalsCount: punctualityStats.countedArrivals },
  };
}

/** Distinct guide_name values among guide_monthly rows that were imported without ever being
    linked to a real guides row — "name-only" history that must stay visible rather than being
    silently dropped because it has no guide_id to join on. */
export function groupOrphanedMonthlyByName(rows: GuideMonthlyRow[]): Map<string, GuideMonthlyRow[]> {
  const m = new Map<string, GuideMonthlyRow[]>();
  for (const r of rows) {
    if (r.guide_id || !r.guide_name) continue;
    const arr = m.get(r.guide_name) || [];
    arr.push(r);
    m.set(r.guide_name, arr);
  }
  return m;
}

export interface GuideOverviewRow {
  kind: 'real' | 'virtual';
  /** guides.id for a real guide; a synthetic `virtual:<name>` key otherwise — never a real UUID,
      so it can never collide with an actual guide_id. */
  id: string;
  name: string;
  guideNumber: string | null;
  toursDone: number;
  toursUpcoming: number;
  totalEarned: number;
  paidAmount: number;
  pendingAmount: number;
  avgRating: number | null;
  reviewRatePct: number | null;
}

interface MinimalGuide {
  id: string;
  name: string;
  guide_number: string | null;
}

/**
 * One row per real guide (stats from their own guide_assignments/guide_ratings), PLUS one row per
 * distinct guide_name found only in guide_monthly (imported invoice history that was never linked
 * to a guides row) — so those "name-only" guides are never silently hidden from the overview.
 * Virtual rows can only ever report tours/earnings sourced from guide_monthly (tours_completed,
 * amount_owed) since there's no guide_id to attribute any guide_assignments/guide_ratings rows to
 * them — their avgRating/reviewRatePct are always null ("—") rather than a fabricated number.
 */
export function computeGuideOverviewRows(
  guides: MinimalGuide[],
  assignments: GuideAssignmentRow[],
  ratings: GuideRatingRow[],
  monthlyRows: GuideMonthlyRow[],
  todayStr: string
): GuideOverviewRow[] {
  const realRows: GuideOverviewRow[] = guides.map((g) => {
    const guideAssignments = assignments.filter((a) => a.guide_id === g.id);
    const stats = computeAssignmentStats(guideAssignments, todayStr);
    const guideRatings = ratings.filter((r) => r.guide_id === g.id);
    const ratingStats = computeRatingStats(guideRatings, stats.toursDone);
    return {
      kind: 'real',
      id: g.id,
      name: g.name,
      guideNumber: g.guide_number,
      toursDone: stats.toursDone,
      toursUpcoming: stats.toursUpcoming,
      totalEarned: stats.totalEarned,
      paidAmount: stats.paidAmount,
      pendingAmount: stats.pendingAmount,
      avgRating: ratingStats.avgRating,
      reviewRatePct: ratingStats.reviewRatePct,
    };
  });

  const orphaned = groupOrphanedMonthlyByName(monthlyRows);
  const virtualRows: GuideOverviewRow[] = Array.from(orphaned.entries()).map(([name, rows]) => {
    const toursDone = rows.reduce((s, r) => s + (r.tours_completed || 0), 0);
    const paidAmount = rows.filter((r) => r.payment_sent).reduce((s, r) => s + (r.amount_owed || 0), 0);
    const pendingAmount = rows.filter((r) => !r.payment_sent).reduce((s, r) => s + (r.amount_owed || 0), 0);
    return {
      kind: 'virtual',
      id: `virtual:${name}`,
      name,
      guideNumber: null,
      toursDone,
      toursUpcoming: 0,
      totalEarned: paidAmount + pendingAmount,
      paidAmount,
      pendingAmount,
      avgRating: null,
      reviewRatePct: null,
    };
  });

  return [...realRows, ...virtualRows];
}

// ─── SESSION-BASED PAY UNIFICATION ──────────────────────────────────────────────────────────
// The NEW per-session pay model (session_guides.base_pay/bonus, one row per guide per
// tour_session) is a completely separate table from the imported guide_assignments/guide_monthly
// history. Rather than forking every stats/chart/list component to understand two pay sources,
// sessionGuidesToAssignmentRows() converts session_guides rows into GuideAssignmentRow-shaped
// objects — the SAME shape assignmentEarned/computeAssignmentStats/groupMonthlyEarnings/
// TourHistoryList already consume — so a caller just concatenates
// `[...assignments, ...sessionGuidesToAssignmentRows(...)]` and every existing function works on
// both sources at once, unmodified. This IS the unification chokepoint.

export interface SessionGuideForEarnings {
  session_id: string;
  guide_id: string;
  status: string;
  base_pay: number | null;
  bonus: number | null;
}

export interface SessionForEarnings {
  id: string;
  tour_date: string;
  start_time: string | null;
  label: string | null;
}

/**
 * Converts accepted session_guides rows (with a pay figure set) into GuideAssignmentRow-shaped
 * objects. `id` is prefixed "session:" so it can never collide with a real guide_assignments.id.
 * `calculated_pay` carries base_pay, `bonus` carries bonus, `total_pay`/`rate_override` are always
 * null (assignmentEarned() then correctly falls back to calculated_pay+bonus for these rows).
 *
 * PAID is tracked per MONTH for session-based pay (via guide_monthly.payment_sent — see
 * buildUnifiedMonthlyRows below), not per assignment — there's no per-session "mark paid" UI, by
 * design, matching how paid-out pay already works for this app's monthly invoice cycle. So
 * `is_paid` here is DERIVED from whether the guide's `${guide_id}:${YYYY-MM}` key is in
 * `paidMonthsByGuide`, which the caller computes once from the guide_monthly rows it already has
 * (`payment_sent === true`) — this is what lets computeAssignmentStats' existing paid/pending
 * split work correctly for session-derived rows with zero changes to that function.
 *
 * "Happened" (owed, not upcoming) is intentionally just `tour_date <= todayStr`, delegated to
 * computeAssignmentStats' own comparison — the task's fuller rule ("tour_date <= today, OR the
 * guest was checked in") adds no additional cases in practice, since this app's check-in flow only
 * ever operates on TODAY-dated sessions, which `<=` already covers.
 */
export function sessionGuidesToAssignmentRows(
  sessionGuides: SessionGuideForEarnings[],
  sessions: SessionForEarnings[],
  paidMonthsByGuide: Set<string>
): GuideAssignmentRow[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const rows: GuideAssignmentRow[] = [];
  for (const sg of sessionGuides) {
    if (sg.status !== 'accepted') continue;
    if (sg.base_pay == null && sg.bonus == null) continue; // nothing to show — pay is optional
    const s = sessionById.get(sg.session_id);
    if (!s) continue;
    const month = s.tour_date.slice(0, 7);
    rows.push({
      id: `session:${sg.session_id}:${sg.guide_id}`,
      guide_id: sg.guide_id,
      travel_date: s.tour_date,
      travel_time: s.start_time,
      tour_name: s.label,
      tour_type: null,
      language: null,
      calculated_pay: sg.base_pay,
      rate_override: null,
      bonus: sg.bonus,
      total_pay: null,
      is_paid: paidMonthsByGuide.has(`${sg.guide_id}:${month}`),
      paid_date: null,
      product_code: null,
      option_name: s.label,
      booking_ref: null,
      clients: null,
      notes: null,
      pax_count: null,
    });
  }
  return rows;
}

export interface UnifiedMonthlyRow extends GuideMonthlyRow {
  /** false for a real, already-persisted guide_monthly row. true for a month whose ONLY earnings
   *  are session-based and has no guide_monthly row yet — marking a virtual row paid for the first
   *  time must INSERT a new guide_monthly row (see insertGuideMonthlyPayment in
   *  lib/guideRatingActions.ts) rather than updating one, since `id` here is synthetic. */
  isVirtual: boolean;
}

/**
 * Merges a guide's real (imported) guide_monthly rows with their session-based earnings into ONE
 * per-month list, so the existing MonthlyInvoiceList shows both without double-counting:
 * - A month with a real guide_monthly row stays authoritative for invoice/TVA/payment fields —
 *   any session-based earnings for that SAME month are added into its amount_owed/tours_completed
 *   (handles the rare case of overlap; imported history is normally past, session-based pay is
 *   normally going-forward, so in practice these are usually disjoint months).
 * - A month with ONLY session-based earnings and no guide_monthly row gets a synthetic
 *   (isVirtual: true) row, unpaid by default, so it's visible and markable-paid even though
 *   nothing has been persisted for it yet.
 */
export function buildUnifiedMonthlyRows(
  guideId: string,
  guideName: string,
  monthlyRows: GuideMonthlyRow[],
  sessionAssignments: GuideAssignmentRow[]
): UnifiedMonthlyRow[] {
  const realByMonth = new Map(monthlyRows.filter((m) => m.guide_id === guideId).map((m) => [m.month, m]));

  const sessionByMonth = new Map<string, { total: number; count: number }>();
  for (const a of sessionAssignments) {
    if (!a.travel_date) continue;
    const month = a.travel_date.slice(0, 7);
    const cur = sessionByMonth.get(month) || { total: 0, count: 0 };
    cur.total += assignmentEarned(a);
    cur.count += 1;
    sessionByMonth.set(month, cur);
  }

  const months = new Set([...realByMonth.keys(), ...sessionByMonth.keys()].filter((m): m is string => !!m));
  const result: UnifiedMonthlyRow[] = [];
  for (const month of months) {
    const real = realByMonth.get(month);
    const sessionEarn = sessionByMonth.get(month);
    if (real) {
      result.push({
        ...real,
        amount_owed: (real.amount_owed || 0) + (sessionEarn?.total || 0),
        tours_completed: (real.tours_completed || 0) + (sessionEarn?.count || 0),
        isVirtual: false,
      });
    } else if (sessionEarn) {
      result.push({
        id: `virtual-month:${guideId}:${month}`,
        guide_id: guideId,
        guide_name: guideName,
        month,
        tours_completed: sessionEarn.count,
        amount_owed: sessionEarn.total,
        invoice_received: null,
        invoice_amount: null,
        tva: null,
        difference: null,
        payment_sent: false,
        payment_date: null,
        isVirtual: true,
      });
    }
  }
  return result.sort((a, b) => (b.month || '').localeCompare(a.month || ''));
}
