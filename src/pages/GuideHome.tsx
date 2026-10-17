import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Compass, Users, MapPin } from 'lucide-react';
import { localDateStr } from '@/lib/utils';
import {
  computeAssignmentStats,
  groupMonthlyEarnings, sessionGuidesToAssignmentRows, buildUnifiedMonthlyRows,
  DEFAULT_LEADERBOARD_PERIOD,
  type GuideAssignmentRow, type GuideMonthlyRow,
  type SessionGuideForEarnings, type SessionForEarnings, type UnifiedMonthlyRow,
  type LeaderboardMetric, type LeaderboardPeriod,
} from '@/lib/guidePerformance';
import { fetchCompanyGuides, transferTourToGuide, type CompanyGuide } from '@/lib/guideTransfer';
import { fetchMeetingPoints, type MeetingPointRow } from '@/lib/meetingPoints';
import GuideStatCards from '@/components/guide/GuideStatCards';
import TourHistoryList from '@/components/guide/TourHistoryList';
import MonthlyInvoiceList from '@/components/guide/MonthlyInvoiceList';
import GuideOwnScoreCard from '@/components/guide/GuideOwnScoreCard';
import ScoreInfoTooltip from '@/components/guide/ScoreInfoTooltip';
import TransferTourModal from '@/components/guide/TransferTourModal';
import { useGuideOwnScore } from '@/hooks/use-guide-own-score';

// recharts (pulled in by GuideEarningsChart) is a large charting library shared with the owner's
// GuideDashboard — lazy-loaded here so it never blocks this guide's first paint; the chart pops
// in a beat later instead of gating the rest of the dashboard on its own download.
const GuideEarningsChart = lazy(() => import('@/components/guide/GuideEarningsChart'));

interface SessionGuideRow {
  session_id: string;
  guide_id: string;
  status: string;
  offered_at: string | null;
  responded_at: string | null;
  reassigned_from: string | null;
}

interface TourSession {
  id: string;
  label: string | null;
  start_time: string | null;
  tour_date: string;
  meeting_point_id: string | null;
}

interface SessionBookingRow {
  session_id: string;
  booking_ref: string;
}

interface Booking {
  booking_ref: string;
  pax_adult: number | null;
  pax_youth: number | null;
  pax_child: number | null;
  pax_infant: number | null;
}

const paxTotal = (b: Booking) =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

