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
  /** Optional, additive — ONLY ever populated for session-based rows whose caller selected
      session_guides.checkin_time (currently just the admin dashboard; see isAssignmentDone's own
      doc comment). `undefined` means "no checkin signal available for this row" (every imported
      guide_assignments row, and every row from any caller that doesn't select it — including the
      guide's own GuideHome.tsx) — never confused with `null`, which means "signal available, this
      guide hasn't checked in yet". */
  guideCheckinTime?: string | null;
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

/** `todayStr` must be a YYYY-MM-DD local date string (see localDateStr in lib/utils). ONE
    definition of DONE vs UPCOMING, used everywhere this distinction is made (computeAssignmentStats
    below, and the admin dashboard's status filter) so every date-filter preset — "This Month",
    "From Oct 1", "All Time", a custom range — classifies the exact same tour the exact same way:
    - A tour dated strictly BEFORE today is always DONE — the day has fully passed; nothing
      (checked in or not) can make a past tour "upcoming" again.
    - A tour dated strictly AFTER today is always UPCOMING — check-in isn't physically possible
      yet, so there's nothing to re-evaluate.
    - A tour dated TODAY is the only case the check-in signal actually resolves: DONE once this
      guide has checked in (`guideCheckinTime` set), still UPCOMING while they haven't.
    `guideCheckinTime === undefined` means no checkin signal is available for this row at all
    (every imported guide_assignments row, and every caller — GuideHome.tsx included — that never
    selects session_guides.checkin_time): falls back to the plain `travel_date <= todayStr` rule,
    so this is a strictly backward-compatible, additive refinement that only takes effect for rows
    that opt into it. */
export function isAssignmentDone(a: GuideAssignmentRow, todayStr: string): boolean {
  if (!a.travel_date) return false;
  if (a.travel_date < todayStr) return true;
  if (a.travel_date > todayStr) return false;
  // Dated today — resolve via check-in when that signal is available, else fall back to the old
  // date-only rule (today counts as done).
  return a.guideCheckinTime !== undefined ? a.guideCheckinTime != null : true;
}

