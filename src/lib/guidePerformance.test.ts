import { describe, it, expect } from 'vitest';
import {
  computeRatingStats, computePunctualityStats, computeGuideScore, computeAssignmentStats,
  assignmentEarned, sessionGuidesToAssignmentRows, buildUnifiedMonthlyRows,
  attributeSessionGuideCostByBooking, getAdminDateFilterBounds, computeGuidePaymentSummary,
  filterMonthlyRowsByDateRange, matchesAdminStatusFilter,
  isAssignmentDone, filterAssignmentsByStatus, filterMonthlyRowsByStatus, dedupeAssignmentsAcrossSources,
  reviewPoints, computeGuideReviewScore, computeGuideOverviewRows,
  computeCheckedInBookingRecords, countCheckedInBookingsByGuide, countCheckedInBookingsByGuideAndMonth,
  groupReviewsByMonth, computeGuideLeaderboard, getScoreBand,
  computeCombinedGuideScore, PUNCTUALITY_SCORE_WEIGHT, GUIDE_SCORE_MIN_BOOKINGS,
  ADMIN_DEFAULT_FILTER_START,
  PUNCTUALITY_GRACE_MINUTES,
  type GuideRatingRow, type GuideAssignmentRow, type GuideMonthlyRow, type GuideReviewRow,
  type SessionGuideForEarnings, type SessionForEarnings,
} from './guidePerformance';

const rating = (overrides: Partial<GuideRatingRow> = {}): GuideRatingRow => ({
  id: 'r1',
  guide_id: 'g1',
  stars: 5,
  quantity: 1,
  source: null,
  note: null,
  verified: true,
  verified_at: null,
  created_at: null,
  added_by: 'owner',
  ...overrides,
});

describe('computePunctualityStats', () => {
  it('is null with no arrivals at all', () => {
    expect(computePunctualityStats([])).toEqual({ countedArrivals: 0, onTimeCount: 0, onTimePct: null });
  });

  it('skips arrivals with no minutes_late (no schedule to measure against) — never counts them as late', () => {
    const stats = computePunctualityStats([{ minutes_late: null }, { minutes_late: null }]);
    expect(stats).toEqual({ countedArrivals: 0, onTimeCount: 0, onTimePct: null });
  });

  it('treats exactly-on-time and early as on-time', () => {
    const stats = computePunctualityStats([{ minutes_late: -5 }, { minutes_late: 0 }]);
    expect(stats).toEqual({ countedArrivals: 2, onTimeCount: 2, onTimePct: 100 });
  });

  it('honors the grace period as on-time', () => {
    const stats = computePunctualityStats([{ minutes_late: PUNCTUALITY_GRACE_MINUTES }]);
    expect(stats.onTimePct).toBe(100);
  });

  it('counts anything past the grace as late', () => {
    const stats = computePunctualityStats([{ minutes_late: PUNCTUALITY_GRACE_MINUTES + 1 }]);
    expect(stats.onTimePct).toBe(0);
  });

  it('computes a mixed rate, ignoring null rows in the denominator', () => {
    const stats = computePunctualityStats([
      { minutes_late: 0 }, { minutes_late: 10 }, { minutes_late: 2 }, { minutes_late: null },
    ]);
    expect(stats).toEqual({ countedArrivals: 3, onTimeCount: 2, onTimePct: (2 / 3) * 100 });
  });
});

describe('computeGuideScore — fairness across volume', () => {
  it('a 5.0 from 2 reviews scores identically to a 5.0 from 80', () => {
    const small = computeRatingStats([rating({ quantity: 2 })], 2);
    const big = computeRatingStats([rating({ quantity: 80 })], 80);
    const scoreSmall = computeGuideScore(small, { countedArrivals: 0, onTimeCount: 0, onTimePct: null }, 2);
    const scoreBig = computeGuideScore(big, { countedArrivals: 0, onTimeCount: 0, onTimePct: null }, 80);
    expect(scoreSmall.quality.stars).toBe(5);
    expect(scoreBig.quality.stars).toBe(5);
    expect(scoreSmall.score).toBe(scoreBig.score);
  });
});

describe('computeGuideScore — no-data handling', () => {
  const noPunctuality = { countedArrivals: 0, onTimeCount: 0, onTimePct: null } as const;
  const fullPunctuality = { countedArrivals: 10, onTimeCount: 9, onTimePct: 90 } as const;

  it('is entirely null when nothing has any data yet (brand new guide)', () => {
    const ratingStats = computeRatingStats([], 0);
    const result = computeGuideScore(ratingStats, noPunctuality, 0);
    expect(result.score).toBeNull();
    expect(result.quality.stars).toBeNull();
    expect(result.engagement.pct).toBeNull();
    expect(result.punctuality.pct).toBeNull();
  });

  it('scores from quality alone (reviews present, no arrivals yet) — never treats missing punctuality as 0', () => {
    // 12 tours done, 8 verified 5-star reviews, no arrivals recorded yet.
    const ratingStats = computeRatingStats([rating({ quantity: 8, stars: 5 })], 12);
    const result = computeGuideScore(ratingStats, noPunctuality, 12);

    expect(result.quality.stars).toBe(5);
    expect(result.engagement.pct).toBeCloseTo((8 / 12) * 100);
    expect(result.punctuality.pct).toBeNull();

    // Renormalized across quality (0.6) + engagement (0.2) only — punctuality's 0.2 weight is
    // dropped from the pool entirely, not folded in as a 0.
    const qualityPct = 100; // 5/5 * 100
    const engagementPct = (8 / 12) * 100;
    const expected = (qualityPct * 0.6 + engagementPct * 0.2) / 0.8;
    expect(result.score).toBeCloseTo(expected);

    // Sanity: this must be well above what treating the missing component as 0 would give.
    const ifPunctualityWereZero = qualityPct * 0.6 + engagementPct * 0.2 + 0 * 0.2;
    expect(result.score!).toBeGreaterThan(ifPunctualityWereZero);
  });

  it('scores from punctuality alone when there are arrivals but no reviews yet', () => {
    const ratingStats = computeRatingStats([], 5);
    const result = computeGuideScore(ratingStats, fullPunctuality, 5);
    expect(result.quality.stars).toBeNull();
    expect(result.engagement.pct).toBeNull();
    expect(result.score).toBeCloseTo(90); // only component present -> its own percentage, unweighted-down
  });

  it('blends all three when every component has data', () => {
    const ratingStats = computeRatingStats([rating({ quantity: 8, stars: 4 })], 10);
    const result = computeGuideScore(ratingStats, fullPunctuality, 10);
    const qualityPct = (4 / 5) * 100;
    const engagementPct = (8 / 10) * 100;
    const expected = qualityPct * 0.6 + engagementPct * 0.2 + 90 * 0.2;
    expect(result.score).toBeCloseTo(expected);
  });

  it('carries through the raw counts used in the breakdown line', () => {
    const ratingStats = computeRatingStats([rating({ quantity: 8, stars: 4 })], 12);
    const result = computeGuideScore(ratingStats, fullPunctuality, 12);
    expect(result.engagement.toursDone).toBe(12);
    expect(result.engagement.reviewCount).toBe(8);
    expect(result.punctuality.arrivalsCount).toBe(10);
  });
});