export default function GuideHome() {
  const { guideId, guideName, guideUserId, retryRoleResolution } = useAuth();
  const navigate = useNavigate();

  // Leads the dashboard — this guide's own review score, verdict and anonymized rank/top-score.
  // Shared with GuideReviews.tsx via useGuideOwnScore, so the two can never disagree. Metric/
  // period state lives HERE (not inside the shared hook/card) so this page's toggle is
  // independent of GuideReviews.tsx's own.
  const [scoreMetric, setScoreMetric] = useState<LeaderboardMetric>('perBooking');
  const [scorePeriod, setScorePeriod] = useState<LeaderboardPeriod>(DEFAULT_LEADERBOARD_PERIOD);
  const ownScore = useGuideOwnScore(guideId, guideUserId, scoreMetric, scorePeriod);

  // Self-heals the "Couldn't confirm your account" fail-closed state (see roleResolution.ts) —
  // retries role resolution every few seconds without a full reload, so a connection that was
  // merely slow at login time recovers on its own instead of requiring the guide to act. Stops
  // the instant guideId actually resolves (the effect itself still runs every render per the
  // Rules of Hooks; the early-exit is inside it).
  //
  // 7s, not the original 4s — retryRoleResolution's own single attempt can take up to 6s
  // (RESOLVE_AGAIN_RETRY_POLICY), and retryRoleResolution already no-ops if a previous call is
  // still in flight (see AuthContext.tsx's retryInFlightRef) — widening this is what keeps a
  // normal-case tick from firing uselessly mid-attempt and finding nothing to do, rather than
  // being what prevents overlap (that guard lives in AuthContext, protecting every caller,
  // including the "Try again now" button below, not just this interval).
  useEffect(() => {
    if (guideId && guideUserId) return;
    const interval = setInterval(() => { retryRoleResolution(); }, 7000);
    return () => clearInterval(interval);
  }, [guideId, guideUserId, retryRoleResolution]);

  const [sessionGuides, setSessionGuides] = useState<SessionGuideRow[]>([]);
  const [sessions, setSessions] = useState<TourSession[]>([]);
  const [sessionBookings, setSessionBookings] = useState<SessionBookingRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [otherGuides, setOtherGuides] = useState<CompanyGuide[]>([]);
  const [meetingPoints, setMeetingPoints] = useState<MeetingPointRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [reassignSessionId, setReassignSessionId] = useState<string | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState('');
  const [reassigning, setReassigning] = useState(false);

  // Guards every setState below against firing after this page has unmounted — relevant once a
  // realtime-triggered silent reload can be in flight alongside the initial mount load.
  const mountedRef = useRef(true);

  // "How am I doing" performance data — a separate fetch/effect from the offers/sessions data
  // above, scoped to this guide's own rows only (RLS: guide_id IN (SELECT id FROM guides WHERE
  // auth_user_id = auth.uid())). Kept independent so a hiccup in either fetch never affects the
  // other.
  const [assignments, setAssignments] = useState<GuideAssignmentRow[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<GuideMonthlyRow[]>([]);
  // NEW per-session pay (session_guides.base_pay/bonus) — this guide's own rows only, ALL dates
  // (unlike the "My Tours" sessionGuides/sessions state above, which is future/today-scoped and
  // carries no pay fields). Converted to GuideAssignmentRow shape below and folded into every
  // stats/chart/list alongside the imported guide_assignments history — see
  // lib/guidePerformance.ts's "SESSION-BASED PAY UNIFICATION" section.
  const [perfSessionGuides, setPerfSessionGuides] = useState<SessionGuideForEarnings[]>([]);
  const [perfSessions, setPerfSessions] = useState<SessionForEarnings[]>([]);
  const [perfLoading, setPerfLoading] = useState(true);

  const today = localDateStr();
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // `silent` skips the setLoading toggle — used by the realtime effect below so an incoming
  // session_guides change (an assignment gained or lost) quietly re-derives this guide's session
  // set instead of flashing the full-page spinner. The initial mount load and the manual "pull to
  // refresh" equivalent both want the spinner, so they call this with silent left false.
  const loadData = async (silent = false) => {
    // Defensive backstop: if role has resolved to 'guide' with no actual guideId (should only
    // happen on the rare fail-closed-after-timeout path — see roleResolution.ts), never leave
    // `loading` stuck true forever. The render below shows a gentle "couldn't confirm your
    // account" state instead of an endless spinner in that case.
    if (!guideId || !guideUserId) { if (!silent) setLoading(false); return; }
    if (!silent) setLoading(true);

    const { data: sgData } = await supabase
      .from('session_guides')
      .select('session_id, guide_id, status, offered_at, responded_at, reassigned_from')
      .eq('user_id', guideUserId)
      .eq('guide_id', guideId);
    if (!mountedRef.current) return;

    const mine = sgData || [];
    setSessionGuides(mine);

    const sessionIds = Array.from(new Set(mine.map(sg => sg.session_id)));
    if (sessionIds.length === 0) {
      setSessions([]);
      setSessionBookings([]);
      setBookings([]);
      setOtherGuides([]);
      if (!silent) setLoading(false);
      return;
    }

    const [sessRes, sbRes, otherGuidesData, meetingPointsData] = await Promise.all([
      supabase.from('tour_sessions').select('id, label, start_time, tour_date, meeting_point_id')
        .eq('user_id', guideUserId).in('id', sessionIds).gte('tour_date', today)
        .order('tour_date', { ascending: true }).order('start_time', { ascending: true }),
      supabase.from('session_bookings').select('session_id, booking_ref')
        .eq('user_id', guideUserId).in('session_id', sessionIds),
      fetchCompanyGuides(supabase, guideId),
      fetchMeetingPoints(supabase, guideUserId),
    ]);
    if (!mountedRef.current) return;

    setSessions(sessRes.data || []);
    const mySessionBookings = sbRes.data || [];
    setSessionBookings(mySessionBookings);
    setOtherGuides(otherGuidesData);
    setMeetingPoints(meetingPointsData);

    const refs = Array.from(new Set(mySessionBookings.map(sb => sb.booking_ref)));
    if (refs.length === 0) {
      setBookings([]);
      if (!silent) setLoading(false);
      return;
    }

    const { data: bData } = await supabase
      .from('bookings')
      .select('booking_ref, pax_adult, pax_youth, pax_child, pax_infant')
      .eq('user_id', guideUserId).in('booking_ref', refs);
    if (!mountedRef.current) return;

    setBookings(bData || []);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [guideId, guideUserId]);

  // Live: a session_guides change reflects here without a manual refresh — whether it's this
  // guide gaining/losing a tour (an owner assign/reassign, or either side of a guide-to-guide
  // transfer) or a teammate's assignment changing on a session this guide is also on. Filtered
  // broadly by the company's user_id (not this guide specifically) because RLS is what actually
  // restricts which rows this guide can see — same convention GuideCheckin.tsx's realtime uses.
  useEffect(() => {
    if (!guideUserId) return;

    const channel = supabase
      .channel(`guide-home-${guideUserId}-${guideId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_guides', filter: `user_id=eq.${guideUserId}` },
        () => { loadData(true); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [guideUserId, guideId]);

  useEffect(() => {
    const loadPerformance = async () => {
      if (!guideId || !guideUserId) { setPerfLoading(false); return; }
      setPerfLoading(true);
      const [aRes, mRes, sgRes] = await Promise.all([
        supabase.from('guide_assignments')
          .select('id, guide_id, travel_date, travel_time, tour_name, tour_type, language, calculated_pay, rate_override, bonus, total_pay, is_paid, paid_date, product_code, option_name, booking_ref, clients, notes, pax_count')
          .eq('guide_id', guideId),
        supabase.from('guide_monthly')
          .select('id, guide_id, guide_name, month, tours_completed, amount_owed, invoice_received, invoice_amount, tva, difference, payment_sent, payment_date')
          .eq('guide_id', guideId),
        // NEW per-session pay — this guide's own rows, ALL dates (past + future), unlike the "My
        // Tours" sessionGuides state above.
        supabase.from('session_guides').select('session_id, guide_id, status, base_pay, bonus').eq('guide_id', guideId),
      ]);
      setAssignments(aRes.data || []);
      setMonthlyRows(mRes.data || []);
      const mySessionGuides = sgRes.data || [];
      setPerfSessionGuides(mySessionGuides);
      const perfSessionIds = Array.from(new Set(mySessionGuides.map(sg => sg.session_id)));
      if (perfSessionIds.length > 0) {
        const { data: perfSessData } = await supabase.from('tour_sessions')
          .select('id, tour_date, start_time, label')
          .eq('user_id', guideUserId).in('id', perfSessionIds);
        setPerfSessions(perfSessData || []);
      } else {
        setPerfSessions([]);
      }
      setPerfLoading(false);
    };
    loadPerformance();
  }, [guideId, guideUserId]);

  // SESSION-BASED PAY UNIFICATION — same pattern as GuideDashboard.tsx's owner view: convert
  // session_guides rows into GuideAssignmentRow shape and fold them into ONE combined array that
  // every stats/chart/list below consumes, so this guide's own dashboard shows both imported
  // history and session-based pay in one timeline without double-counting.
  const paidMonthsByGuide = useMemo(
    () => new Set(monthlyRows.filter(m => m.payment_sent && m.guide_id).map(m => `${m.guide_id}:${m.month}`)),
    [monthlyRows]
  );
  const sessionAssignmentRows = useMemo(
    () => sessionGuidesToAssignmentRows(perfSessionGuides, perfSessions, paidMonthsByGuide),
    [perfSessionGuides, perfSessions, paidMonthsByGuide]
  );
  const allAssignments = useMemo(
    () => [...assignments, ...sessionAssignmentRows],
    [assignments, sessionAssignmentRows]
  );
  const unifiedMonthlyRows: UnifiedMonthlyRow[] = useMemo(
    () => guideId ? buildUnifiedMonthlyRows(guideId, guideName || '', monthlyRows, sessionAssignmentRows) : [],
    [guideId, guideName, monthlyRows, sessionAssignmentRows]
  );

  const assignmentStats = useMemo(() => computeAssignmentStats(allAssignments, today), [allAssignments, today]);
  const monthlyEarnings = useMemo(() => groupMonthlyEarnings(allAssignments), [allAssignments]);

  const sessionById = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions]);
  const meetingPointById = useMemo(() => new Map(meetingPoints.map(mp => [mp.id, mp])), [meetingPoints]);

  const sessionPax = useMemo(() => {
    const bookingByRef = new Map(bookings.map(b => [b.booking_ref, b]));
    const m = new Map<string, number>();
    sessionBookings.forEach(sb => {
      const b = bookingByRef.get(sb.booking_ref);
      if (!b) return;
      m.set(sb.session_id, (m.get(sb.session_id) || 0) + paxTotal(b));
    });
    return m;
  }, [sessionBookings, bookings]);

  const sortByWhen = (a: { session: TourSession }, b: { session: TourSession }) =>
    `${a.session.tour_date}${a.session.start_time || ''}`.localeCompare(`${b.session.tour_date}${b.session.start_time || ''}`);

  const myTours = useMemo(() => sessionGuides
    .filter(sg => sg.status === 'accepted')
    .map(sg => ({ sg, session: sessionById.get(sg.session_id) }))
    .filter((x): x is { sg: SessionGuideRow; session: TourSession } => !!x.session)
    .sort(sortByWhen), [sessionGuides, sessionById]);

  const todaysTours = myTours.filter(x => x.session.tour_date === today);
  const totalTours = todaysTours.length;
  const totalPax = todaysTours.reduce((sum, x) => sum + (sessionPax.get(x.sg.session_id) || 0), 0);

  const openReassign = (sessionId: string) => {
    setReassignSessionId(sessionId);
    setReassignTargetId('');
  };

  const handleReassign = async () => {
    if (!reassignSessionId || !reassignTargetId) return;
    setReassigning(true);
    try {
      const { error } = await transferTourToGuide(supabase, reassignSessionId, reassignTargetId);
      if (error) throw new Error(error);
      setReassignSessionId(null);
      // The realtime listener above will also pick this up, but awaiting an explicit reload here
      // means the tour is gone from "My Tours" the instant the confirm button resolves, not
      // whenever the Postgres change notification happens to arrive.
      await loadData();
    } catch (e) {
      console.error('Failed to reassign slot:', e);
      alert('Failed to reassign. Please try again.');
    } finally {
      setReassigning(false);
    }
  };

  // Defensive backstop — role resolved to 'guide' (ProtectedRoute already confirmed that), but
  // guideId never came through. Should only happen on the rare fail-closed-after-timeout path
  // (see roleResolution.ts) — show a gentle, actionable state instead of hanging on a spinner
  // forever (loadData/loadPerformance above both now clear their own loading flags in this case
  // too, so nothing else on this page is left spinning either).
  if (!guideId || !guideUserId) {
    return (
      <div className="p-4 md:p-8 pb-32 max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center gap-3 animate-fade-in">
        <div className="w-10 h-10 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        <h2 className="text-xl font-bold">Couldn't confirm your account</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          This usually clears up on its own in a few seconds — retrying automatically. Pull down to refresh if it takes longer.
        </p>
        <button
          onClick={() => retryRoleResolution()}
          className="mt-2 text-xs font-bold uppercase tracking-widest text-gold border border-gold/30 rounded-xl px-4 py-2 hover:bg-gold/10 transition-colors"
        >
          Try again now
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-32 max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* YOUR SCORE — leads the dashboard, above everything else (requirement: first thing a
          guide sees). Same gated/encouraging card GuideReviews.tsx shows, just prominent here. */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-bold text-gold uppercase tracking-widest">Your Score</h2>
            <ScoreInfoTooltip />
          </div>
          <button
            onClick={() => navigate('/guide/reviews')}
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-gold border border-border hover:border-gold/30 rounded-lg px-2.5 py-1.5 shrink-0 transition-colors"
          >
            View Reviews
          </button>
        </div>
        <GuideOwnScoreCard
          data={ownScore}
          metric={scoreMetric}
          onMetricChange={setScoreMetric}
          period={scorePeriod}
          onPeriodChange={setScorePeriod}
          prominent
        />
      </section>

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Welcome back, {guideName || 'Guide'} 👋</h1>
        <div className="flex items-center gap-2 text-muted-foreground font-medium">
          <CalendarIcon size={16} className="text-gold" />
          <span>{todayStr}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="aurelia-card p-6 border-l-[3px] border-l-gold">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Compass size={14} />
                <p className="text-[10px] font-bold uppercase tracking-widest">Tours Today</p>
              </div>
              <p className="text-3xl font-extrabold">{totalTours}</p>
            </div>
            <div className="aurelia-card p-6 border-l-[3px] border-l-blue-500">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users size={14} />
                <p className="text-[10px] font-bold uppercase tracking-widest">Expected Pax</p>
              </div>
              <p className="text-3xl font-extrabold">{totalPax}</p>
            </div>
          </div>

          {myTours.length === 0 ? (
            <div className="aurelia-card p-12 text-center flex flex-col items-center">
              <CalendarIcon size={48} className="text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-bold mb-2">No tours assigned</h3>
              <p className="text-muted-foreground">Check back later or contact your coordinator.</p>
            </div>
          ) : (
            <section className="space-y-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">My Tours</h2>
              <div className="space-y-3">
                {myTours.map(({ sg, session }) => (
                  <div key={sg.session_id} className="aurelia-card p-4 border-l-[3px] border-l-green-500">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-base truncate">{session.label || 'Untitled Session'}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                          <span>{formatDate(session.tour_date)}</span>
                          <span>&middot;</span>
                          <span>{session.start_time || '—'}</span>
                          <span>&middot;</span>
                          <span className="text-gold font-bold">{sessionPax.get(sg.session_id) || 0} pax</span>
                        </div>
                        {session.meeting_point_id && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                            <MapPin size={12} className="shrink-0 text-gold" />
                            <span>Meeting point: <span className="font-bold text-foreground">{meetingPointById.get(session.meeting_point_id)?.name || 'Unknown'}</span></span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => openReassign(sg.session_id)}
                        className="text-[10px] font-bold uppercase text-muted-foreground hover:text-gold border border-border hover:border-gold/30 rounded-lg px-2.5 py-1.5 shrink-0 transition-colors"
                      >
                        Transfer to another guide
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ─── HOW AM I DOING ─── */}
      {perfLoading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Tours &amp; Pay</h2>
            <GuideStatCards stats={assignmentStats} />
            <Suspense fallback={<div className="h-64 rounded-2xl bg-muted animate-pulse" />}>
              <GuideEarningsChart data={monthlyEarnings} />
            </Suspense>
            <TourHistoryList assignments={allAssignments} todayStr={today} />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Invoices</h2>
            <MonthlyInvoiceList rows={unifiedMonthlyRows} />
          </section>
        </>
      )}

      {reassignSessionId && (
        <TransferTourModal
          sessionLabel={sessionById.get(reassignSessionId)?.label || 'This tour'}
          guides={otherGuides}
          targetId={reassignTargetId}
          onTargetChange={setReassignTargetId}
          onConfirm={handleReassign}
          onCancel={() => setReassignSessionId(null)}
          submitting={reassigning}
        />
      )}
    </div>
  );
}