export function computeAssignmentStats(assignments: GuideAssignmentRow[], todayStr: string): AssignmentStats {
  let toursDone = 0, toursUpcoming = 0, totalEarned = 0, paidAmount = 0, pendingAmount = 0;
  for (const a of assignments) {
    const earned = assignmentEarned(a);
    totalEarned += earned;
    if (a.is_paid) paidAmount += earned; else pendingAmount += earned;
    if (isAssignmentDone(a, todayStr)) toursDone++;
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

// ── INDIVIDUAL GUIDE REVIEWS (guide_reviews) — admin-entered, score-driving ─────────────────────
// A completely separate table/concept from guide_ratings above (which is the guide's own
// self-reported "I heard I got N stars" log, pending the owner's verification). guide_reviews is
// individually entered BY THE OWNER — one row per real review, with who wrote it, where, and
// when — and is what the admin dashboard's per-guide "score" is computed from.

export const REVIEW_PLATFORMS = [
  'Website', 'TripAdvisor', 'Viator', 'GetYourGuide', 'Airbnb', 'Klook', 'KKday', 'Google',
] as const;
export type ReviewPlatform = typeof REVIEW_PLATFORMS[number];

export interface GuideReviewRow {
  id: string;
  guide_id: string;
  stars: number;
  reviewer_name: string | null;
  comment: string | null;
  platform: string | null;
  review_date: string;
  /** Admin-only toggle — an excluded review stays in the record/list (never deleted) but its
      points are left out of the score. `null`/`undefined` (the column may not exist yet, or a
      caller didn't select it) is treated the same as `false` — included by default. */
  excluded_from_score?: boolean | null;
  /** 'approved' | 'pending'. Owner-entered reviews are 'approved' (column default); a review a
      guide submits from their own side starts 'pending' and never counts anywhere until the owner
      approves it. `null`/`undefined` (column not migrated yet, or not selected) = 'approved', so
      every pre-existing review keeps counting exactly as before. */
  approval_status?: string | null;
  /** true when a guide submitted this review themselves (shown to the owner in the approval queue). */
  submitted_by_guide?: boolean | null;
}

/** Only 'pending' is held back — anything else (incl. missing) is an approved review. */
export function isApprovedReview(r: Pick<GuideReviewRow, 'approval_status'>): boolean {
  return (r.approval_status ?? 'approved') !== 'pending';
}

/** The single rule for "does this review's points count": approved AND not excluded_from_score. */
export function reviewCountsTowardScore(r: Pick<GuideReviewRow, 'approval_status' | 'excluded_from_score'>): boolean {
  return isApprovedReview(r) && !r.excluded_from_score;
}

/** The fixed points-per-star scale the score is built from: 5★ rewards, 4★ mildly rewards, 3★
    mildly penalizes, 1★/2★ penalizes equally hard — a genuinely bad review costs the same whether
    it's 1 or 2 stars. Any other value (shouldn't occur — the entry form only offers 1-5) scores 0
    rather than throwing, so one bad row can't crash the whole dashboard. */
export function reviewPoints(stars: number): number {
  switch (stars) {
    case 5: return 1.0;
    case 4: return 0.5;
    case 3: return -0.5;
    case 2: return -1.0;
    case 1: return -1.0;
    default: return 0;
  }
}

export interface GuideReviewScore {
  /** null renders as "—" — no checked-in bookings to divide by, never a divide-by-zero NaN/Infinity. */
  score: number | null;
  /** Count of reviews actually COUNTED toward the score — excludes any row with
      excluded_from_score === true. The full (unfiltered) review list for display is a separate
      concern; this number always matches what the score was actually computed from. */
  reviewCount: number;
  /** Checked-in BOOKINGS (never pax, never tours) — see computeCheckedInBookingRecords. Always
      label this "bookings" in UI copy, never "done tours": a booking with 4 guests is one
      booking, and "done" implies date-based completion, which isn't the actual rule (see that
      function's own doc comment). */
  bookingsGuided: number;
}

/** sum(reviewPoints, excluding any excluded_from_score row) ÷ checked-in bookings — a checked-in
    booking with no review simply dilutes the denominator without adding a point, exactly as the
    spec requires ("contributes 0, handled by the denominator"). Callers are expected to have
    already scoped BOTH `reviews` and `bookingsGuided` to "since Oct 1, 2026" (see
    ADMIN_DEFAULT_FILTER_START) before calling this — this function itself is date-agnostic, just
    the arithmetic. */
export function computeGuideReviewScore(reviews: GuideReviewRow[], bookingsGuided: number): GuideReviewScore {
  const counted = reviews.filter(reviewCountsTowardScore);
  const reviewCount = counted.length;
  if (bookingsGuided <= 0) return { score: null, reviewCount, bookingsGuided };
  const totalPoints = counted.reduce((sum, r) => sum + reviewPoints(r.stars), 0);
  return { score: totalPoints / bookingsGuided, reviewCount, bookingsGuided };
}

export interface CheckinForGuiding {
  booking_ref: string;
  status: string | null;
  /** Required for the booking-count rule below — a checkins row with no travel_date can never be
      positively dated "since Oct 1", so it's excluded rather than assumed to be in-range. */
  travel_date: string | null;
}

export interface SessionBookingForGuiding {
  booking_ref: string;
  allotted_guide_id: string | null;
  /** The DATE still comes from the checkins row itself, never this session (see
      computeCheckedInBookingRecords' own doc comment for why) — but `session_id` IS required now,
      to cross-check that `allotted_guide_id` actually has an accepted session_guides membership
      on THIS session (see buildSessionMembershipKeys). Without that check, a stale
      allotted_guide_id on a session that guide was later removed from — or that never had any
      guide at all — would still count toward their score. */
  session_id: string;
}

export interface SessionDateForGuiding {
  id: string;
  tour_date: string;
}

export interface CheckedInBookingRecord {
  guide_id: string;
  booking_ref: string;
  /** YYYY-MM, from the CHECKIN's own travel_date — what "monthly" scoring groups by. */
  month: string;
}

/**
 * The set of "this guide is actually present on this session" keys — an accepted session_guides
 * row, and nothing else, is what makes a booking's allotted_guide_id (or an arrival's guide_id)
 * TRUSTWORTHY for scoring. A session with NO accepted session_guides rows at all (no guide was
 * ever assigned, or everyone was removed) can never produce a key here, so nothing attributed to
 * it — any allotted_guide_id left over on its bookings, however that happened — can ever pass
 * this check. This is the one shared gate computeCheckedInBookingRecords and
 * computeCheckedInBookingCountsForPeriod both run every allotment through.
 */
export function buildSessionMembershipKeys(sessionGuides: SessionGuideForTourCount[]): Set<string> {
  const keys = new Set<string>();
  for (const sg of sessionGuides) {
    if (sg.status !== 'accepted') continue;
    keys.add(`${sg.guide_id}:${sg.session_id}`);
  }
  return keys;
}

/**
 * THE score's denominator, and the exact definition the spec requires: a "booking guided" is one
 * the guide was ALLOTTED (session_bookings.allotted_guide_id) that ALSO has a `checkins` row with
 * status 'checked_in' and travel_date >= sinceDate, AND that guide actually has an ACCEPTED
 * session_guides membership on the booking's own session (see buildSessionMembershipKeys) — a
 * tour/session with no guide assigned or present counts toward NOBODY's score, regardless of what
 * allotted_guide_id happens to say. No other join — no comparison against "today", nothing from
 * tour_sessions itself. This is deliberately simpler than an earlier version of this function,
 * which filtered by the LINKED SESSION's own tour_date instead of the checkin's own travel_date —
 * the two can diverge (a stale/mismatched session_bookings link, a travel_date correction that the
 * session link didn't follow), and that divergence is exactly what caused two different surfaces
 * to report two different counts for the same guide (e.g. "35" vs the real "47") despite both
 * claiming to count the same thing. Counting directly off the checkins row removes that divergence
 * at the source: every surface that calls this function now counts literally the same set of
 * rows, every time.
 *
 * Counts DISTINCT bookings, never pax, never tours. A booking reassigned between guides
 * (allotted_guide_id updated in place, same session_bookings row — see
 * dedupeAssignmentsAcrossSources' doc comment for the same underlying guarantee elsewhere in this
 * file) is credited to whichever guide currently holds it, never both.
 */
export function computeCheckedInBookingRecords(
  sessionBookings: SessionBookingForGuiding[],
  checkins: CheckinForGuiding[],
  sinceDate: string,
  sessionGuides: SessionGuideForTourCount[]
): CheckedInBookingRecord[] {
  // The LATEST checked-in travel_date on file per booking_ref, since a booking should only ever
  // have one terminal checkins row — but if more than one somehow exists, this is a deterministic,
  // defensive choice rather than an arbitrary "whichever iterated last".
  const checkedInDateByRef = new Map<string, string>();
  for (const c of checkins) {
    if (c.status !== 'checked_in' || !c.travel_date) continue;
    if (c.travel_date < sinceDate) continue;
    const existing = checkedInDateByRef.get(c.booking_ref);
    if (!existing || c.travel_date > existing) checkedInDateByRef.set(c.booking_ref, c.travel_date);
  }
  const membershipKeys = buildSessionMembershipKeys(sessionGuides);

  const seen = new Set<string>();
  const records: CheckedInBookingRecord[] = [];
  for (const sb of sessionBookings) {
    if (!sb.allotted_guide_id) continue;
    if (!membershipKeys.has(`${sb.allotted_guide_id}:${sb.session_id}`)) continue; // no guide present on this session — counts for nobody
    const travelDate = checkedInDateByRef.get(sb.booking_ref);
    if (!travelDate) continue; // not checked in since sinceDate — never counted, regardless of why
    const key = `${sb.allotted_guide_id}:${sb.booking_ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({ guide_id: sb.allotted_guide_id, booking_ref: sb.booking_ref, month: travelDate.slice(0, 7) });
  }
  return records;
}

export function countCheckedInBookingsByGuide(records: CheckedInBookingRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.guide_id, (counts.get(r.guide_id) || 0) + 1);
  return counts;
}

/** Per-guide, per-month checked-in-booking counts — feeds the admin dashboard's MONTHLY score
    view (overall + monthly, filterable). */
export function countCheckedInBookingsByGuideAndMonth(records: CheckedInBookingRecord[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of records) {
    const byMonth = out.get(r.guide_id) || new Map<string, number>();
    byMonth.set(r.month, (byMonth.get(r.month) || 0) + 1);
    out.set(r.guide_id, byMonth);
  }
  return out;
}

/** Groups reviews by the month of review_date (YYYY-MM) — the other half of the monthly score
    view. A row with no review_date is excluded — there's no month to place it under. */
export function groupReviewsByMonth(reviews: GuideReviewRow[]): Map<string, GuideReviewRow[]> {
  const out = new Map<string, GuideReviewRow[]>();
  for (const r of reviews) {
    const month = (r.review_date || '').slice(0, 7);
    if (!month) continue;
    const arr = out.get(month) || [];
    arr.push(r);
    out.set(month, arr);
  }
  return out;
}

/** A guide needs at least this many checked-in BOOKINGS IN THE PERIOD BEING RANKED before their
    score counts toward the leaderboard, or is shown on their own dashboard at all — too few
    makes a single bad (or good) review swing the score wildly, which isn't a fair signal yet.
    Applies within whichever period is selected (Overall, or one specific month) — a guide who's
    overall-eligible but had a quiet month doesn't automatically rank in that month's board. */
export const GUIDE_SCORE_MIN_BOOKINGS = 3;

export interface GuideLeaderboardEntry {
  guide_id: string;
  score: number;
  reviewCount: number;
  /** Checked-in bookings, never "done tours" — see computeCheckedInBookingRecords. */
  bookingsCount: number;
  rank: number;
}

/**
 * Ranks guides by score, highest first, for ONE period at a time — pass since-Oct-1 reviews/
 * booking counts for the "Overall" view, or one month's slice (groupReviewsByMonth +
 * countCheckedInBookingsByGuideAndMonth, keyed by that month) for the "Monthly" view. The
 * GUIDE_SCORE_MIN_BOOKINGS threshold is evaluated against `periodBookingCounts` — THE SAME period
 * being ranked — so selecting a specific month recomputes eligibility, bookingsCount, reviewCount
 * and score entirely for that month; a guide with 26 checked-in bookings overall but only 2 in
 * October is excluded from October's board, and one with 26 overall but 6 in October shows
 * exactly 6 there, never 26. Deliberately takes only guide IDs, never names — callers that need
 * names (the admin UI) look them up themselves; a caller that only has IDs (a guide's own
 * privacy-safe view) structurally cannot leak another guide's name through this function.
 */
export function computeGuideLeaderboard(
  guideIds: string[],
  periodReviewsByGuide: Map<string, GuideReviewRow[]>,
  periodBookingCounts: Map<string, number>
): GuideLeaderboardEntry[] {
  const unranked: Omit<GuideLeaderboardEntry, 'rank'>[] = [];
  for (const guideId of guideIds) {
    const bookingsCount = periodBookingCounts.get(guideId) || 0;
    if (bookingsCount < GUIDE_SCORE_MIN_BOOKINGS) continue;
    const result = computeGuideReviewScore(periodReviewsByGuide.get(guideId) || [], bookingsCount);
    if (result.score == null) continue;
    unranked.push({ guide_id: guideId, score: result.score, reviewCount: result.reviewCount, bookingsCount });
  }
  unranked.sort((a, b) => b.score - a.score);
  return unranked.map((e, i) => ({ ...e, rank: i + 1 }));
}

// ── LEADERBOARD METRIC + TIME-PERIOD TOGGLE ─────────────────────────────────────────────────────
// A second, more general leaderboard system alongside computeGuideLeaderboard above (which stays
// exactly as it was — the "Per Booking" metric is still that exact formula, just reachable through
// this newer, metric-aware entry point too). Four metrics, one ranked list at a time, all
// recomputed for whichever time period is selected. The 3+ BOOKINGS eligibility threshold always
// applies regardless of which metric is being viewed — a guide who hasn't done 3 checked-in
// bookings in the period isn't ranked on Punctuality either, even if they have plenty of arrivals.

export type LeaderboardMetric = 'perBooking' | 'perTour' | 'punctuality' | 'combined';

export const LEADERBOARD_METRICS: { value: LeaderboardMetric; label: string }[] = [
  { value: 'perBooking', label: 'Per Booking' },
  { value: 'perTour', label: 'Per Tour' },
  { value: 'punctuality', label: 'Punctuality' },
  { value: 'combined', label: 'Combined' },
];

export const METRIC_TOOLTIP_DESCRIPTIONS: { metric: LeaderboardMetric; label: string; note: string }[] = [
  { metric: 'perBooking', label: 'Per Booking', note: 'Review points ÷ checked-in bookings in the selected period.' },
  { metric: 'perTour', label: 'Per Tour', note: 'Review points ÷ distinct tours (sessions) the guide worked in the selected period.' },
  { metric: 'punctuality', label: 'Punctuality', note: 'Of the guide’s recorded arrivals, the % that were on time (at or before their own check-in time).' },
  { metric: 'combined', label: 'Combined', note: 'Rating (50%) + Punctuality (50%), each normalized to 0–100 and blended.' },
];

/** sum(reviewPoints, excluding excluded_from_score) ÷ denominator — the SAME arithmetic
    computeGuideReviewScore uses for bookings, generalized so "Per Tour" (reviews ÷ distinct
    tours) can reuse it without mislabeling its result "bookingsGuided". computeGuideReviewScore
    itself is untouched — this is purely additive. */
export function computeReviewPointsPerUnit(
  reviews: GuideReviewRow[],
  denominator: number
): { score: number | null; reviewCount: number } {
  const counted = reviews.filter(reviewCountsTowardScore);
  const reviewCount = counted.length;
  if (denominator <= 0) return { score: null, reviewCount };
  const totalPoints = counted.reduce((sum, r) => sum + reviewPoints(r.stars), 0);
  return { score: totalPoints / denominator, reviewCount };
}

export interface SessionGuideForTourCount {
  guide_id: string;
  session_id: string;
  status: string | null;
}

export interface SessionDateForTourCount {
  id: string;
  tour_date: string;
}

/** "Tours" = distinct sessions the guide was ACCEPTED on (session_guides.status === 'accepted'),
    deduped per (guide, session) so a guide can never be credited twice for the same session, dated
    by the session's own tour_date within `bounds`. Any type of session counts — this is a plain
    attendance count, not a check-in/booking concept. */
export function computeToursPerGuide(
  sessionGuides: SessionGuideForTourCount[],
  sessions: SessionDateForTourCount[],
  bounds: DateRangeBounds
): Map<string, number> {
  const tourDateById = new Map(sessions.map((s) => [s.id, s.tour_date]));
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const sg of sessionGuides) {
    if (sg.status !== 'accepted') continue;
    const tourDate = tourDateById.get(sg.session_id);
    if (!tourDate || tourDate < bounds.start || tourDate > bounds.end) continue;
    const key = `${sg.guide_id}:${sg.session_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(sg.guide_id, (counts.get(sg.guide_id) || 0) + 1);
  }
  return counts;
}

/** The period-bounded sibling of countCheckedInBookingsByGuide/computeCheckedInBookingRecords
    above — those stay exactly as they are (still what the "real", always-since-Oct-1 score uses
    everywhere else in the app); this one additionally accepts an UPPER bound, so the leaderboard's
    day/week/month views can count only the bookings checked in within that narrower window. Same
    session-membership gate as computeCheckedInBookingRecords (see buildSessionMembershipKeys) — a
    guideless session's checked-in bookings count toward nobody here either. */
export function computeCheckedInBookingCountsForPeriod(
  sessionBookings: SessionBookingForGuiding[],
  checkins: CheckinForGuiding[],
  bounds: DateRangeBounds,
  sessionGuides: SessionGuideForTourCount[]
): Map<string, number> {
  const checkedInDateByRef = new Map<string, string>();
  for (const c of checkins) {
    if (c.status !== 'checked_in' || !c.travel_date) continue;
    if (c.travel_date < bounds.start || c.travel_date > bounds.end) continue;
    const existing = checkedInDateByRef.get(c.booking_ref);
    if (!existing || c.travel_date > existing) checkedInDateByRef.set(c.booking_ref, c.travel_date);
  }
  const membershipKeys = buildSessionMembershipKeys(sessionGuides);
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const sb of sessionBookings) {
    if (!sb.allotted_guide_id) continue;
    if (!membershipKeys.has(`${sb.allotted_guide_id}:${sb.session_id}`)) continue; // no guide present on this session — counts for nobody
    if (!checkedInDateByRef.has(sb.booking_ref)) continue;
    const key = `${sb.allotted_guide_id}:${sb.booking_ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(sb.allotted_guide_id, (counts.get(sb.allotted_guide_id) || 0) + 1);
  }
  return counts;
}

export function filterReviewsByPeriod(reviews: GuideReviewRow[], bounds: DateRangeBounds): GuideReviewRow[] {
  return reviews.filter((r) => r.review_date >= bounds.start && r.review_date <= bounds.end);
}

export interface ArrivalForPeriod extends ArrivalPunctualityRow {
  guide_id: string;
  /** ISO timestamp — only the date portion (first 10 chars) is compared against `bounds`. */
  arrived_at: string;
}

export function filterArrivalsByPeriod(arrivals: ArrivalForPeriod[], bounds: DateRangeBounds): ArrivalForPeriod[] {
  return arrivals.filter((a) => {
    const d = a.arrived_at.slice(0, 10);
    return d >= bounds.start && d <= bounds.end;
  });
}

/** Maps the per-booking review score (roughly -1..+1, see reviewPoints) onto a plain 0-100 scale:
    -1 -> 0, 0 -> 50, +1 -> 100. Clamped first — a guide with more counted reviews than bookings
    (e.g. more than one review per booking) can in principle push the raw score past ±1. */
export function normalizeReviewScoreTo100(score: number | null): number | null {
  if (score == null) return null;
  const clamped = Math.max(-1, Math.min(1, score));
  return ((clamped + 1) / 2) * 100;
}

export interface CombinedMetricResult {
  /** 0-100, or null only when NEITHER rating nor punctuality has any data at all. */
  score: number | null;
  ratingNormalized: number | null;
  punctualityPct: number | null;
}

/**
 * Rating (50%) + Punctuality (50%), each already 0-100. Same fairness rule as computeGuideScore
 * above: a missing component is dropped from both the numerator and the weight total rather than
 * scored as 0, so a guide with reviews but no verified arrivals yet shows their rating alone
 * (100%-weighted against the renormalized pool), not rating*0.5 + 0. This is also why the combined
 * score "firms up" as more arrivals land — punctuality isn't contributing yet until it has data,
 * then it gradually counts for its full, intended share.
 */
export function computeCombinedMetric(reviewScore: number | null, onTimePct: number | null): CombinedMetricResult {
  const ratingNormalized = normalizeReviewScoreTo100(reviewScore);
  const parts: { value: number; weight: number }[] = [];
  if (ratingNormalized != null) parts.push({ value: ratingNormalized, weight: 0.5 });
  if (onTimePct != null) parts.push({ value: onTimePct, weight: 0.5 });
  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const score = totalWeight > 0 ? parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight : null;
  return { score, ratingNormalized, punctualityPct: onTimePct };
}

/** One value per metric, in that metric's own native scale (points-per-unit for perBooking/
    perTour, 0-100 for punctuality/combined) — null means "no data", never a fabricated 0. */
export function computeMetricValue(
  metric: LeaderboardMetric,
  reviews: GuideReviewRow[],
  bookingsCount: number,
  toursCount: number,
  arrivals: ArrivalPunctualityRow[]
): number | null {
  switch (metric) {
    case 'perBooking':
      return computeGuideReviewScore(reviews, bookingsCount).score;
    case 'perTour':
      return computeReviewPointsPerUnit(reviews, toursCount).score;
    case 'punctuality':
      return computePunctualityStats(arrivals).onTimePct;
    case 'combined':
      return computeCombinedMetric(
        computeGuideReviewScore(reviews, bookingsCount).score,
        computePunctualityStats(arrivals).onTimePct
      ).score;
  }
}

export interface MetricLeaderboardEntry {
  guide_id: string;
  rank: number;
  /** The selected metric's own value — never null (a guide with no data for the selected metric
      is excluded from the ranked list entirely, same as computeGuideLeaderboard's score==null
      case above), in that metric's native scale (see computeMetricValue). */
  value: number;
  bookingsCount: number;
  toursCount: number;
  reviewCount: number;
  onTimeCount: number;
  countedArrivals: number;
}

/**
 * The metric-aware counterpart to computeGuideLeaderboard above — ranks guides by whichever of
 * the 4 metrics is selected, for one period at a time. Eligibility (GUIDE_SCORE_MIN_BOOKINGS) is
 * ALWAYS evaluated against `periodBookingCounts` regardless of metric — a guide who hasn't done 3
 * checked-in bookings in the period is excluded from the Punctuality/Combined boards too, not just
 * Per Booking/Per Tour. Deliberately takes only guide IDs, never names — see
 * computeGuideLeaderboard's own doc comment for why (a guide's own privacy-safe view calls this
 * with no name data in reach at all).
 */
export function computeGuideLeaderboardByMetric(
  guideIds: string[],
  metric: LeaderboardMetric,
  periodReviewsByGuide: Map<string, GuideReviewRow[]>,
  periodBookingCounts: Map<string, number>,
  periodTourCounts: Map<string, number>,
  periodArrivalsByGuide: Map<string, ArrivalPunctualityRow[]>
): MetricLeaderboardEntry[] {
  const unranked: Omit<MetricLeaderboardEntry, 'rank'>[] = [];
  for (const guideId of guideIds) {
    const bookingsCount = periodBookingCounts.get(guideId) || 0;
    if (bookingsCount < GUIDE_SCORE_MIN_BOOKINGS) continue;
    const reviews = periodReviewsByGuide.get(guideId) || [];
    const toursCount = periodTourCounts.get(guideId) || 0;
    const arrivals = periodArrivalsByGuide.get(guideId) || [];
    const value = computeMetricValue(metric, reviews, bookingsCount, toursCount, arrivals);
    if (value == null) continue;
    const reviewInfo = computeReviewPointsPerUnit(reviews, 1); // denominator irrelevant here, only reviewCount is read
    const punctuality = computePunctualityStats(arrivals);
    unranked.push({
      guide_id: guideId, value, bookingsCount, toursCount,
      reviewCount: reviewInfo.reviewCount, onTimeCount: punctuality.onTimeCount, countedArrivals: punctuality.countedArrivals,
    });
  }
  unranked.sort((a, b) => b.value - a.value);
  return unranked.map((e, i) => ({ ...e, rank: i + 1 }));
}

// ── TIME-PERIOD SELECTION (for the metric toggle above) ─────────────────────────────────────────

export type LeaderboardPeriodMode = 'sinceStart' | 'day' | 'week' | 'month';

export interface LeaderboardPeriod {
  mode: LeaderboardPeriodMode;
  /** YYYY-MM-DD — read only when mode === 'day'. */
  date?: string;
  /** YYYY-MM-DD, any date inside the target Monday-Sunday week — read only when mode === 'week'. */
  weekOf?: string;
  /** YYYY-MM — read only when mode === 'month'. */
  month?: string;
}

export const DEFAULT_LEADERBOARD_PERIOD: LeaderboardPeriod = { mode: 'sinceStart' };

/** Monday-Sunday bounds for the week containing `dateStr`. Date.getDay() is 0=Sun..6=Sat, so this
    shifts back to the most recent Monday (Sunday counts as day 7 of ITS week, not day 1 of the
    next one). */
function getWeekBounds(dateStr: string): DateRangeBounds {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: localDateStr(monday), end: localDateStr(sunday) };
}

/** Mirrors getAdminDateFilterBounds's own local-time-only arithmetic. 'sinceStart' is
    open-ended going forward (no upper cap) — same "From Oct 1 onward" semantics as
    ADMIN_DEFAULT_FILTER_START elsewhere, which is why it stays the default basis. */
export function getLeaderboardPeriodBounds(period: LeaderboardPeriod, today: Date = new Date()): DateRangeBounds {
  const todayStr = localDateStr(today);
  switch (period.mode) {
    case 'sinceStart':
      return { start: ADMIN_DEFAULT_FILTER_START, end: '9999-12-31' };
    case 'day': {
      const d = period.date || todayStr;
      return { start: d, end: d };
    }
    case 'week':
      return getWeekBounds(period.weekOf || todayStr);
    case 'month': {
      const ym = period.month && /^\d{4}-\d{2}$/.test(period.month) ? period.month : todayStr.slice(0, 7);
      const [y, m] = ym.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { start: localDateStr(first), end: localDateStr(last) };
    }
  }
}

/** A short, human label for whichever period is selected — "Since Oct 1, 2026", "Mon, Oct 13,
    2026", "Week of Oct 6 – Oct 12, 2026", "October 2026". */
export function getLeaderboardPeriodLabel(period: LeaderboardPeriod, today: Date = new Date()): string {
  const bounds = getLeaderboardPeriodBounds(period, today);
  switch (period.mode) {
    case 'sinceStart':
      return 'Since Oct 1, 2026';
    case 'day':
      return new Date(`${bounds.start}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    case 'week': {
      const startLabel = new Date(`${bounds.start}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endLabel = new Date(`${bounds.end}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `Week of ${startLabel} – ${endLabel}`;
    }
    case 'month':
      return new Date(`${bounds.start}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
}

/** Steps a 'week'/'month' period one unit earlier (-1) or later (+1) — how the owner/guide "view
    an earlier week/month". 'sinceStart'/'day' aren't stepped this way (day stepping is just a
    date-picker edit) and are returned unchanged. */
export function stepLeaderboardPeriod(period: LeaderboardPeriod, direction: -1 | 1, today: Date = new Date()): LeaderboardPeriod {
  const todayStr = localDateStr(today);
  if (period.mode === 'week') {
    const base = period.weekOf || todayStr;
    const d = new Date(`${base}T00:00:00`);
    d.setDate(d.getDate() + direction * 7);
    return { mode: 'week', weekOf: localDateStr(d) };
  }
  if (period.mode === 'month') {
    const ym = period.month || todayStr.slice(0, 7);
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + direction, 1);
    return { mode: 'month', month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` };
  }
  return period;
}

// ── PUNCTUALITY, BUILT NOW, ZERO WEIGHT ─────────────────────────────────────────────────────────
// Punctuality (on-time = arrived at/before the guide's own checkin_time, via
// computePunctualityStats/ArrivalPunctualityRow above) is DISPLAYED on both the guide's own
// dashboard and the admin dashboard, but deliberately does NOT yet move the real, ranked score —
// arrival is currently self-reported with no geo-verification, so a guide could claim "arrived"
// from home; it isn't trustworthy enough yet to affect rank or money. Structured as a single
// weight constant precisely so that changes the moment geo-verification lands: raise
// PUNCTUALITY_SCORE_WEIGHT and every caller of computeCombinedGuideScore picks it up with no
// other code change.

/** 0 = punctuality has zero effect on the real score (current state). Any value in (0, 1] blends
    it in proportionally — see computeCombinedGuideScore. Never negative, never above 1. */
export const PUNCTUALITY_SCORE_WEIGHT = 0;

/** At PUNCTUALITY_SCORE_WEIGHT === 0 this ALWAYS returns `reviewScore` unchanged — verified by
    test, so raising the weight later is the only thing that can ever change this function's
    output for the exact same inputs today. `onTimePct` (0-100, or null when there's no counted
    arrival data yet) is re-centered onto a -1..+1 band before blending (50% → 0, 100% → +1, 0% →
    -1) so it sits on roughly the same scale as review points, rather than mixing a 0-100 number
    directly into a -1..+1 one. */
export function computeCombinedGuideScore(reviewScore: number | null, onTimePct: number | null): number | null {
  if (reviewScore == null) return null;
  if (PUNCTUALITY_SCORE_WEIGHT <= 0 || onTimePct == null) return reviewScore;
  const punctualityScore = (onTimePct - 50) / 50;
  return reviewScore * (1 - PUNCTUALITY_SCORE_WEIGHT) + punctualityScore * PUNCTUALITY_SCORE_WEIGHT;
}

export type ScoreBand = 'excellent' | 'good' | 'needs_improvement' | 'falling';

/** The one set of band thresholds used everywhere a score is shown. */
export function getScoreBand(score: number | null): ScoreBand | null {
  if (score == null) return null;
  if (score >= 0.5) return 'excellent';
  if (score >= 0.2) return 'good';
  if (score >= 0) return 'needs_improvement';
  return 'falling';
}

/** Actionable, for the owner — the negative band is explicitly flagged as worth a conversation. */
export const ADMIN_SCORE_BAND_LABELS: Record<ScoreBand, string> = {
  excellent: 'Excellent',
  good: 'Good',
  needs_improvement: 'Needs improvement',
  falling: 'Falling — worth a conversation',
};

/** Encouraging, for the guide themselves. */
export const GUIDE_SCORE_BAND_LABELS: Record<ScoreBand, string> = {
  excellent: 'Excellent!',
  good: 'Good — keep it up',
  needs_improvement: 'Room to improve — ask more guests to review',
  falling: "Let's work on this",
};

/** The info-tooltip's band breakdown — one structured list rendered on both the guide and admin
    dashboards, so the two "i" buttons can never drift out of sync with each other or with
    getScoreBand's actual thresholds. */
export const SCORE_BAND_TOOLTIP_ROWS: { range: string; note: string }[] = [
  { range: '+0.5 and above', note: 'Excellent (lots of 5-star reviews)' },
  { range: '+0.2 to +0.5', note: 'Good' },
  { range: '0 to +0.2', note: 'Needs improvement' },
  { range: 'Below 0', note: 'Falling — needs attention' },
];

export const SCORE_FORMULA_TOOLTIP_TEXT =
  'Score = review points ÷ completed tours since Oct 1; getting more guests to leave 5-star reviews raises it.';

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
  /** From guide_reviews, since Oct 1 2026 — see computeGuideReviewScore. Always null/0/0 for a
      virtual (unlinked) row: reviews require a real guide_id, so a name-only imported row can
      never have any. */
  reviewScore: number | null;
  reviewCount: number;
  bookingsGuided: number;
}

interface MinimalGuide {
  id: string;
  name: string;
  guide_number: string | null;
}

/**
 * One row per real guide (stats from their own guide_assignments, score from their own
 * guide_reviews), PLUS one row per distinct guide_name found only in guide_monthly (imported
 * invoice history that was never linked to a guides row) — so those "name-only" guides are never
 * silently hidden from the overview. Virtual rows can only ever report tours/earnings sourced from
 * guide_monthly (tours_completed, amount_owed) since there's no guide_id to attribute any
 * guide_assignments/guide_reviews rows to them — their reviewScore is always null ("—").
 */
export function computeGuideOverviewRows(
  guides: MinimalGuide[],
  assignments: GuideAssignmentRow[],
  reviews: GuideReviewRow[],
  guidedBookingCounts: Map<string, number>,
  monthlyRows: GuideMonthlyRow[],
  todayStr: string
): GuideOverviewRow[] {
  const realRows: GuideOverviewRow[] = guides.map((g) => {
    const guideAssignments = assignments.filter((a) => a.guide_id === g.id);
    const stats = computeAssignmentStats(guideAssignments, todayStr);
    const guideReviews = reviews.filter((r) => r.guide_id === g.id);
    const reviewScore = computeGuideReviewScore(guideReviews, guidedBookingCounts.get(g.id) || 0);
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
      reviewScore: reviewScore.score,
      reviewCount: reviewScore.reviewCount,
      bookingsGuided: reviewScore.bookingsGuided,
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
      reviewScore: null,
      reviewCount: 0,
      bookingsGuided: 0,
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
  /** Optional — only the admin dashboard currently selects this column. See
      GuideAssignmentRow.guideCheckinTime and isAssignmentDone's doc comment for why leaving it
      unselected (undefined) is always safe for any other caller. */
  checkin_time?: string | null;
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
 * "Happened" (owed, not upcoming) is delegated entirely to isAssignmentDone/computeAssignmentStats
 * via the `guideCheckinTime` field below, carried over 1:1 from `checkin_time` when the caller
 * selected it (undefined otherwise, which isAssignmentDone treats as "no signal — use the plain
 * date rule").
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
      guideCheckinTime: sg.checkin_time,
    });
  }
  return rows;
}

/** When the SAME physical tour is represented in both the legacy per-booking `guide_assignments`
    import/manual-assignment flow (e.g. the standalone check-in app's booking-level
    "assign a guide" action) AND the newer per-session `session_guides` pay system, naively
    concatenating both sources double-counts that one tour's cost. Matched on
    (guide_id, travel_date, travel_time) — the same guide can only physically be on one tour at a
    given date+time, so a collision on all three is the same tour, never a coincidence. The
    session-based row wins (it's the actively-maintained pay source for anything using the newer
    tour_session model; a matching imported row is typically a stale or zero-pay placeholder) and
    is kept; the matching imported row is dropped so the tour's pay is counted exactly once. A row
    transferred between guides (guideTransfer.ts's reassign_my_slot moves the SAME session_guides
    row to the new guide_id, never duplicating it) is unaffected by this — it was already only
    ever present once. */
export function dedupeAssignmentsAcrossSources(
  imported: GuideAssignmentRow[],
  sessionBased: GuideAssignmentRow[]
): GuideAssignmentRow[] {
  const sessionKeys = new Set(
    sessionBased
      .filter((a) => a.guide_id && a.travel_date)
      .map((a) => `${a.guide_id}:${a.travel_date}:${a.travel_time || ''}`)
  );
  const dedupedImported = imported.filter((a) => {
    if (!a.guide_id || !a.travel_date) return true;
    return !sessionKeys.has(`${a.guide_id}:${a.travel_date}:${a.travel_time || ''}`);
  });
  return [...dedupedImported, ...sessionBased];
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

// ── ADMIN GUIDE DASHBOARD DATE FILTER ────────────────────────────────────────────────────────
// A separate, richer filter from DateRangePreset/getDateRangeBounds above (which only the admin
// Guide Dashboard itself uses — nothing guide-facing touches either of these two systems, so this
// one is additive, not a replacement). Supports the four presets plus an arbitrary single month
// or custom range, so every period the admin dashboard needs — including "all older data, reached
// by changing the filter" — funnels through the one function below, matching the SAME
// filterAssignmentsByDateRange() every other bound here already goes through.

/** The admin dashboard's default filter floor — tours/earnings before this date are never hidden
    permanently, just not shown by DEFAULT until the admin picks an earlier period. */
export const ADMIN_DEFAULT_FILTER_START = '2026-10-01';

export type AdminDateFilterMode = 'thisMonth' | 'lastMonth' | 'fromDefaultStart' | 'allTime' | 'month' | 'range';

export interface AdminDateFilter {
  mode: AdminDateFilterMode;
  /** YYYY-MM — only read when mode === 'month'. */
  month?: string;
  /** YYYY-MM-DD — only read when mode === 'range'. Either side left blank is treated as
      unbounded in that direction. */
  rangeFrom?: string;
  rangeTo?: string;
}

export const ADMIN_DATE_FILTER_PRESETS: { mode: AdminDateFilterMode; label: string }[] = [
  { mode: 'thisMonth', label: 'This Month' },
  { mode: 'lastMonth', label: 'Last Month' },
  { mode: 'fromDefaultStart', label: 'From Oct 1, 2026' },
  { mode: 'allTime', label: 'All Time' },
];

/** Mirrors getDateRangeBounds's own local-time-only arithmetic (Date's own getFullYear/getMonth/
    getDate + localDateStr — never toISOString) so a boundary date can never shift by the
    browser's UTC offset. */
export function getAdminDateFilterBounds(filter: AdminDateFilter, today: Date = new Date()): DateRangeBounds {
  const todayStr = localDateStr(today);
  switch (filter.mode) {
    case 'thisMonth': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: localDateStr(first), end: localDateStr(last) };
    }
    case 'lastMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: localDateStr(first), end: localDateStr(last) };
    }
    case 'fromDefaultStart':
      // "From Oct 1, 2026" means Oct-1-ONWARD — open-ended going forward, same as a 'range' with
      // no rangeTo. Clamping `end` to todayStr (an earlier version of this function did) silently
      // excluded every upcoming tour from the whole dashboard under this preset — the exact bug
      // behind "Upcoming shows 0 under From Oct 1 but works under This Month": 'thisMonth' already
      // extends `end` to the end of the calendar month (today-or-later), so upcoming tours later
      // in the month survived, while this preset's today-capped `end` cut them off entirely.
      return { start: ADMIN_DEFAULT_FILTER_START, end: '9999-12-31' };
    case 'allTime':
      // Wide enough to include literally any real travel_date ever stored, without needing a
      // separate "unbounded" code path through filterAssignmentsByDateRange.
      return { start: '0000-01-01', end: '9999-12-31' };
    case 'month': {
      const ym = filter.month && /^\d{4}-\d{2}$/.test(filter.month) ? filter.month : todayStr.slice(0, 7);
      const [y, m] = ym.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { start: localDateStr(first), end: localDateStr(last) };
    }
    case 'range':
      return { start: filter.rangeFrom || '0000-01-01', end: filter.rangeTo || '9999-12-31' };
  }
}

