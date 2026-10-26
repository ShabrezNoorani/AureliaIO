import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  computeMetricValue, computeGuideLeaderboardByMetric, computeToursPerGuide,
  computeCheckedInBookingCountsForPeriod, filterReviewsByPeriod, filterArrivalsByPeriod,
  computePunctualityStats, getScoreBand, getLeaderboardPeriodBounds,
  GUIDE_SCORE_MIN_BOOKINGS, ADMIN_DEFAULT_FILTER_START, DEFAULT_LEADERBOARD_PERIOD,
  type GuideReviewRow, type CheckinForGuiding, type SessionBookingForGuiding,
  type SessionGuideForTourCount, type SessionDateForTourCount, type ArrivalForPeriod,
  type ScoreBand, type LeaderboardMetric, type LeaderboardPeriod,
  isApprovedReview, reviewCountsTowardScore,
} from '@/lib/guidePerformance';

type ScoringReviewRow = {
  id: string; guide_id: string; stars: number; review_date: string;
  excluded_from_score: boolean | null; approval_status?: string | null;
};

// Company-wide review rows for the score/leaderboard, guide_id + stars only (see privacy note
// below). Asks for approval_status so PENDING guide-submitted reviews can be dropped before any
// arithmetic; if that column isn't migrated yet the first select errors, and the original select
// runs instead (no pending reviews can exist without the column, so nothing changes).
async function fetchScoringReviews(): Promise<ScoringReviewRow[]> {
  const cols = 'id, guide_id, stars, review_date, excluded_from_score';
  const withApproval = await supabase.from('guide_reviews')
    .select(`${cols}, approval_status`).gte('review_date', ADMIN_DEFAULT_FILTER_START);
  if (!withApproval.error) return (withApproval.data || []) as ScoringReviewRow[];
  const fallback = await supabase.from('guide_reviews')
    .select(cols).gte('review_date', ADMIN_DEFAULT_FILTER_START);
  return (fallback.data || []) as ScoringReviewRow[];
}

export interface GuideOwnScore {
  loading: boolean;
  /** Gate: true once this guide has GUIDE_SCORE_MIN_BOOKINGS+ checked-in bookings WITHIN the
      selected period (not always since Oct 1 — a narrow period like a single day will usually be
      locked, same as everyone else's). */
  unlocked: boolean;
  /** Checked-in BOOKINGS in the selected period (never pax, never tours). */
  bookingsCount: number;
  /** Distinct tours (accepted session_guides rows) in the selected period. */
  toursCount: number;
  /** Reviews actually counted toward the selected metric, in the selected period. */
  reviewCount: number;
  /** Echoes back which metric `score` reflects. */
  metric: LeaderboardMetric;
  /** The selected metric's value, in that metric's own scale (points-per-unit for perBooking/
      perTour, 0-100 for punctuality/combined) — null renders as "—", never a fabricated 0. */
  score: number | null;
  /** Only ever set for the 'perBooking' metric — getScoreBand's thresholds are calibrated for
      that score's own range and would misread a 0-100 punctuality/combined value. */
  band: ScoreBand | null;
  onTimeCount: number;
  onTimePct: number | null;
  countedArrivals: number;
  /** Number only — the leaderboard's #1 value for the SAME metric/period, never that guide's
      name/id. */
  topScore: number | null;
  rank: number | null;
  totalRanked: number;
  /** This guide's own reviews (full rows — reviewer_name/comment/platform included), ALL-time —
      for rendering their own review list. Never another guide's rows, never period-filtered (the
      list is a separate concern from the period-scoped score above). */
  myReviews: GuideReviewRow[];
  /** Re-fetches everything (e.g. right after this guide submits a review). */
  reload: () => void;
}

