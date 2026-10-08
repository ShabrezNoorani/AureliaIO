import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { localDateStr } from '@/lib/utils';
import {
  computeGuideReviewScore, computeDoneBookingRecords, countDoneBookingsByGuide,
  computeGuideLeaderboard, getScoreBand, GUIDE_SCORE_MIN_TOURS, ADMIN_DEFAULT_FILTER_START,
  type GuideReviewRow, type CheckinForGuiding, type SessionBookingForGuiding, type SessionDateForGuiding,
  type ScoreBand,
} from '@/lib/guidePerformance';

export interface GuideOwnScore {
  loading: boolean;
  /** Gate: true once this guide has GUIDE_SCORE_MIN_TOURS+ done tours since Oct 1, 2026. */
  unlocked: boolean;
  doneTours: number;
  reviewCount: number;
  score: number | null;
  band: ScoreBand | null;
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
 * done/upcoming rule and the SAME leaderboard function the admin dashboard uses
 * (computeDoneBookingRecords/computeGuideLeaderboard), so a guide's own numbers and the admin's
 * can never disagree. Shared by GuideHome.tsx (leads with this at the top) and GuideReviews.tsx
 * (shows it alongside the full review list) so the fetch/compute logic lives in exactly one place.
 *
 * Privacy: the `guides` query below selects ONLY `id`, never `name` — no other guide's name is
 * ever fetched here, let alone rendered. The company-wide `guide_reviews` query for the
 * leaderboard arithmetic selects only `id, guide_id, stars, review_date` — another guide's
 * reviewer_name/comment/platform never leaves the server for that query at all. `myReviews`
 * (this guide's own, full rows) is a separate, narrowly-scoped fetch (`.eq('guide_id', guideId)`).
 */
export function useGuideOwnScore(guideId: string | null, guideUserId: string | null): GuideOwnScore {
  const [loading, setLoading] = useState(true);
  const [myReviews, setMyReviews] = useState<GuideReviewRow[]>([]);
  const [allGuideIds, setAllGuideIds] = useState<string[]>([]);
  const [allReviewsSinceOct1, setAllReviewsSinceOct1] = useState<GuideReviewRow[]>([]);
  const [overallDoneCounts, setOverallDoneCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!guideId || !guideUserId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const todayStr = localDateStr();
      const [myReviewsRes, allReviewsRes, guidesRes, sbRes, sessRes, checkinsRes] = await Promise.all([
        supabase.from('guide_reviews').select('*').eq('guide_id', guideId),
        supabase.from('guide_reviews').select('id, guide_id, stars, review_date').gte('review_date', ADMIN_DEFAULT_FILTER_START),
        supabase.from('guides').select('id').eq('user_id', guideUserId),
        supabase.from('session_bookings').select('booking_ref, allotted_guide_id, session_id').eq('user_id', guideUserId),
        supabase.from('tour_sessions').select('id, tour_date').eq('user_id', guideUserId),
        supabase.from('checkins').select('booking_ref, status')
          .eq('user_id', guideUserId).eq('status', 'checked_in').gte('travel_date', ADMIN_DEFAULT_FILTER_START),
      ]);
      if (!mounted) return;

      const sessionBookings: SessionBookingForGuiding[] = sbRes.data || [];
      const sessions: SessionDateForGuiding[] = sessRes.data || [];
      const checkins: CheckinForGuiding[] = checkinsRes.data || [];
      const records = computeDoneBookingRecords(sessionBookings, sessions, checkins, ADMIN_DEFAULT_FILTER_START, todayStr);
      setOverallDoneCounts(countDoneBookingsByGuide(records));
      setAllGuideIds((guidesRes.data || []).map((g: { id: string }) => g.id));
      // Pads the never-fetched text fields back in (always null) purely to satisfy GuideReviewRow's
      // shape — computeGuideReviewScore only ever reads `.stars`, so this is inert, not a leak.
      setAllReviewsSinceOct1((allReviewsRes.data || []).map((r: { id: string; guide_id: string; stars: number; review_date: string }) => ({
        ...r, reviewer_name: null, comment: null, platform: null,
      })));
      setMyReviews(myReviewsRes.data || []);
      setLoading(false);
    };

    load();
    return () => { mounted = false; };
  }, [guideId, guideUserId]);

  const doneTours = overallDoneCounts.get(guideId || '') || 0;
  const myReviewsSinceOct1 = useMemo(
    () => myReviews.filter(r => r.review_date >= ADMIN_DEFAULT_FILTER_START),
    [myReviews]
  );
  const myReviewScore = useMemo(
    () => computeGuideReviewScore(myReviewsSinceOct1, doneTours),
    [myReviewsSinceOct1, doneTours]
  );
  const unlocked = doneTours >= GUIDE_SCORE_MIN_TOURS;

  const leaderboard = useMemo(() => {
    if (!unlocked) return [];
    const reviewsByGuide = new Map<string, GuideReviewRow[]>();
    allReviewsSinceOct1.forEach(r => {
      const arr = reviewsByGuide.get(r.guide_id) || [];
      arr.push(r);
      reviewsByGuide.set(r.guide_id, arr);
    });
    return computeGuideLeaderboard(allGuideIds, reviewsByGuide, overallDoneCounts);
  }, [unlocked, allGuideIds, allReviewsSinceOct1, overallDoneCounts]);

  const topScore = leaderboard[0]?.score ?? null;
  const myRankEntry = guideId ? leaderboard.find(e => e.guide_id === guideId) : undefined;
  const band = getScoreBand(myReviewScore.score);

  return {
    loading,
    unlocked,
    doneTours,
    reviewCount: myReviewScore.reviewCount,
    score: myReviewScore.score,
    band,
    topScore,
    rank: myRankEntry?.rank ?? null,
    totalRanked: leaderboard.length,
    myReviews,
  };
}
