import { describe, it, expect } from 'vitest';
import { formatGuideScoreBreakdown } from './GuideScoreCard';
import { computeRatingStats, computeGuideScore, type GuideRatingRow } from '@/lib/guidePerformance';

describe('formatGuideScoreBreakdown', () => {
  it('renders the full breakdown with all three components present', () => {
    const ratings: GuideRatingRow[] = [{
      id: 'r1', guide_id: 'g1', stars: 5, quantity: 8, source: null, note: null,
      verified: true, verified_at: null, created_at: null, added_by: 'owner',
    }];
    const ratingStats = computeRatingStats(ratings, 12);
    const score = computeGuideScore(ratingStats, { countedArrivals: 10, onTimeCount: 9, onTimePct: 90 }, 12);

    expect(formatGuideScoreBreakdown(score)).toBe(
      'Quality 5.0 · 67% reviewed · 90% on-time (12 tours, 8 reviews, 10 arrivals)'
    );
  });

  it('shows — for components with no data, never a fake 0', () => {
    const ratingStats = computeRatingStats([], 0);
    const score = computeGuideScore(ratingStats, { countedArrivals: 0, onTimeCount: 0, onTimePct: null }, 0);

    expect(formatGuideScoreBreakdown(score)).toBe(
      'Quality — · — reviewed · — on-time (0 tours, 0 reviews, 0 arrivals)'
    );
  });

  it('reviews present, no arrivals yet — punctuality reads as —, not 0%', () => {
    const ratings: GuideRatingRow[] = [{
      id: 'r1', guide_id: 'g1', stars: 5, quantity: 3, source: null, note: null,
      verified: true, verified_at: null, created_at: null, added_by: 'owner',
    }];
    const ratingStats = computeRatingStats(ratings, 5);
    const score = computeGuideScore(ratingStats, { countedArrivals: 0, onTimeCount: 0, onTimePct: null }, 5);

    expect(formatGuideScoreBreakdown(score)).toBe(
      'Quality 5.0 · 60% reviewed · — on-time (5 tours, 3 reviews, 0 arrivals)'
    );
  });
});
