import { describe, it, expect } from 'vitest';
import {
  isApprovedReview, reviewCountsTowardScore, computeGuideReviewScore, computeReviewPointsPerUnit,
  type GuideReviewRow,
} from './guidePerformance';

const review = (id: string, stars: number, extra: Partial<GuideReviewRow> = {}): GuideReviewRow => ({
  id, guide_id: 'g1', stars, reviewer_name: null, comment: null, platform: null, review_date: '2026-10-10', ...extra,
});

describe('review approval filter', () => {
  it('treats missing/null approval_status as approved (pre-existing and owner-entered reviews)', () => {
    expect(isApprovedReview(review('a', 5))).toBe(true);
    expect(isApprovedReview(review('b', 5, { approval_status: null }))).toBe(true);
    expect(isApprovedReview(review('c', 5, { approval_status: 'approved' }))).toBe(true);
    expect(isApprovedReview(review('d', 5, { approval_status: 'pending' }))).toBe(false);
  });

  it('counts only approved AND not-excluded reviews', () => {
    expect(reviewCountsTowardScore(review('a', 5))).toBe(true);
    expect(reviewCountsTowardScore(review('b', 5, { excluded_from_score: true }))).toBe(false);
    expect(reviewCountsTowardScore(review('c', 5, { approval_status: 'pending' }))).toBe(false);
  });

  it('a pending review never changes the score, review count or per-unit metric', () => {
    const approved = [review('a', 5), review('b', 4)];
    const withPending = [...approved, review('p', 1, { approval_status: 'pending', submitted_by_guide: true })];
    expect(computeGuideReviewScore(withPending, 10)).toEqual(computeGuideReviewScore(approved, 10));
    expect(computeReviewPointsPerUnit(withPending, 4)).toEqual(computeReviewPointsPerUnit(approved, 4));
  });

  it('once approved it counts exactly like an owner-entered review', () => {
    const owner = [review('a', 5), review('x', 5)];
    const approvedGuide = [review('a', 5), review('x', 5, { approval_status: 'approved', submitted_by_guide: true })];
    expect(computeGuideReviewScore(approvedGuide, 10)).toEqual(computeGuideReviewScore(owner, 10));
  });
});