export interface GuidePaymentSummary {
  /** YYYY-MM — the most recent month marked paid (guide_monthly.payment_sent), or null if none
      has ever been marked paid. "Paid through" is reported as this latest paid month; it does not
      verify there's no earlier unpaid gap, matching how payments are actually made in practice
      (sequentially, month by month). */
  paidThroughMonth: string | null;
  /** The latest guide_monthly.payment_date recorded across every paid month, or null if none. */
  lastPaymentDate: string | null;
}

/** Pure, additive — reads the SAME guide_monthly rows the existing "Mark Paid" mechanism already
    writes (payment_sent/payment_date), never a new store. Always computed from the guide's FULL
    monthly history regardless of whatever period the admin dashboard's own filter is currently
    showing — "paid through" is inherently an all-time, "how caught up is this guide overall"
    question, not something that should disappear just because the admin is looking at a single
    month. */
export function computeGuidePaymentSummary(
  monthlyRows: { month: string | null; payment_sent: boolean | null; payment_date: string | null }[]
): GuidePaymentSummary {
  let paidThroughMonth: string | null = null;
  let lastPaymentDate: string | null = null;
  for (const r of monthlyRows) {
    if (!r.payment_sent) continue;
    if (r.month && (!paidThroughMonth || r.month > paidThroughMonth)) paidThroughMonth = r.month;
    if (r.payment_date && (!lastPaymentDate || r.payment_date > lastPaymentDate)) lastPaymentDate = r.payment_date;
  }
  return { paidThroughMonth, lastPaymentDate };
}