/**
 * This guide's own score for the selected metric/period + their anonymized rank/top-value,
 * computed from the SAME functions the admin Leaderboard uses (computeGuideLeaderboardByMetric
 * et al.), so a guide's own numbers and the admin's can never disagree. Shared by GuideHome.tsx
 * (leads with this at the top) and GuideReviews.tsx (shows it alongside the full review list) so
 * the fetch/compute logic lives in exactly one place. Each caller owns its own metric/period
 * state and passes it in — this hook recomputes (not re-fetches) when either changes, only
 * re-fetching when the guide identity itself changes.
 *
 * Privacy: every company-wide query below selects ONLY guide_id (never name/reviewer_name/
 * comment/platform) — no other guide's identity or review text ever leaves the server for the
 * leaderboard arithmetic. `myReviews` (this guide's own, full rows) is a separate, narrowly-scoped
 * fetch (`.eq('guide_id', guideId)`).
 */
export function useGuideOwnScore(
  guideId: string | null,
  guideUserId: string | null,
  metric: LeaderboardMetric = 'perBooking',
  period: LeaderboardPeriod = DEFAULT_LEADERBOARD_PERIOD,
): GuideOwnScore {
  const [loading, setLoading] = useState(true);
  const [myReviews, setMyReviews] = useState<GuideReviewRow[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [allGuideIds, setAllGuideIds] = useState<string[]>([]);
  const [allReviewsSinceStart, setAllReviewsSinceStart] = useState<GuideReviewRow[]>([]);
  const [sessionBookings, setSessionBookings] = useState<SessionBookingForGuiding[]>([]);
  const [checkins, setCheckins] = useState<CheckinForGuiding[]>([]);
  const [sessionGuides, setSessionGuides] = useState<SessionGuideForTourCount[]>([]);
  const [sessions, setSessions] = useState<SessionDateForTourCount[]>([]);
  const [arrivals, setArrivals] = useState<ArrivalForPeriod[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!guideId || !guideUserId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [
        myReviewsRes, allReviewsRes, guidesRes, sbRes, checkinsRes, sessionGuidesRes, sessionsRes, arrivalsRes,
      ] = await Promise.all([
        supabase.from('guide_reviews').select('*').eq('guide_id', guideId),
        fetchScoringReviews(),
        supabase.from('guides').select('id').eq('user_id', guideUserId),
        // session_id is required now — computeCheckedInBookingCountsForPeriod cross-checks it
        // against session_guides below, so a guideless session's bookings count toward nobody.
        supabase.from('session_bookings').select('booking_ref, allotted_guide_id, session_id').eq('user_id', guideUserId),
        // travel_date, not just status — the booking-count rule dates directly off this row, never
        // a joined session (see computeCheckedInBookingCountsForPeriod's own doc comment).
        supabase.from('checkins').select('booking_ref, status, travel_date')
          .eq('user_id', guideUserId).eq('status', 'checked_in').gte('travel_date', ADMIN_DEFAULT_FILTER_START),
        // Company-wide, guide_id only — no names — for the "Per Tour" metric's denominator.
        supabase.from('session_guides').select('guide_id, session_id, status').eq('user_id', guideUserId),
        supabase.from('tour_sessions').select('id, tour_date').eq('user_id', guideUserId).gte('tour_date', ADMIN_DEFAULT_FILTER_START),
        // Company-wide, guide_id only — no names — for the Punctuality/Combined metrics' ranking.
        supabase.from('guide_arrivals').select('guide_id, arrived_at, minutes_late')
          .eq('user_id', guideUserId).gte('arrived_at', ADMIN_DEFAULT_FILTER_START),
      ]);
      if (!mounted) return;

      setAllGuideIds((guidesRes.data || []).map((g: { id: string }) => g.id));
      // Pads the never-fetched text fields back in (always null) purely to satisfy GuideReviewRow's
      // shape — scoring only ever reads `.stars`/`.excluded_from_score`/`.review_date`, so this is
      // inert, not a leak.
      // Pending (guide-submitted, not yet owner-approved) reviews are dropped here, before any
      // score/rank arithmetic — they never count for anyone until approved.
      setAllReviewsSinceStart(allReviewsRes.filter(isApprovedReview).map((r) => ({
        ...r, reviewer_name: null, comment: null, platform: null,
      })));
      setSessionBookings(sbRes.data || []);
      setCheckins(checkinsRes.data || []);
      setSessionGuides(sessionGuidesRes.data || []);
      setSessions(sessionsRes.data || []);
      setArrivals(arrivalsRes.data || []);
      setMyReviews(myReviewsRes.data || []);
      setLoading(false);
    };

    load();
    return () => { mounted = false; };
  }, [guideId, guideUserId, reloadKey]);

  const bounds = useMemo(() => getLeaderboardPeriodBounds(period), [period]);

  const periodReviewsByGuide = useMemo(() => {
    const scoped = filterReviewsByPeriod(allReviewsSinceStart, bounds);
    const out = new Map<string, GuideReviewRow[]>();
    scoped.forEach((r) => {
      const arr = out.get(r.guide_id) || [];
      arr.push(r);
      out.set(r.guide_id, arr);
    });
    return out;
  }, [allReviewsSinceStart, bounds]);

  const periodBookingCounts = useMemo(
    () => computeCheckedInBookingCountsForPeriod(sessionBookings, checkins, bounds, sessionGuides),
    [sessionBookings, checkins, bounds, sessionGuides]
  );
  const periodTourCounts = useMemo(
    () => computeToursPerGuide(sessionGuides, sessions, bounds),
    [sessionGuides, sessions, bounds]
  );
  const periodArrivalsByGuide = useMemo(() => {
    const scoped = filterArrivalsByPeriod(arrivals, bounds);
    const out = new Map<string, ArrivalForPeriod[]>();
    scoped.forEach((a) => {
      const arr = out.get(a.guide_id) || [];
      arr.push(a);
      out.set(a.guide_id, arr);
    });
    return out;
  }, [arrivals, bounds]);

  const bookingsCount = periodBookingCounts.get(guideId || '') || 0;
  const toursCount = periodTourCounts.get(guideId || '') || 0;
  const myPeriodReviews = periodReviewsByGuide.get(guideId || '') || [];
  const myPeriodArrivals = periodArrivalsByGuide.get(guideId || '') || [];
  const unlocked = bookingsCount >= GUIDE_SCORE_MIN_BOOKINGS;

  const score = useMemo(
    () => unlocked ? computeMetricValue(metric, myPeriodReviews, bookingsCount, toursCount, myPeriodArrivals) : null,
    [unlocked, metric, myPeriodReviews, bookingsCount, toursCount, myPeriodArrivals]
  );
  const punctuality = useMemo(() => computePunctualityStats(myPeriodArrivals), [myPeriodArrivals]);
  const reviewCount = useMemo(
    () => myPeriodReviews.filter(reviewCountsTowardScore).length,
    [myPeriodReviews]
  );

  const leaderboard = useMemo(() => {
    if (!unlocked) return [];
    return computeGuideLeaderboardByMetric(allGuideIds, metric, periodReviewsByGuide, periodBookingCounts, periodTourCounts, periodArrivalsByGuide);
  }, [unlocked, metric, allGuideIds, periodReviewsByGuide, periodBookingCounts, periodTourCounts, periodArrivalsByGuide]);

  const topScore = leaderboard[0]?.value ?? null;
  const myRankEntry = guideId ? leaderboard.find((e) => e.guide_id === guideId) : undefined;
  const band = metric === 'perBooking' ? getScoreBand(score) : null;

  return {
    loading,
    unlocked,
    bookingsCount,
    toursCount,
    reviewCount,
    metric,
    score,
    band,
    onTimeCount: punctuality.onTimeCount,
    onTimePct: punctuality.onTimePct,
    countedArrivals: punctuality.countedArrivals,
    topScore,
    rank: myRankEntry?.rank ?? null,
    totalRanked: leaderboard.length,
    myReviews,
    reload: () => setReloadKey((k) => k + 1),
  };
}
