import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  computeGuideLeaderboardByMetric, computeCheckedInBookingCountsForPeriod, computeToursPerGuide,
  filterReviewsByPeriod, filterArrivalsByPeriod, getScoreBand, getLeaderboardPeriodBounds,
  getLeaderboardPeriodLabel, GUIDE_SCORE_MIN_BOOKINGS, ADMIN_SCORE_BAND_LABELS,
  ADMIN_DEFAULT_FILTER_START, DEFAULT_LEADERBOARD_PERIOD, isApprovedReview,
  type GuideReviewRow, type CheckinForGuiding, type SessionBookingForGuiding,
  type SessionGuideForTourCount, type SessionDateForTourCount, type ArrivalForPeriod,
  type LeaderboardMetric, type LeaderboardPeriod,
} from '@/lib/guidePerformance';
import ScoreInfoTooltip from '@/components/guide/ScoreInfoTooltip';
import LeaderboardControls from '@/components/guide/LeaderboardControls';

/** perBooking/perTour are points-per-unit (roughly -1..+1) — shown with a sign, 2 decimals.
    punctuality/combined are already 0-100 — shown as a plain rounded percentage. Same formatting
    as GuideOwnScoreCard.tsx's own copy, kept in sync by convention (small enough that extracting
    a shared helper would be more indirection than the one duplicated function is worth). */
