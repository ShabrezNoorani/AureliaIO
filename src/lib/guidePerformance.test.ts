import { describe, it, expect } from 'vitest';
import {
  computeRatingStats, computePunctualityStats, computeGuideScore,
  PUNCTUALITY_GRACE_MINUTES, type GuideRatingRow,
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