const assignment = (overrides: Partial<GuideAssignmentRow> & { id: string }): GuideAssignmentRow => ({
  guide_id: 'g1',
  travel_date: null,
  travel_time: null,
  tour_name: null,
  tour_type: null,
  language: null,
  calculated_pay: null,
  rate_override: null,
  bonus: null,
  total_pay: null,
  is_paid: null,
  paid_date: null,
  product_code: null,
  option_name: null,
  booking_ref: null,
  clients: null,
  notes: null,
  pax_count: null,
  ...overrides,
});

describe('computeAssignmentStats — today counts as done, not upcoming', () => {
  it('a tour dated exactly today is owed (done), matching the session-pay rule "tour_date <= today"', () => {
    const today = '2026-09-27';
    const stats = computeAssignmentStats([assignment({ id: 'a1', travel_date: today, calculated_pay: 50 })], today);
    expect(stats.toursDone).toBe(1);
    expect(stats.toursUpcoming).toBe(0);
  });

  it('a tour dated tomorrow is still upcoming', () => {
    const stats = computeAssignmentStats([assignment({ id: 'a1', travel_date: '2026-09-28', calculated_pay: 50 })], '2026-09-27');
    expect(stats.toursDone).toBe(0);
    expect(stats.toursUpcoming).toBe(1);
  });
});

describe('sessionGuidesToAssignmentRows', () => {
  const session = (overrides: Partial<SessionForEarnings> & { id: string }): SessionForEarnings => ({
    tour_date: '2026-09-26', start_time: '09:00', label: 'Old Town Walk', ...overrides,
  });
  const sg = (overrides: Partial<SessionGuideForEarnings> & { session_id: string }): SessionGuideForEarnings => ({
    guide_id: 'g1', status: 'accepted', base_pay: 60, bonus: null, ...overrides,
  });

  it('maps an accepted, paid session_guides row into a GuideAssignmentRow-shaped object', () => {
    const rows = sessionGuidesToAssignmentRows(
      [sg({ session_id: 'S1', base_pay: 60, bonus: 10 })],
      [session({ id: 'S1' })],
      new Set()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'session:S1:g1', guide_id: 'g1', travel_date: '2026-09-26', travel_time: '09:00',
      calculated_pay: 60, bonus: 10, total_pay: null, rate_override: null, is_paid: false,
    });
    expect(assignmentEarned(rows[0])).toBe(70);
  });

  it('skips a non-accepted row (offered/declined/reassigned)', () => {
    const rows = sessionGuidesToAssignmentRows([sg({ session_id: 'S1', status: 'offered' })], [session({ id: 'S1' })], new Set());
    expect(rows).toHaveLength(0);
  });

  it('skips a row with no pay tracked at all (base_pay and bonus both null) — pay is optional', () => {
    const rows = sessionGuidesToAssignmentRows([sg({ session_id: 'S1', base_pay: null, bonus: null })], [session({ id: 'S1' })], new Set());
    expect(rows).toHaveLength(0);
  });

  it('skips a row whose session_id has no matching session', () => {
    const rows = sessionGuidesToAssignmentRows([sg({ session_id: 'MISSING' })], [session({ id: 'S1' })], new Set());
    expect(rows).toHaveLength(0);
  });

  it('derives is_paid from paidMonthsByGuide, keyed "guideId:YYYY-MM"', () => {
    const paid = new Set(['g1:2026-09']);
    const rows = sessionGuidesToAssignmentRows(
      [sg({ session_id: 'S1' }), sg({ session_id: 'S2', guide_id: 'g2' })],
      [session({ id: 'S1', tour_date: '2026-09-26' }), session({ id: 'S2', tour_date: '2026-09-26' })],
      paid
    );
    expect(rows.find(r => r.guide_id === 'g1')!.is_paid).toBe(true);
    expect(rows.find(r => r.guide_id === 'g2')!.is_paid).toBe(false);
  });
});

describe('buildUnifiedMonthlyRows', () => {
  const monthly = (overrides: Partial<GuideMonthlyRow> & { id: string }): GuideMonthlyRow => ({
    guide_id: 'g1', guide_name: 'Maria', month: '2026-08', tours_completed: 5, amount_owed: 300,
    invoice_received: null, invoice_amount: null, tva: null, difference: null,
    payment_sent: true, payment_date: '2026-09-01', ...overrides,
  });

  it('creates a virtual (not-yet-persisted) row for a month with ONLY session-based earnings', () => {
    const sessionRows = [assignment({ id: 'session:S1:g1', guide_id: 'g1', travel_date: '2026-09-26', calculated_pay: 60, bonus: 10 })];
    const rows = buildUnifiedMonthlyRows('g1', 'Maria', [], sessionRows);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'virtual-month:g1:2026-09', month: '2026-09', amount_owed: 70, tours_completed: 1,
      payment_sent: false, isVirtual: true,
    });
  });

  it('keeps a real guide_monthly row authoritative and folds in session earnings for the SAME month additively', () => {
    const real = monthly({ id: 'real-1', month: '2026-09', amount_owed: 300, tours_completed: 5 });
    const sessionRows = [assignment({ id: 'session:S1:g1', guide_id: 'g1', travel_date: '2026-09-26', calculated_pay: 60 })];
    const rows = buildUnifiedMonthlyRows('g1', 'Maria', [real], sessionRows);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'real-1', month: '2026-09', amount_owed: 360, tours_completed: 6, isVirtual: false, payment_sent: true });
  });

  it('never double-counts — a real row for one month and session earnings for a different month produce two separate rows', () => {
    const real = monthly({ id: 'real-1', month: '2026-06' });
    const sessionRows = [assignment({ id: 'session:S1:g1', guide_id: 'g1', travel_date: '2026-09-26', calculated_pay: 60 })];
    const rows = buildUnifiedMonthlyRows('g1', 'Maria', [real], sessionRows);
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.id === 'real-1')!.amount_owed).toBe(300); // untouched
    expect(rows.find(r => r.isVirtual)!.amount_owed).toBe(60);
  });

  it('only ever includes rows for the requested guide_id', () => {
    const otherGuideReal = monthly({ id: 'real-other', guide_id: 'g2' });
    const rows = buildUnifiedMonthlyRows('g1', 'Maria', [otherGuideReal], []);
    expect(rows).toHaveLength(0);
  });

  it('sorts newest month first', () => {
    const sessionRows = [
      assignment({ id: 's1', guide_id: 'g1', travel_date: '2026-06-15', calculated_pay: 10 }),
      assignment({ id: 's2', guide_id: 'g1', travel_date: '2026-09-15', calculated_pay: 10 }),
      assignment({ id: 's3', guide_id: 'g1', travel_date: '2026-07-15', calculated_pay: 10 }),
    ];
    const rows = buildUnifiedMonthlyRows('g1', 'Maria', [], sessionRows);
    expect(rows.map(r => r.month)).toEqual(['2026-09', '2026-07', '2026-06']);
  });
});

