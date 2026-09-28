import { describe, it, expect } from 'vitest';
import {
  computeRatingStats, computePunctualityStats, computeGuideScore, computeAssignmentStats,
  assignmentEarned, sessionGuidesToAssignmentRows, buildUnifiedMonthlyRows,
  PUNCTUALITY_GRACE_MINUTES,
  type GuideRatingRow, type GuideAssignmentRow, type GuideMonthlyRow,
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