/** Scopes guide_monthly rows (used to build the "Unlinked" virtual overview rows — orphaned
    imported history with no guide_id) to the admin date filter's window, by comparing each row's
    `month` (YYYY-MM, e.g. "2026-03") against the bounds' own YYYY-MM prefix. Without this, a
    virtual row's tours/earnings would always be its full all-time total regardless of which
    period the rest of the dashboard (real guides' filteredAssignments) is scoped to — exactly the
    "Unlinked rows still show under From-Oct-1" bug this exists to fix. A row with no `month` can't
    be placed in any window, so it's excluded rather than assumed to be in-range. */
export function filterMonthlyRowsByDateRange<T extends { month: string | null }>(
  rows: T[],
  bounds: DateRangeBounds
): T[] {
  const startMonth = bounds.start.slice(0, 7);
  const endMonth = bounds.end.slice(0, 7);
  return rows.filter((r) => !!r.month && r.month >= startMonth && r.month <= endMonth);
}

export type AdminStatusFilter = 'all' | 'upcoming' | 'done' | 'paid' | 'pending';

export const ADMIN_STATUS_FILTER_OPTIONS: { value: AdminStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'done', label: 'Done' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Unpaid / Pending' },
];

/** Per-TOUR status filter — narrows the assignment list itself (not just which guides end up
    showing) so the top totals strip, the per-guide cards, and the "All Guides" table all sum from
    the exact same already-narrowed array. Selecting "Paid" means Total Earnings becomes the sum
    of PAID tours only, a guide's card shows only their paid tours/earnings, etc. — "all three use
    the SAME filtered dataset" by construction, not by coincidence. */