describe('attributeSessionGuideCostByBooking', () => {
  it('REGRESSION: a booking in a 2-guide session gets guide cost attributed once, and its own revenue is never touched/duplicated', () => {
    const out = attributeSessionGuideCostByBooking({
      bookings: [{ booking_ref: 'VIA-99883843', gross_revenue: 85 }],
      sessionBookings: [{ booking_ref: 'VIA-99883843', session_id: 'S1' }],
      sessionGuides: [
        { session_id: 'S1', status: 'accepted', base_pay: 100, bonus: 0 },
        { session_id: 'S1', status: 'accepted', base_pay: 30, bonus: 0 },
      ],
    });
    // The lone booking gets the FULL, single, combined session pay (100+30=130) — never doubled,
    // halved, or otherwise scaled by the number of guides.
    expect(out.get('VIA-99883843')).toBe(130);
    expect(out.size).toBe(1);
  });

  it('splits one session\'s pay proportionally by revenue share across its bookings — shares sum back to exactly the total', () => {
    const out = attributeSessionGuideCostByBooking({
      bookings: [
        { booking_ref: 'B1', gross_revenue: 300 },
        { booking_ref: 'B2', gross_revenue: 100 },
      ],
      sessionBookings: [
        { booking_ref: 'B1', session_id: 'S1' },
        { booking_ref: 'B2', session_id: 'S1' },
      ],
      sessionGuides: [{ session_id: 'S1', status: 'accepted', base_pay: 80, bonus: 20 }], // 100 total
    });
    // B1 has 75% of the session's revenue (300/400), B2 has 25%.
    expect(out.get('B1')).toBeCloseTo(75);
    expect(out.get('B2')).toBeCloseTo(25);
    expect((out.get('B1') || 0) + (out.get('B2') || 0)).toBeCloseTo(100);
  });

  it('splits evenly when a session\'s bookings have zero revenue', () => {
    const out = attributeSessionGuideCostByBooking({
      bookings: [
        { booking_ref: 'B1', gross_revenue: 0 },
        { booking_ref: 'B2', gross_revenue: null },
      ],
      sessionBookings: [
        { booking_ref: 'B1', session_id: 'S1' },
        { booking_ref: 'B2', session_id: 'S1' },
      ],
      sessionGuides: [{ session_id: 'S1', status: 'accepted', base_pay: 50, bonus: 0 }],
    });
    expect(out.get('B1')).toBe(25);
    expect(out.get('B2')).toBe(25);
  });

  it('a non-accepted guide row contributes no pay', () => {
    const out = attributeSessionGuideCostByBooking({
      bookings: [{ booking_ref: 'B1', gross_revenue: 100 }],
      sessionBookings: [{ booking_ref: 'B1', session_id: 'S1' }],
      sessionGuides: [{ session_id: 'S1', status: 'offered', base_pay: 100, bonus: 0 }],
    });
    expect(out.has('B1')).toBe(false);
  });

  it('a booking not linked to any session gets no entry at all (caller falls back to its own guide_cost)', () => {
    const out = attributeSessionGuideCostByBooking({
      bookings: [{ booking_ref: 'UNSESSIONED', gross_revenue: 100 }],
      sessionBookings: [{ booking_ref: 'OTHER', session_id: 'S1' }],
      sessionGuides: [{ session_id: 'S1', status: 'accepted', base_pay: 100, bonus: 0 }],
    });
    expect(out.has('UNSESSIONED')).toBe(false);
  });

  it('many bookings in one session never inflate the session\'s total pay — shares always sum back to the true total', () => {
    const bookings = [
      { booking_ref: 'B1', gross_revenue: 200 },
      { booking_ref: 'B2', gross_revenue: 200 },
      { booking_ref: 'B3', gross_revenue: 200 },
    ];
    const out = attributeSessionGuideCostByBooking({
      bookings,
      sessionBookings: bookings.map((b) => ({ booking_ref: b.booking_ref, session_id: 'S1' })),
      sessionGuides: [
        { session_id: 'S1', status: 'accepted', base_pay: 100, bonus: 0 },
        { session_id: 'S1', status: 'accepted', base_pay: 50, bonus: 0 },
      ],
    });
    const total = Array.from(out.values()).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(150); // 100 + 50, NOT (100+50) * 3 bookings
  });
});

