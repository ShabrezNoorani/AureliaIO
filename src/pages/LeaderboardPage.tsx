import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { localDateStr } from '@/lib/utils';
import {
  computeDoneBookingRecords, countDoneBookingsByGuideAndMonth, groupReviewsByMonth,
  computeGuideLeaderboard, getScoreBand, GUIDE_SCORE_MIN_TOURS, ADMIN_SCORE_BAND_LABELS,
  ADMIN_DEFAULT_FILTER_START,
  type GuideReviewRow, type CheckinForGuiding, type SessionBookingForGuiding, type SessionDateForGuiding,
} from '@/lib/guidePerformance';
import ScoreInfoTooltip from '@/components/guide/ScoreInfoTooltip';

/**
 * Admin-only. Previously a section embedded in GuideDashboard.tsx — moved to its own tab/nav item
 * so the period/month filter has room to work properly and isn't competing with the Guide
 * Dashboard's own (unrelated) date/status filters for the same screen space. Owns its own fetch
 * (guides/reviews/checkins/session_bookings/tour_sessions) rather than sharing GuideDashboard's,
 * since the two pages are no longer rendered together.
 */
export default function LeaderboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [guides, setGuides] = useState<{ id: string; name: string; guide_number: string | null }[]>([]);
  const [reviews, setReviews] = useState<GuideReviewRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinForGuiding[]>([]);
  const [sessionBookings, setSessionBookings] = useState<SessionBookingForGuiding[]>([]);
  const [sessions, setSessions] = useState<SessionDateForGuiding[]>([]);

  // 'overall' = since Oct 1, 2026 (the headline window); any other value is a YYYY-MM month.
  const [period, setPeriod] = useState<string>('overall');

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [guidesRes, reviewsRes, checkinsRes, sbRes, sessRes] = await Promise.all([
      supabase.from('guides').select('id, name, guide_number').eq('user_id', user.id).order('name'),
      supabase.from('guide_reviews').select('*').eq('user_id', user.id).gte('review_date', ADMIN_DEFAULT_FILTER_START),
      supabase.from('checkins').select('booking_ref, status').eq('user_id', user.id)
        .eq('status', 'checked_in').gte('travel_date', ADMIN_DEFAULT_FILTER_START),
      supabase.from('session_bookings').select('booking_ref, allotted_guide_id, session_id').eq('user_id', user.id),
      supabase.from('tour_sessions').select('id, tour_date').eq('user_id', user.id),
    ]);
    setGuides(guidesRes.data || []);
    setReviews(reviewsRes.data || []);
    setCheckins(checkinsRes.data || []);
    setSessionBookings(sbRes.data || []);
    setSessions(sessRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const todayStr = localDateStr();
  const doneBookingRecords = useMemo(
    () => computeDoneBookingRecords(sessionBookings, sessions, checkins, ADMIN_DEFAULT_FILTER_START, todayStr),
    [sessionBookings, sessions, checkins, todayStr]
  );
  const doneCountsByGuideAndMonth = useMemo(() => countDoneBookingsByGuideAndMonth(doneBookingRecords), [doneBookingRecords]);
  const reviewsByMonth = useMemo(() => groupReviewsByMonth(reviews), [reviews]);

  // Every distinct month with either a done tour or a logged review, since Oct 1. Sorted newest-first.
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    doneBookingRecords.forEach(r => months.add(r.month));
    reviewsByMonth.forEach((_, month) => months.add(month));
    return Array.from(months).sort().reverse();
  }, [doneBookingRecords, reviewsByMonth]);

  // Recomputes EVERYTHING — reviews grouping AND done-tour counts — for whichever period is
  // selected. Selecting a specific month means the leaderboard (ranking, scores, counts, verdicts)
  // reflects ONLY that month's done tours, never the guide's larger overall total.
  const { reviewsByGuideForPeriod, doneCountsForPeriod } = useMemo(() => {
    if (period === 'overall') {
      const out = new Map<string, GuideReviewRow[]>();
      reviews.forEach(r => {
        const arr = out.get(r.guide_id) || [];
        arr.push(r);
        out.set(r.guide_id, arr);
      });
      const overallCounts = new Map<string, number>();
      doneBookingRecords.forEach(r => overallCounts.set(r.guide_id, (overallCounts.get(r.guide_id) || 0) + 1));
      return { reviewsByGuideForPeriod: out, doneCountsForPeriod: overallCounts };
    }
    const out = new Map<string, GuideReviewRow[]>();
    (reviewsByMonth.get(period) || []).forEach(r => {
      const arr = out.get(r.guide_id) || [];
      arr.push(r);
      out.set(r.guide_id, arr);
    });
    const monthCounts = new Map<string, number>();
    doneCountsByGuideAndMonth.forEach((byMonth, guideId) => {
      const count = byMonth.get(period);
      if (count) monthCounts.set(guideId, count);
    });
    return { reviewsByGuideForPeriod: out, doneCountsForPeriod: monthCounts };
  }, [period, reviews, doneBookingRecords, reviewsByMonth, doneCountsByGuideAndMonth]);

  const leaderboard = useMemo(
    () => computeGuideLeaderboard(guides.map(g => g.id), reviewsByGuideForPeriod, doneCountsForPeriod),
    [guides, reviewsByGuideForPeriod, doneCountsForPeriod]
  );
  const nameById = useMemo(() => new Map(guides.map(g => [g.id, g.name])), [guides]);
  const guideNumberById = useMemo(() => new Map(guides.map(g => [g.id, g.guide_number])), [guides]);

  const periodLabel = period === 'overall'
    ? 'Overall · Since Oct 1, 2026'
    : new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div style={{ padding: '32px' }} className="animate-fade-in">
      <div className="p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-foreground flex items-center gap-2">
              Leaderboard <ScoreInfoTooltip />
            </h1>
            <p className="text-muted-foreground text-sm mt-1.5">Ranked by review score. Owner-only.</p>
          </div>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="aurelia-input text-xs py-2 appearance-none bg-muted"
          >
            <option value="overall">Overall · Since Oct 1, 2026</option>
            {monthOptions.map(m => (
              <option key={m} value={m}>
                {new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-muted-foreground">
          Showing <span className="font-bold text-foreground">{periodLabel}</span>. Guides need {GUIDE_SCORE_MIN_TOURS}+ done tours
          within this period to be ranked — the threshold and every number below recompute entirely for whichever period is selected.
        </p>

        {loading ? (
          <div className="flex justify-center p-20">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="aurelia-card border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">No guide has {GUIDE_SCORE_MIN_TOURS}+ done tours in this period yet.</p>
          </div>
        ) : (
          <div className="aurelia-card border border-border divide-y divide-border overflow-hidden">
            {leaderboard.map(entry => {
              const band = getScoreBand(entry.score);
              return (
                <div key={entry.guide_id} className="flex items-center gap-4 px-5 py-4 flex-wrap">
                  <div className="w-10 text-center font-mono font-bold text-lg text-muted-foreground shrink-0">#{entry.rank}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{nameById.get(entry.guide_id) || 'Guide'}</div>
                    {guideNumberById.get(entry.guide_id) && (
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{guideNumberById.get(entry.guide_id)}</div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">{entry.reviewCount} review{entry.reviewCount !== 1 ? 's' : ''} / {entry.doneTours} done</div>
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
                  <div className={`w-20 text-right font-bold text-lg shrink-0 ${entry.score >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {entry.score >= 0 ? '+' : ''}{entry.score.toFixed(2)}
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