export function filterAssignmentsByStatus(
  assignments: GuideAssignmentRow[],
  status: AdminStatusFilter,
  todayStr: string
): GuideAssignmentRow[] {
  if (status === 'all') return assignments;
  return assignments.filter((a) => {
    switch (status) {
      case 'upcoming': return !isAssignmentDone(a, todayStr);
      case 'done': return isAssignmentDone(a, todayStr);
      case 'paid': return !!a.is_paid;
      case 'pending': return !a.is_paid;
    }
  });
}

/** The "Unlinked" virtual-row equivalent of filterAssignmentsByStatus above, for the orphaned
    guide_monthly rows computeGuideOverviewRows turns into virtual rows. Imported monthly invoice
    history has no "upcoming" concept (it's always already-invoiced, completed work) — so
    'upcoming' correctly yields nothing, matching toursUpcoming always being 0 for a virtual row.
    'paid'/'pending' narrow by the row's own payment_sent flag, exactly like the real-guide case. */
export function filterMonthlyRowsByStatus<T extends { payment_sent: boolean | null }>(
  rows: T[],
  status: AdminStatusFilter
): T[] {
  switch (status) {
    case 'all': return rows;
    case 'upcoming': return [];
    case 'done': return rows;
    case 'paid': return rows.filter((r) => !!r.payment_sent);
    case 'pending': return rows.filter((r) => !r.payment_sent);
  }
}

