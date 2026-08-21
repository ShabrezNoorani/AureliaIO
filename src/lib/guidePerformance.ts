// Pure, side-effect-free stats derived from guide_assignments / guide_ratings — shared by the
// guide-facing dashboard (GuideHome.tsx) and the owner-facing all-guides overview
// (GuideDashboard.tsx), so both sides compute the same numbers the same way.

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

/** `todayStr` must be a YYYY-MM-DD local date string (see localDateStr in lib/utils). A tour on
    today's date counts as upcoming — it hasn't necessarily happened yet. */
export function computeAssignmentStats(assignments: GuideAssignmentRow[], todayStr: string): AssignmentStats {
  let toursDone = 0, toursUpcoming = 0, totalEarned = 0, paidAmount = 0, pendingAmount = 0;
  for (const a of assignments) {
    const earned = assignmentEarned(a);
    totalEarned += earned;
    if (a.is_paid) paidAmount += earned; else pendingAmount += earned;
    if (a.travel_date && a.travel_date < todayStr) toursDone++;
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
