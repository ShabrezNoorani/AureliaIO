import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  computeGuideReviewScore, computeCheckedInBookingRecords, countCheckedInBookingsByGuide,
  computeGuideLeaderboard, getScoreBand, computePunctualityStats, computeCombinedGuideScore,
  GUIDE_SCORE_MIN_BOOKINGS, ADMIN_DEFAULT_FILTER_START,
  type GuideReviewRow, type CheckinForGuiding, type SessionBookingForGuiding,
  type ArrivalPunctualityRow, type ScoreBand,
} from '@/lib/guidePerformance';

export interface GuideOwnScore {
  loading: boolean;
  /** Gate: true once this guide has GUIDE_SCORE_MIN_BOOKINGS+ checked-in bookings since Oct 1, 2026. */
  unlocked: boolean;
  /** Checked-in BOOKINGS (never pax, never tours) — label this "bookings" in UI copy. */
  bookingsCount: number;
  reviewCount: number;
  /** The real, ranked score — currently always equal to the raw review score
      (PUNCTUALITY_SCORE_WEIGHT is 0), via computeCombinedGuideScore. */
  score: number | null;
  band: ScoreBand | null;
  /** Display-only, zero-weight today — see computeCombinedGuideScore's own doc comment. */
  onTimeCount: number;
  onTimePct: number | null;
  countedArrivals: number;
  /** Number only — the leaderboard's #1 score, never that guide's name/id. */
  topScore: number | null;
  rank: number | null;
  totalRanked: number;
  /** This guide's own reviews (full rows — reviewer_name/comment/platform included), for
      rendering their own review list. Never another guide's rows. */
  myReviews: GuideReviewRow[];
}

/**
 * This guide's own review score + their anonymized rank/top-score, computed from the SAME
 * checked-in-booking rule and the SAME leaderboard function the admin dashboard uses
 * (computeCheckedInBookingRecords/computeGuideLeaderboard), so a guide's own numbers and the
 * admin's can never disagree. Shared by GuideHome.tsx (leads with this at the top) and
 * GuideReviews.tsx (shows it alongside the full review list) so the fetch/compute logic lives in
 * exactly one place.
 *
 * Privacy: the `guides` query below selects ONLY `id`, never `name` — no other guide's name is
 * ever fetched here, let alone rendered. The company-wide `guide_reviews` query for the
 * leaderboard arithmetic selects only `id, guide_id, stars, review_date, excluded_from_score` —
 * another guide's reviewer_name/comment/platform never leaves the server for that query at all.
 * `myReviews` (this guide's own, full rows) is a separate, narrowly-scoped fetch
 * (`.eq('guide_id', guideId)`).
 */
export function useGuideOwnScore(guideId: string | null, guideUserId: string | null): GuideOwnScore {
  const [loading, setLoading] = useState(true);
  const [myReviews, setMyReviews] = useState<GuideReviewRow[]>([]);
  const [allGuideIds, setAllGuideIds] = useState<string[]>([]);
  const [allReviewsSinceOct1, setAllReviewsSinceOct1] = useState<GuideReviewRow[]>([]);
  const [overallBookingCounts, setOverallBookingCounts] = useState<Map<string, number>>(new Map());
  const [arrivals, setArrivals] = useState<ArrivalPunctualityRow[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!guideId || !guideUserId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [myReviewsRes, allReviewsRes, guidesRes, sbRes, checkinsRes, arrivalsRes] = await Promise.all([
        supabase.from('guide_reviews').select('*').eq('guide_id', guideId),
        supabase.from('guide_reviews').select('id, guide_id, stars, review_date, excluded_from_score').gte('review_date', ADMIN_DEFAULT_FILTER_START),
        supabase.from('guides').select('id').eq('user_id', guideUserId),
        supabase.from('session_bookings').select('booking_ref, allotted_guide_id').eq('user_id', guideUserId),
        // travel_date, not just status — the booking-count rule now dates directly off this row,
        // never a joined session (see computeCheckedInBookingRecords' own doc comment for why).
        supabase.from('checkins').select('booking_ref, status, travel_date')
          .eq('user_id', guideUserId).eq('status', 'checked_in').gte('travel_date', ADMIN_DEFAULT_FILTER_START),
        supabase.from('guide_arrivals').select('minutes_late').eq('guide_id', guideId),
      ]);
      if (!mounted) return;

      const sessionBookings: SessionBookingForGuiding[] = sbRes.data || [];
      const checkins: CheckinForGuiding[] = checkinsRes.data || [];
      const records = computeCheckedInBookingRecords(sessionBookings, checkins, ADMIN_DEFAULT_FILTER_START);
      setOverallBookingCounts(countCheckedInBookingsByGuide(records));
      setAllGuideIds((guidesRes.data || []).map((g: { id: string }) => g.id));
      // Pads the never-fetched text fields back in (always null) purely to satisfy GuideReviewRow's
      // shape — computeGuideReviewScore only ever reads `.stars`/`.excluded_from_score`, so this
      // is inert, not a leak.
      setAllReviewsSinceOct1((allReviewsRes.data || []).map((r: {
        id: string; guide_id: string; stars: number; review_date: string; excluded_from_score: boolean | null;
      }) => ({
        ...r, reviewer_name: null, comment: null, platform: null,
      })));
      setMyReviews(myReviewsRes.data || []);
      setArrivals(arrivalsRes.data || []);
      setLoading(false);
    };

    load();
    return () => { mounted = false; };
  }, [guideId, guideUserId]);

  const bookingsCount = overallBookingCounts.get(guideId || '') || 0;
  const myReviewsSinceOct1 = useMemo(
    () => myReviews.filter(r => r.review_date >= ADMIN_DEFAULT_FILTER_START),
    [myReviews]
  );
  const myReviewScore = useMemo(
    () => computeGuideReviewScore(myReviewsSinceOct1, bookingsCount),
    [myReviewsSinceOct1, bookingsCount]
  );
  const unlocked = bookingsCount >= GUIDE_SCORE_MIN_BOOKINGS;

  const punctuality = useMemo(() => computePunctualityStats(arrivals), [arrivals]);
  // The real, ranked score — identical to myReviewScore.score today (PUNCTUALITY_SCORE_WEIGHT is
  // 0); see computeCombinedGuideScore's own doc comment for how raising that one constant later
  // picks this up automatically.
  const combinedScore = computeCombinedGuideScore(myReviewScore.score, punctuality.onTimePct);

  const leaderboard = useMemo(() => {
    if (!unlocked) return [];
    const reviewsByGuide = new Map<string, GuideReviewRow[]>();
    allReviewsSinceOct1.forEach(r => {
      const arr = reviewsByGuide.get(r.guide_id) || [];
      arr.push(r);
      reviewsByGuide.set(r.guide_id, arr);
    });
    return computeGuideLeaderboard(allGuideIds, reviewsByGuide, overallBookingCounts);
  }, [unlocked, allGuideIds, allReviewsSinceOct1, overallBookingCounts]);

  const topScore = leaderboard[0]?.score ?? null;
  const myRankEntry = guideId ? leaderboard.find(e => e.guide_id === guideId) : undefined;
  const band = getScoreBand(combinedScore);

  return {
    loading,
    unlocked,
    bookingsCount,
    reviewCount: myReviewScore.reviewCount,
    score: combinedScore,
    band,
    onTimeCount: punctuality.onTimeCount,
    onTimePct: punctuality.onTimePct,
    countedArrivals: punctuality.countedArrivals,
    topScore,
    rank: myRankEntry?.rank ?? null,
    totalRanked: leaderboard.length,
    myReviews,
  };
}