/** Whole-guide-row inclusion test. Applied AFTER filterAssignmentsByStatus/filterMonthlyRowsByStatus
    have already narrowed the underlying data to the selected status, so by that point any row
    with nothing left (every stat zero) genuinely has no matching tours in range — this just drops
    it from the view instead of rendering as an empty €0 card. 'all' always matches, including a
    guide with zero tours in range, preserving the default "every guide always shown" behavior. */
export function matchesAdminStatusFilter(
  row: { toursDone: number; toursUpcoming: number; paidAmount: number; pendingAmount: number },
  status: AdminStatusFilter
): boolean {
  switch (status) {
    case 'all': return true;
    case 'upcoming': return row.toursUpcoming > 0;
    case 'done': return row.toursDone > 0;
    case 'paid': return row.paidAmount > 0;
    case 'pending': return row.pendingAmount > 0;
  }
}

// ── SESSION-GUIDE-COST ATTRIBUTION FOR BOOKING-LEVEL AGGREGATIONS (Analytics, etc.) ──────────
// Used anywhere profit is summed BY BOOKING (by channel/product/option/month) rather than by
// period like Breakdown P&L. A session's real guide cost (session_guides.base_pay+bonus) must be
// summed EXACTLY ONCE per (session, guide) row — never once per booking in that session — so
// these are computed as two deliberately independent passes: this function only ever iterates
// `sessionGuides` once (to total each session's pay) and `sessionBookings` once (to find which
// bookings share that total); it reads gross_revenue only as a READ-ONLY WEIGHT for splitting that
// already-fixed total proportionally, never adds it to anything or sums it across guides. Callers
// still read a booking's own gross_revenue directly from the booking row for revenue — this
// function returns ONLY a per-booking guide-cost attribution, nothing else, so revenue and guide
// cost can never be produced by the same join/loop.
export interface AttributeSessionGuideCostInputs {
  bookings: { booking_ref: string | null; gross_revenue: number | null }[];
  sessionBookings: { booking_ref: string; session_id: string }[];
  sessionGuides: { session_id: string; status: string; base_pay: number | null; bonus: number | null }[];
}