function formatMetricValue(metric: LeaderboardMetric, value: number | null): string {
  if (value == null) return '—';
  if (metric === 'punctuality' || metric === 'combined') return `${Math.round(value)}%`;
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/**
 * Admin-only. One ranked list at a time, by whichever metric is selected, for whichever time
 * period is selected — not four columns at once. Owns its own fetch (guides/reviews/checkins/
 * session_bookings/session_guides/tour_sessions/guide_arrivals) rather than sharing
 * GuideDashboard's, since the two pages are no longer rendered together.
 */
export default function LeaderboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [guides, setGuides] = useState<{ id: string; name: string; guide_number: string | null }[]>([]);
  const [reviews, setReviews] = useState<GuideReviewRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinForGuiding[]>([]);
  const [sessionBookings, setSessionBookings] = useState<SessionBookingForGuiding[]>([]);
  const [sessionGuides, setSessionGuides] = useState<SessionGuideForTourCount[]>([]);
  const [sessions, setSessions] = useState<SessionDateForTourCount[]>([]);
  const [arrivals, setArrivals] = useState<ArrivalForPeriod[]>([]);

  const [metric, setMetric] = useState<LeaderboardMetric>('perBooking');
  const [period, setPeriod] = useState<LeaderboardPeriod>(DEFAULT_LEADERBOARD_PERIOD);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [guidesRes, reviewsRes, checkinsRes, sbRes, sessionGuidesRes, sessionsRes, arrivalsRes] = await Promise.all([
      supabase.from('guides').select('id, name, guide_number').eq('user_id', user.id).order('name'),
      supabase.from('guide_reviews').select('*').eq('user_id', user.id).gte('review_date', ADMIN_DEFAULT_FILTER_START),
      // travel_date is the checkin's OWN date — computeCheckedInBookingCountsForPeriod counts off
      // this column directly, never a joined session's tour_date (see its own doc comment for why).
      supabase.from('checkins').select('booking_ref, status, travel_date').eq('user_id', user.id)
        .eq('status', 'checked_in').gte('travel_date', ADMIN_DEFAULT_FILTER_START),
      supabase.from('session_bookings').select('booking_ref, allotted_guide_id, session_id').eq('user_id', user.id),
      supabase.from('session_guides').select('guide_id, session_id, status').eq('user_id', user.id),
      supabase.from('tour_sessions').select('id, tour_date').eq('user_id', user.id).gte('tour_date', ADMIN_DEFAULT_FILTER_START),
      supabase.from('guide_arrivals').select('guide_id, arrived_at, minutes_late').eq('user_id', user.id).gte('arrived_at', ADMIN_DEFAULT_FILTER_START),
    ]);
    setGuides(guidesRes.data || []);
    // Pending guide-submitted reviews never reach the leaderboard until the owner approves them.
    setReviews((reviewsRes.data || []).filter(isApprovedReview));
    setCheckins(checkinsRes.data || []);
    setSessionBookings(sbRes.data || []);
    setSessionGuides(sessionGuidesRes.data || []);
    setSessions(sessionsRes.data || []);
    setArrivals(arrivalsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const bounds = useMemo(() => getLeaderboardPeriodBounds(period), [period]);

  const reviewsByGuideForPeriod = useMemo(() => {
    const scoped = filterReviewsByPeriod(reviews, bounds);
    const out = new Map<string, GuideReviewRow[]>();
    scoped.forEach((r) => {
      const arr = out.get(r.guide_id) || [];
      arr.push(r);
      out.set(r.guide_id, arr);
    });
    return out;
  }, [reviews, bounds]);

  const bookingCountsForPeriod = useMemo(
    () => computeCheckedInBookingCountsForPeriod(sessionBookings, checkins, bounds, sessionGuides),
    [sessionBookings, checkins, bounds, sessionGuides]
  );
  const tourCountsForPeriod = useMemo(
    () => computeToursPerGuide(sessionGuides, sessions, bounds),
    [sessionGuides, sessions, bounds]
  );
  const arrivalsByGuideForPeriod = useMemo(() => {
    const scoped = filterArrivalsByPeriod(arrivals, bounds);
    const out = new Map<string, ArrivalForPeriod[]>();
    scoped.forEach((a) => {
      const arr = out.get(a.guide_id) || [];
      arr.push(a);
      out.set(a.guide_id, arr);
    });
    return out;
  }, [arrivals, bounds]);

  const leaderboard = useMemo(
    () => computeGuideLeaderboardByMetric(
      guides.map((g) => g.id), metric, reviewsByGuideForPeriod, bookingCountsForPeriod, tourCountsForPeriod, arrivalsByGuideForPeriod
    ),
    [guides, metric, reviewsByGuideForPeriod, bookingCountsForPeriod, tourCountsForPeriod, arrivalsByGuideForPeriod]
  );
  const nameById = useMemo(() => new Map(guides.map((g) => [g.id, g.name])), [guides]);
  const guideNumberById = useMemo(() => new Map(guides.map((g) => [g.id, g.guide_number])), [guides]);

  const periodLabel = getLeaderboardPeriodLabel(period);
  const metricUnitLabel = metric === 'perTour' ? 'tours' : 'bookings';

  return (
    <div style={{ padding: '32px' }} className="animate-fade-in">
      <div className="p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="border-b border-border pb-6 space-y-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-foreground flex items-center gap-2">
              Leaderboard <ScoreInfoTooltip />
            </h1>
            <p className="text-muted-foreground text-sm mt-1.5">Ranked by the selected metric. Owner-only.</p>
          </div>
          <LeaderboardControls metric={metric} onMetricChange={setMetric} period={period} onPeriodChange={setPeriod} />
        </div>

        <p className="text-xs text-muted-foreground">
          Showing <span className="font-bold text-foreground">{periodLabel}</span>. Guides need {GUIDE_SCORE_MIN_BOOKINGS}+ bookings
          within this period to be ranked, on every metric — recomputes entirely for whichever metric/period is selected.
        </p>

        {metric === 'combined' && (
          <p className="text-xs text-muted-foreground italic">
            Punctuality is still building — the combined score firms up as more verified arrivals are recorded.
          </p>
        )}

        {loading ? (
          <div className="flex justify-center p-20">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="aurelia-card border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">No guide has {GUIDE_SCORE_MIN_BOOKINGS}+ bookings in this period yet.</p>
          </div>
        ) : (
          <div className="aurelia-card border border-border divide-y divide-border overflow-hidden">
            {leaderboard.map((entry) => {
              // getScoreBand's thresholds are calibrated for the per-booking score's own range —
              // only meaningful (and only shown) for that one metric.
              const band = metric === 'perBooking' ? getScoreBand(entry.value) : null;
              const unitCount = metric === 'perTour' ? entry.toursCount : entry.bookingsCount;
              return (
                <div key={entry.guide_id} className="flex items-center gap-4 px-5 py-4 flex-wrap">
                  <div className="w-10 text-center font-mono font-bold text-lg text-muted-foreground shrink-0">#{entry.rank}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{nameById.get(entry.guide_id) || 'Guide'}</div>
                    {guideNumberById.get(entry.guide_id) && (
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{guideNumberById.get(entry.guide_id)}</div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {metric === 'punctuality'
                      ? `${entry.onTimeCount}/${entry.countedArrivals} on-time`
                      : `${entry.reviewCount} review${entry.reviewCount !== 1 ? 's' : ''} / ${unitCount} ${metricUnitLabel}`}
                  </div>
                  {band && (
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                      band === 'excellent' ? 'bg-green-600/15 text-green-700'
                      : band === 'good' ? 'bg-blue-600/15 text-blue-700'
                      : band === 'needs_improvement' ? 'bg-amber-600/15 text-amber-700'
                      : 'bg-red-600/15 text-red-700'
                    }`}>
                      {ADMIN_SCORE_BAND_LABELS[band]}
                    </span>
                  )}
                  <div className={`w-20 text-right font-bold text-lg shrink-0 ${
                    metric === 'punctuality' || metric === 'combined' ? 'text-foreground' : (entry.value >= 0 ? 'text-green-700' : 'text-red-600')
                  }`}>
                    {formatMetricValue(metric, entry.value)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