describe('getAdminDateFilterBounds', () => {
  const anchor = new Date(2026, 9, 15); // 2026-10-15 (month is 0-indexed: 9 = October)

  it('is open-ended going forward from Oct 1 2026 — never clamped to "today", so upcoming tours are never silently excluded', () => {
    expect(getAdminDateFilterBounds({ mode: 'fromDefaultStart' }, anchor)).toEqual({
      start: ADMIN_DEFAULT_FILTER_START,
      end: '9999-12-31',
    });
  });

  it('stays open-ended regardless of what "today" is, including a clock set before Oct 1 2026', () => {
    const earlyAnchor = new Date(2026, 8, 1); // 2026-09-01, before Oct 1 2026
    expect(getAdminDateFilterBounds({ mode: 'fromDefaultStart' }, earlyAnchor)).toEqual({
      start: ADMIN_DEFAULT_FILTER_START,
      end: '9999-12-31',
    });
  });

  it('thisMonth / lastMonth resolve to the correct calendar bounds', () => {
    expect(getAdminDateFilterBounds({ mode: 'thisMonth' }, anchor)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(getAdminDateFilterBounds({ mode: 'lastMonth' }, anchor)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('lastMonth correctly rolls back across a year boundary', () => {
    const jan = new Date(2027, 0, 10); // 2027-01-10
    expect(getAdminDateFilterBounds({ mode: 'lastMonth' }, jan)).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('allTime is wide enough to include any real date', () => {
    const bounds = getAdminDateFilterBounds({ mode: 'allTime' }, anchor);
    expect(bounds.start <= '2020-01-01').toBe(true);
    expect(bounds.end >= '2030-01-01').toBe(true);
  });

  it('month resolves an arbitrary YYYY-MM to that month\'s full bounds, older data fully reachable', () => {
    expect(getAdminDateFilterBounds({ mode: 'month', month: '2025-02' }, anchor)).toEqual({ start: '2025-02-01', end: '2025-02-28' });
  });

  it('month falls back to the current month if no/invalid month string is given', () => {
    expect(getAdminDateFilterBounds({ mode: 'month', month: 'garbage' }, anchor)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('range respects explicit from/to, and leaves either side unbounded if omitted', () => {
    expect(getAdminDateFilterBounds({ mode: 'range', rangeFrom: '2026-05-01', rangeTo: '2026-05-31' }, anchor))
      .toEqual({ start: '2026-05-01', end: '2026-05-31' });
    const openEnded = getAdminDateFilterBounds({ mode: 'range', rangeFrom: '2026-05-01' }, anchor);
    expect(openEnded.start).toBe('2026-05-01');
    expect(openEnded.end >= '2030-01-01').toBe(true);
  });
});

describe('computeGuidePaymentSummary', () => {
  const monthly = (month: string, paid: boolean, paymentDate: string | null = null): GuideMonthlyRow => ({
    id: `m-${month}`, guide_id: 'g1', guide_name: 'Maria', month,
    tours_completed: 1, amount_owed: 100, invoice_received: null, invoice_amount: null, tva: null,
    difference: null, payment_sent: paid, payment_date: paymentDate,
  });

  it('reports the latest PAID month and the latest payment date, ignoring unpaid rows entirely', () => {
    const rows = [
      monthly('2026-06', true, '2026-07-02'),
      monthly('2026-07', true, '2026-08-01'),
      monthly('2026-08', false), // unpaid — never counted toward either figure
    ];
    expect(computeGuidePaymentSummary(rows)).toEqual({ paidThroughMonth: '2026-07', lastPaymentDate: '2026-08-01' });
  });

  it('returns nulls when nothing has ever been marked paid', () => {
    const rows = [monthly('2026-06', false), monthly('2026-07', false)];
    expect(computeGuidePaymentSummary(rows)).toEqual({ paidThroughMonth: null, lastPaymentDate: null });
  });

  it('is unaffected by row order — always finds the true latest, not just the last one seen', () => {
    const rows = [
      monthly('2026-09', true, '2026-10-01'),
      monthly('2026-06', true, '2026-07-01'),
      monthly('2026-08', true, '2026-09-01'),
    ];
    expect(computeGuidePaymentSummary(rows)).toEqual({ paidThroughMonth: '2026-09', lastPaymentDate: '2026-10-01' });
  });

  it('handles an empty monthly history', () => {
    expect(computeGuidePaymentSummary([])).toEqual({ paidThroughMonth: null, lastPaymentDate: null });
  });
});

describe('filterMonthlyRowsByDateRange', () => {
  const row = (month: string | null) => ({ id: month || 'x', month });

  it('keeps only rows whose month falls within the bounds (inclusive)', () => {
    const rows = [row('2026-09'), row('2026-10'), row('2026-11'), row('2027-01')];
    const result = filterMonthlyRowsByDateRange(rows, { start: '2026-10-01', end: '2026-12-31' });
    expect(result.map((r) => r.month)).toEqual(['2026-10', '2026-11']);
  });

  it('drops pre-October "Unlinked" history under the From-Oct-1-2026 default bounds', () => {
    const rows = [row('2026-08'), row('2026-09'), row('2026-10'), row('2026-12')];
    const bounds = getAdminDateFilterBounds({ mode: 'fromDefaultStart' }, new Date(2026, 11, 15));
    const result = filterMonthlyRowsByDateRange(rows, bounds);
    expect(result.map((r) => r.month)).toEqual(['2026-10', '2026-12']);
  });

  it('keeps everything under All Time bounds', () => {
    const rows = [row('2019-01'), row('2026-10'), row('2099-12')];
    const bounds = getAdminDateFilterBounds({ mode: 'allTime' });
    expect(filterMonthlyRowsByDateRange(rows, bounds)).toHaveLength(3);
  });

  it('excludes rows with no month — never assumed to be in-range', () => {
    const rows = [row(null), row('2026-10')];
    const bounds = getAdminDateFilterBounds({ mode: 'allTime' });
    expect(filterMonthlyRowsByDateRange(rows, bounds).map((r) => r.month)).toEqual(['2026-10']);
  });
});

describe('matchesAdminStatusFilter', () => {
  const stats = (overrides: Partial<{ toursDone: number; toursUpcoming: number; paidAmount: number; pendingAmount: number }> = {}) => ({
    toursDone: 0, toursUpcoming: 0, paidAmount: 0, pendingAmount: 0, ...overrides,
  });

  it('"all" always matches, even a guide with nothing in range', () => {
    expect(matchesAdminStatusFilter(stats(), 'all')).toBe(true);
  });

  it('"upcoming" matches only rows with upcoming tours', () => {
    expect(matchesAdminStatusFilter(stats({ toursUpcoming: 1 }), 'upcoming')).toBe(true);
    expect(matchesAdminStatusFilter(stats({ toursDone: 3 }), 'upcoming')).toBe(false);
  });

  it('"done" matches only rows with completed tours', () => {
    expect(matchesAdminStatusFilter(stats({ toursDone: 2 }), 'done')).toBe(true);
    expect(matchesAdminStatusFilter(stats({ toursUpcoming: 2 }), 'done')).toBe(false);
  });

  it('"paid" matches only rows with paid earnings', () => {
    expect(matchesAdminStatusFilter(stats({ paidAmount: 50 }), 'paid')).toBe(true);
    expect(matchesAdminStatusFilter(stats({ pendingAmount: 50 }), 'paid')).toBe(false);
  });

  it('"pending" matches only rows with pending earnings', () => {
    expect(matchesAdminStatusFilter(stats({ pendingAmount: 50 }), 'pending')).toBe(true);
    expect(matchesAdminStatusFilter(stats({ paidAmount: 50 }), 'pending')).toBe(false);
  });
});

describe('isAssignmentDone — ONE definition of done/upcoming, used everywhere', () => {
  const today = '2026-10-15';

  it('a strictly past date is always done, checkin signal or not', () => {
    expect(isAssignmentDone(assignment({ id: 'a1', travel_date: '2026-10-14' }), today)).toBe(true);
    expect(isAssignmentDone(assignment({ id: 'a2', travel_date: '2026-10-14', guideCheckinTime: null }), today)).toBe(true);
  });

  it('a strictly future date is always upcoming, even if (erroneously) checked in', () => {
    expect(isAssignmentDone(assignment({ id: 'a1', travel_date: '2026-10-16' }), today)).toBe(false);
    expect(isAssignmentDone(assignment({ id: 'a2', travel_date: '2026-10-16', guideCheckinTime: '2026-10-16T09:00:00Z' }), today)).toBe(false);
  });

  it('dated today with NO checkin signal available falls back to the plain date rule (done)', () => {
    expect(isAssignmentDone(assignment({ id: 'a1', travel_date: today }), today)).toBe(true);
  });

  it('dated today WITH a checkin signal available: done only once actually checked in', () => {
    expect(isAssignmentDone(assignment({ id: 'a1', travel_date: today, guideCheckinTime: null }), today)).toBe(false);
    expect(isAssignmentDone(assignment({ id: 'a2', travel_date: today, guideCheckinTime: '2026-10-15T08:30:00Z' }), today)).toBe(true);
  });

  it('a row with no travel_date at all is never done', () => {
    expect(isAssignmentDone(assignment({ id: 'a1', travel_date: null }), today)).toBe(false);
  });

  it('is applied identically regardless of which date-filter window the row was selected under — the SAME row, same todayStr, always classifies the same way', () => {
    const futureRow = assignment({ id: 'a1', travel_date: '2026-11-01' });
    // Simulates the exact reported inconsistency: the row survives both a "This Month"-shaped
    // window (end = end of month) and a "From Oct 1"-shaped window (end = far future) — its
    // done/upcoming classification must not depend on which window let it through.
    expect(isAssignmentDone(futureRow, today)).toBe(false);
    expect(isAssignmentDone(futureRow, today)).toBe(isAssignmentDone(futureRow, today));
  });
});

describe('filterAssignmentsByStatus', () => {
  const today = '2026-10-15';
  const rows = [
    assignment({ id: 'done-paid', travel_date: '2026-10-10', calculated_pay: 60, is_paid: true }),
    assignment({ id: 'upcoming-1', travel_date: '2026-10-20', calculated_pay: 100, is_paid: false }),
    assignment({ id: 'upcoming-2', travel_date: '2026-10-25', calculated_pay: 100, is_paid: false }),
  ];

  it('"all" returns every row unchanged', () => {
    expect(filterAssignmentsByStatus(rows, 'all', today)).toHaveLength(3);
  });

  it('"upcoming" returns only not-yet-done rows', () => {
    const result = filterAssignmentsByStatus(rows, 'upcoming', today);
    expect(result.map((r) => r.id)).toEqual(['upcoming-1', 'upcoming-2']);
  });

  it('"done" returns only already-happened rows', () => {
    const result = filterAssignmentsByStatus(rows, 'done', today);
    expect(result.map((r) => r.id)).toEqual(['done-paid']);
  });

  it('"paid" / "pending" split purely on is_paid', () => {
    expect(filterAssignmentsByStatus(rows, 'paid', today).map((r) => r.id)).toEqual(['done-paid']);
    expect(filterAssignmentsByStatus(rows, 'pending', today).map((r) => r.id)).toEqual(['upcoming-1', 'upcoming-2']);
  });

  it('the top-totals example from the bug report: done + upcoming earnings sum correctly with no double count', () => {
    const doneTotal = filterAssignmentsByStatus(rows, 'done', today).reduce((s, r) => s + assignmentEarned(r), 0);
    const upcomingTotal = filterAssignmentsByStatus(rows, 'upcoming', today).reduce((s, r) => s + assignmentEarned(r), 0);
    const allTotal = filterAssignmentsByStatus(rows, 'all', today).reduce((s, r) => s + assignmentEarned(r), 0);
    expect(doneTotal).toBe(60);
    expect(upcomingTotal).toBe(200);
    expect(doneTotal + upcomingTotal).toBe(allTotal); // 60 + 200 = 260 — additive, not a double count
  });
});

describe('filterMonthlyRowsByStatus', () => {
  const rows = [
    { id: 'm1', payment_sent: true },
    { id: 'm2', payment_sent: false },
    { id: 'm3', payment_sent: null },
  ];

  it('"all" and "done" keep every row — imported monthly history is always already-completed work', () => {
    expect(filterMonthlyRowsByStatus(rows, 'all')).toHaveLength(3);
    expect(filterMonthlyRowsByStatus(rows, 'done')).toHaveLength(3);
  });

  it('"upcoming" always returns nothing — virtual rows can never be upcoming', () => {
    expect(filterMonthlyRowsByStatus(rows, 'upcoming')).toEqual([]);
  });

  it('"paid" / "pending" split on payment_sent, treating null as unpaid', () => {
    expect(filterMonthlyRowsByStatus(rows, 'paid').map((r) => r.id)).toEqual(['m1']);
    expect(filterMonthlyRowsByStatus(rows, 'pending').map((r) => r.id)).toEqual(['m2', 'm3']);
  });
});

describe('dedupeAssignmentsAcrossSources — a tour represented in both the legacy import and the session-pay system counts once', () => {
  it('drops the imported row when a session-based row matches on guide_id + travel_date + travel_time', () => {
    const imported = [
      assignment({ id: 'imp-1', guide_id: 'g1', travel_date: '2026-10-20', travel_time: '09:00', calculated_pay: 0 }),
    ];
    const sessionBased = [
      assignment({ id: 'session:s1:g1', guide_id: 'g1', travel_date: '2026-10-20', travel_time: '09:00', calculated_pay: 120 }),
    ];
    const result = dedupeAssignmentsAcrossSources(imported, sessionBased);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('session:s1:g1');
    expect(assignmentEarned(result[0])).toBe(120); // counted once, via the pay-authoritative session row
  });

  it('keeps BOTH rows when they are genuinely different tours (different time) for the same guide/day', () => {
    const imported = [
      assignment({ id: 'imp-1', guide_id: 'g1', travel_date: '2026-10-20', travel_time: '09:00', calculated_pay: 60 }),
    ];
    const sessionBased = [
      assignment({ id: 'session:s1:g1', guide_id: 'g1', travel_date: '2026-10-20', travel_time: '14:00', calculated_pay: 80 }),
    ];
    const result = dedupeAssignmentsAcrossSources(imported, sessionBased);
    expect(result).toHaveLength(2);
    expect(result.reduce((s, r) => s + assignmentEarned(r), 0)).toBe(140);
  });

  it('models a transfer correctly: after reassign_my_slot moves the session_guides row to the new guide, the tour counts once, under the new guide only', () => {
    // Pre-transfer state is never observed here — guideTransfer.ts's own doc comment confirms
    // reassign_my_slot UPDATES the existing session_guides row's guide_id rather than inserting a
    // second one, so only the POST-transfer row (now owned by guideB) ever exists.
    const sessionBased = [
      assignment({ id: 'session:s1:guideB', guide_id: 'guideB', travel_date: '2026-10-20', travel_time: '09:00', calculated_pay: 100 }),
    ];
    const result = dedupeAssignmentsAcrossSources([], sessionBased);
    expect(result).toHaveLength(1);
    expect(result[0].guide_id).toBe('guideB');
    const total = result.reduce((s, r) => s + assignmentEarned(r), 0);
    expect(total).toBe(100); // counted once, system-wide — not 200 across two guides
  });

  it('passes through unrelated imported rows (no guide_id/travel_date match) untouched', () => {
    const imported = [assignment({ id: 'imp-1', guide_id: null, travel_date: null, calculated_pay: 10 })];
    const result = dedupeAssignmentsAcrossSources(imported, []);
    expect(result).toEqual(imported);
  });
});

const review = (overrides: Partial<GuideReviewRow> & { id: string }): GuideReviewRow => ({
  guide_id: 'g1',
  stars: 5,
  reviewer_name: null,
  comment: null,
  platform: null,
  review_date: '2026-10-15',
  ...overrides,
});

describe('reviewPoints — the fixed points-per-star scale', () => {
  it('matches the exact scale: 5★=+1.0, 4★=+0.5, 3★=−0.5, 2★=−1.0, 1★=−1.0', () => {
    expect(reviewPoints(5)).toBe(1.0);
    expect(reviewPoints(4)).toBe(0.5);
    expect(reviewPoints(3)).toBe(-0.5);
    expect(reviewPoints(2)).toBe(-1.0);
    expect(reviewPoints(1)).toBe(-1.0);
  });

  it('1★ and 2★ penalize equally hard', () => {
    expect(reviewPoints(1)).toBe(reviewPoints(2));
  });

  it('an unexpected star value scores 0 rather than throwing', () => {
    expect(reviewPoints(0)).toBe(0);
    expect(reviewPoints(6)).toBe(0);
  });
});

describe('computeGuideReviewScore', () => {
  it('zero guided bookings → score is null ("—"), never a divide-by-zero', () => {
    const result = computeGuideReviewScore([review({ id: 'r1', stars: 5 })], 0);
    expect(result).toEqual({ score: null, reviewCount: 1, bookingsGuided: 0 });
  });

  it('zero guided bookings with zero reviews too → still null, not NaN', () => {
    expect(computeGuideReviewScore([], 0)).toEqual({ score: null, reviewCount: 0, bookingsGuided: 0 });
  });

  it('a guided booking with NO review dilutes the denominator without adding any points', () => {
    // 1 reviewed 5★ tour + 2 unreviewed tours = 3 guided bookings, but only 1 review.
    const result = computeGuideReviewScore([review({ id: 'r1', stars: 5 })], 3);
    expect(result.reviewCount).toBe(1);
    expect(result.bookingsGuided).toBe(3);
    expect(result.score).toBeCloseTo(1.0 / 3, 10);
  });

  it('worked example from the spec: a mix of reviews over a guide\'s guided bookings', () => {
    // 3×5★ (+3.0), 2×4★ (+1.0), 1×3★ (−0.5), 2×2★ (−2.0) = +1.5 points, over 20 bookings guided.
    const reviews = [
      review({ id: 'r1', stars: 5 }), review({ id: 'r2', stars: 5 }), review({ id: 'r3', stars: 5 }),
      review({ id: 'r4', stars: 4 }), review({ id: 'r5', stars: 4 }),
      review({ id: 'r6', stars: 3 }),
      review({ id: 'r7', stars: 2 }), review({ id: 'r8', stars: 2 }),
    ];
    const result = computeGuideReviewScore(reviews, 20);
    expect(result.reviewCount).toBe(8);
    expect(result.bookingsGuided).toBe(20);
    expect(result.score).toBeCloseTo(1.5 / 20, 10); // 0.075
  });

  it('an all-5★ guide with every booking reviewed scores exactly +1.0', () => {
    const reviews = [review({ id: 'r1', stars: 5 }), review({ id: 'r2', stars: 5 })];
    expect(computeGuideReviewScore(reviews, 2).score).toBe(1.0);
  });

  it('a review marked excluded_from_score is not counted in reviewCount or in the points', () => {
    const reviews = [
      review({ id: 'r1', stars: 5 }),
      review({ id: 'r2', stars: 1, excluded_from_score: true }), // would otherwise drag the score down hard
    ];
    const result = computeGuideReviewScore(reviews, 2);
    expect(result.reviewCount).toBe(1);
    expect(result.score).toBe(0.5); // 1.0 / 2 — the excluded 1★ contributes nothing at all
  });

  it('excluded_from_score: false or undefined/null still counts normally (not excluded)', () => {
    const reviews = [
      review({ id: 'r1', stars: 5, excluded_from_score: false }),
      review({ id: 'r2', stars: 5 }), // field absent entirely
    ];
    const result = computeGuideReviewScore(reviews, 2);
    expect(result.reviewCount).toBe(2);
    expect(result.score).toBe(1.0);
  });
});

describe('computeCheckedInBookingRecords — the score\'s denominator: checked-in BOOKINGS, dated off the checkins row itself', () => {
  const since = '2026-10-01';

  it('a booking with no checkins row at all (unresolved) is NOT counted', () => {
    const sb = [{ booking_ref: 'B1', allotted_guide_id: 'g1' }];
    expect(computeCheckedInBookingRecords(sb, [], since)).toEqual([]);
  });

  it('a booking marked NO-SHOW is NOT counted — only checked_in counts', () => {
    const sb = [{ booking_ref: 'B1', allotted_guide_id: 'g1' }];
    const checkins = [{ booking_ref: 'B1', status: 'no_show', travel_date: '2026-10-05' }];
    expect(computeCheckedInBookingRecords(sb, checkins, since)).toEqual([]);
  });

  it('a checked-in booking counts, dated and month-grouped from the CHECKIN\'s own travel_date — never a joined session', () => {
    const sb = [{ booking_ref: 'B1', allotted_guide_id: 'g1' }];
    const checkins = [{ booking_ref: 'B1', status: 'checked_in', travel_date: '2026-10-05' }];
    const records = computeCheckedInBookingRecords(sb, checkins, since);
    expect(records).toEqual([{ guide_id: 'g1', booking_ref: 'B1', month: '2026-10' }]);
  });

  it('excludes a checked-in booking dated before the since-date floor', () => {
    const sb = [{ booking_ref: 'B1', allotted_guide_id: 'g1' }];
    const checkins = [{ booking_ref: 'B1', status: 'checked_in', travel_date: '2026-09-30' }];
    expect(computeCheckedInBookingRecords(sb, checkins, since)).toEqual([]);
  });

  it('a checkins row with no travel_date is never assumed in-range', () => {
    const sb = [{ booking_ref: 'B1', allotted_guide_id: 'g1' }];
    const checkins = [{ booking_ref: 'B1', status: 'checked_in', travel_date: null }];
    expect(computeCheckedInBookingRecords(sb, checkins, since)).toEqual([]);
  });

  it('attributes a reassigned, checked-in booking to whichever guide currently holds it, never both (no double-counting on transfer)', () => {
    // Post-reassignment state: ONE session_bookings row, now allotted to guideB.
    const sb = [{ booking_ref: 'B1', allotted_guide_id: 'guideB' }];
    const checkins = [{ booking_ref: 'B1', status: 'checked_in', travel_date: '2026-10-05' }];
    const records = computeCheckedInBookingRecords(sb, checkins, since);
    expect(records).toEqual([{ guide_id: 'guideB', booking_ref: 'B1', month: '2026-10' }]);
  });

  it('counts DISTINCT BOOKINGS, not people/pax and not tours — a checked-in booking appearing twice in session_bookings counts once, regardless of how many guests it carries', () => {
    const sb = [
      { booking_ref: 'B1', allotted_guide_id: 'g1' },
      { booking_ref: 'B1', allotted_guide_id: 'g1' },
    ];
    const checkins = [{ booking_ref: 'B1', status: 'checked_in', travel_date: '2026-10-05' }];
    expect(computeCheckedInBookingRecords(sb, checkins, since)).toHaveLength(1);
  });

  it('a booking with no allotted guide is skipped even if checked in', () => {
    const sb = [{ booking_ref: 'B1', allotted_guide_id: null }];
    const checkins = [{ booking_ref: 'B1', status: 'checked_in', travel_date: '2026-10-05' }];
    expect(computeCheckedInBookingRecords(sb, checkins, since)).toEqual([]);
  });

  it('REGRESSION: counting off the checkin\'s own travel_date (not a joined session\'s tour_date) means a stale/mismatched session_bookings link can never under- or over-count — this is the exact "35 vs 47" bug fixed', () => {
    // Two guides, several bookings each, a mix of checked-in/no-show/unresolved, spanning the
    // since-date floor — proves the count is exactly the distinct checked-in bookings on/after
    // the floor, nothing aggregated by person/pax and nothing pulled in from before it.
    const sb = [
      { booking_ref: 'A1', allotted_guide_id: 'g1' },
      { booking_ref: 'A2', allotted_guide_id: 'g1' },
      { booking_ref: 'A3', allotted_guide_id: 'g1' }, // no-show — excluded
      { booking_ref: 'A4', allotted_guide_id: 'g1' }, // unresolved — excluded
      { booking_ref: 'A5', allotted_guide_id: 'g1' }, // checked in but BEFORE the floor — excluded
      { booking_ref: 'B1', allotted_guide_id: 'g2' },
    ];
    const checkins = [
      { booking_ref: 'A1', status: 'checked_in', travel_date: '2026-10-02' },
      { booking_ref: 'A2', status: 'checked_in', travel_date: '2026-10-10' },
      { booking_ref: 'A3', status: 'no_show', travel_date: '2026-10-11' },
      { booking_ref: 'A5', status: 'checked_in', travel_date: '2026-09-15' },
      { booking_ref: 'B1', status: 'checked_in', travel_date: '2026-10-03' },
    ];
    const records = computeCheckedInBookingRecords(sb, checkins, since);
    const counts = countCheckedInBookingsByGuide(records);
    expect(counts.get('g1')).toBe(2); // A1, A2 only
    expect(counts.get('g2')).toBe(1); // B1
  });
});

describe('countCheckedInBookingsByGuide / countCheckedInBookingsByGuideAndMonth', () => {
  const records = [
    { guide_id: 'g1', booking_ref: 'B1', month: '2026-10' },
    { guide_id: 'g1', booking_ref: 'B2', month: '2026-10' },
    { guide_id: 'g1', booking_ref: 'B3', month: '2026-11' },
    { guide_id: 'g2', booking_ref: 'B4', month: '2026-10' },
  ];

  it('counts overall checked-in bookings per guide', () => {
    const counts = countCheckedInBookingsByGuide(records);
    expect(counts.get('g1')).toBe(3);
    expect(counts.get('g2')).toBe(1);
  });

  it('counts checked-in bookings per guide AND month, for the monthly score view', () => {
    const byMonth = countCheckedInBookingsByGuideAndMonth(records);
    expect(byMonth.get('g1')?.get('2026-10')).toBe(2);
    expect(byMonth.get('g1')?.get('2026-11')).toBe(1);
    expect(byMonth.get('g2')?.get('2026-10')).toBe(1);
  });
});

describe('groupReviewsByMonth', () => {
  it('groups reviews by the month of review_date', () => {
    const reviews = [
      review({ id: 'r1', review_date: '2026-10-05' }),
      review({ id: 'r2', review_date: '2026-10-20' }),
      review({ id: 'r3', review_date: '2026-11-02' }),
    ];
    const byMonth = groupReviewsByMonth(reviews);
    expect(byMonth.get('2026-10')?.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(byMonth.get('2026-11')?.map((r) => r.id)).toEqual(['r3']);
  });
});

describe('computeGuideLeaderboard', () => {
  it('excludes a guide below the 3-booking threshold IN THE PERIOD, even with great reviews', () => {
    const reviewsByGuide = new Map([
      ['g1', [review({ id: 'r1', guide_id: 'g1', stars: 5 })]],
      ['g3', [review({ id: 'r2', guide_id: 'g3', stars: 5 })]],
    ]);
    const periodCounts = new Map([['g1', 10], ['g3', 2]]);
    const board = computeGuideLeaderboard(['g1', 'g3'], reviewsByGuide, periodCounts);
    expect(board.map((e) => e.guide_id)).toEqual(['g1']);
  });

  it('ranks by score, highest first, rank starting at 1', () => {
    const reviewsByGuide = new Map([
      ['g1', [review({ id: 'r1', guide_id: 'g1', stars: 3 })]], // -0.5 / 10 = -0.05
      ['g2', [review({ id: 'r2', guide_id: 'g2', stars: 5 })]], // 1.0 / 5 = 0.2
    ]);
    const periodCounts = new Map([['g1', 10], ['g2', 5]]);
    const board = computeGuideLeaderboard(['g1', 'g2'], reviewsByGuide, periodCounts);
    expect(board.map((e) => e.guide_id)).toEqual(['g2', 'g1']);
    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(2);
  });

  it('leaves out a guide with zero checked-in bookings in the selected period (e.g. a quiet month)', () => {
    const reviewsByGuide = new Map<string, GuideReviewRow[]>();
    const periodCounts = new Map([['g1', 0], ['g2', 4]]);
    reviewsByGuide.set('g2', [review({ id: 'r1', guide_id: 'g2', stars: 5 })]);
    const board = computeGuideLeaderboard(['g1', 'g2'], reviewsByGuide, periodCounts);
    expect(board.map((e) => e.guide_id)).toEqual(['g2']);
  });

  it('returns an empty board when nobody meets the threshold', () => {
    const board = computeGuideLeaderboard(['g3'], new Map(), new Map([['g3', 2]]));
    expect(board).toEqual([]);
  });

  it('a guide eligible OVERALL (26 checked-in bookings) but with only 2 in October is excluded from October\'s board — the 3-booking threshold applies PER PERIOD, not overall', () => {
    const reviewsByGuide = new Map([['g1', [review({ id: 'r1', guide_id: 'g1', stars: 5 })]]]);
    const octoberCounts = new Map([['g1', 2]]); // only 2 of their 26 overall bookings were in October
    const board = computeGuideLeaderboard(['g1'], reviewsByGuide, octoberCounts);
    expect(board).toEqual([]);
  });

  it('October\'s bookingsCount reflects ONLY October (6), never the guide\'s larger overall total (26) — the exact reported bug', () => {
    const reviewsByGuide = new Map([['g1', [
      review({ id: 'r1', guide_id: 'g1', stars: 5 }), review({ id: 'r2', guide_id: 'g1', stars: 5 }),
    ]]]);
    const octoberCounts = new Map([['g1', 6]]); // same guide's overall total elsewhere is 26
    const board = computeGuideLeaderboard(['g1'], reviewsByGuide, octoberCounts);
    expect(board).toHaveLength(1);
    expect(board[0].bookingsCount).toBe(6);
    expect(board[0].reviewCount).toBe(2);
    expect(board[0].score).toBeCloseTo(2.0 / 6, 10);
  });

  it('GUIDE_SCORE_MIN_BOOKINGS is the exact threshold used (3)', () => {
    expect(GUIDE_SCORE_MIN_BOOKINGS).toBe(3);
  });
});

describe('computeCombinedGuideScore — punctuality, built now, zero weight', () => {
  it('at PUNCTUALITY_SCORE_WEIGHT === 0, always returns the review score unchanged, regardless of punctuality', () => {
    expect(PUNCTUALITY_SCORE_WEIGHT).toBe(0);
    expect(computeCombinedGuideScore(0.2, 100)).toBe(0.2);
    expect(computeCombinedGuideScore(0.2, 0)).toBe(0.2);
    expect(computeCombinedGuideScore(-0.3, 50)).toBe(-0.3);
    expect(computeCombinedGuideScore(0.2, null)).toBe(0.2);
  });

  it('a null review score stays null regardless of punctuality — nothing to combine', () => {
    expect(computeCombinedGuideScore(null, 100)).toBeNull();
    expect(computeCombinedGuideScore(null, null)).toBeNull();
  });
});

describe('getScoreBand — the plain-language verdict thresholds', () => {
  it('maps every band boundary correctly', () => {
    expect(getScoreBand(0.5)).toBe('excellent');
    expect(getScoreBand(0.75)).toBe('excellent');
    expect(getScoreBand(0.49)).toBe('good');
    expect(getScoreBand(0.2)).toBe('good');
    expect(getScoreBand(0.19)).toBe('needs_improvement');
    expect(getScoreBand(0)).toBe('needs_improvement');
    expect(getScoreBand(-0.01)).toBe('falling');
    expect(getScoreBand(-5)).toBe('falling');
  });

  it('returns null for a null score ("—"), never a band', () => {
    expect(getScoreBand(null)).toBeNull();
  });
});

describe('computeGuideOverviewRows — review score wired through (replaces avgRating/reviewRatePct)', () => {
  const guides = [{ id: 'g1', name: 'Maria', guide_number: 'SZT-2026-1' }];

  it('a real guide\'s row carries reviewScore/reviewCount/bookingsGuided from the supplied reviews + counts', () => {
    const reviews = [review({ id: 'r1', guide_id: 'g1', stars: 5 }), review({ id: 'r2', guide_id: 'g1', stars: 3 })];
    const guidedCounts = new Map([['g1', 10]]);
    const rows = computeGuideOverviewRows(guides, [], reviews, guidedCounts, [], '2026-10-15');
    const row = rows.find((r) => r.id === 'g1')!;
    expect(row.reviewCount).toBe(2);
    expect(row.bookingsGuided).toBe(10);
    expect(row.reviewScore).toBeCloseTo((1.0 - 0.5) / 10, 10);
  });

  it('a virtual (unlinked) row always has a null review score — reviews require a real guide_id', () => {
    const monthlyRows = [{
      id: 'm1', guide_id: null, guide_name: 'Old Guide', month: '2026-05', tours_completed: 3,
      amount_owed: 150, invoice_received: null, invoice_amount: null, tva: null, difference: null,
      payment_sent: true, payment_date: '2026-06-01',
    }];
    const rows = computeGuideOverviewRows([], [], [], new Map(), monthlyRows, '2026-10-15');
    const virtual = rows.find((r) => r.kind === 'virtual')!;
    expect(virtual.reviewScore).toBeNull();
    expect(virtual.reviewCount).toBe(0);
    expect(virtual.bookingsGuided).toBe(0);
  });

  it('a guide with zero guided bookings shows reviewScore null even with reviews on file', () => {
    const reviews = [review({ id: 'r1', guide_id: 'g1', stars: 5 })];
    const rows = computeGuideOverviewRows(guides, [], reviews, new Map(), [], '2026-10-15');
    expect(rows.find((r) => r.id === 'g1')!.reviewScore).toBeNull();
  });
});