export function attributeSessionGuideCostByBooking({
  bookings, sessionBookings, sessionGuides,
}: AttributeSessionGuideCostInputs): Map<string, number> {
  // Pass 1: each session's real guide cost, summed once per accepted (session, guide) row —
  // never touches a booking, so it can't be inflated by how many bookings the session has.
  const sessionPayById = new Map<string, number>();
  sessionGuides.forEach((sg) => {
    if (sg.status !== 'accepted') return;
    const amt = (Number(sg.base_pay) || 0) + (Number(sg.bonus) || 0);
    sessionPayById.set(sg.session_id, (sessionPayById.get(sg.session_id) || 0) + amt);
  });

  // Pass 2: which booking_refs share each session — a separate, independent pass over
  // sessionBookings, still no reference to session_guides or revenue.
  const refsBySession = new Map<string, string[]>();
  sessionBookings.forEach((sb) => {
    if (!refsBySession.has(sb.session_id)) refsBySession.set(sb.session_id, []);
    refsBySession.get(sb.session_id)!.push(sb.booking_ref);
  });

  // Pass 3: each booking's OWN revenue, read once per booking — used only as a split WEIGHT
  // below, never summed or duplicated.
  const revenueByRef = new Map<string, number>();
  bookings.forEach((b) => {
    if (b?.booking_ref) revenueByRef.set(b.booking_ref, Number(b.gross_revenue) || 0);
  });

  // Combine: split each session's ALREADY-FIXED total pay proportionally across its bookings by
  // revenue share (evenly if the session's bookings have no revenue at all) — the shares always
  // sum back to exactly that session's total, so grouping the results by channel/product/month
  // afterward can never exceed the true total no matter how many guides or bookings are involved.
  const out = new Map<string, number>();
  sessionPayById.forEach((totalPay, sessionId) => {
    const refs = refsBySession.get(sessionId) || [];
    if (refs.length === 0) return; // nowhere to attribute this session's pay — dropped, not fabricated
    const totalRevenue = refs.reduce((s, ref) => s + (revenueByRef.get(ref) || 0), 0);
    refs.forEach((ref) => {
      const share = totalRevenue > 0 ? (revenueByRef.get(ref) || 0) / totalRevenue : 1 / refs.length;
      out.set(ref, (out.get(ref) || 0) + totalPay * share);
    });
  });
  return out;
}
