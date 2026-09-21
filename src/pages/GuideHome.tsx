import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Calendar as CalendarIcon, Compass, Users } from 'lucide-react';
import { localDateStr } from '@/lib/utils';
import {
  computeAssignmentStats, computeRatingStats, computePunctualityStats, computeGuideScore,
  groupMonthlyEarnings,
  type GuideAssignmentRow, type GuideMonthlyRow, type GuideRatingRow, type ArrivalPunctualityRow,
} from '@/lib/guidePerformance';
import { fetchCompanyGuides, transferTourToGuide, type CompanyGuide } from '@/lib/guideTransfer';
import GuideStatCards from '@/components/guide/GuideStatCards';
import GuideEarningsChart from '@/components/guide/GuideEarningsChart';
import TourHistoryList from '@/components/guide/TourHistoryList';
import MonthlyInvoiceList from '@/components/guide/MonthlyInvoiceList';
import GuideScoreCard from '@/components/guide/GuideScoreCard';
import TransferTourModal from '@/components/guide/TransferTourModal';

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
  const { guideId, guideName, guideUserId } = useAuth();

  const [sessionGuides, setSessionGuides] = useState<SessionGuideRow[]>([]);
  const [sessions, setSessions] = useState<TourSession[]>([]);
  const [sessionBookings, setSessionBookings] = useState<SessionBookingRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [otherGuides, setOtherGuides] = useState<CompanyGuide[]>([]);
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
  const [ratings, setRatings] = useState<GuideRatingRow[]>([]);
  // All-time, not scoped to any date range — the score reflects the guide's whole track record,
  // same as ratings/assignments above.
  const [arrivals, setArrivals] = useState<ArrivalPunctualityRow[]>([]);
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
    if (!guideId || !guideUserId) return;
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

    const [sessRes, sbRes, otherGuidesData] = await Promise.all([
      supabase.from('tour_sessions').select('id, label, start_time, tour_date')
        .eq('user_id', guideUserId).in('id', sessionIds).gte('tour_date', today)
        .order('tour_date', { ascending: true }).order('start_time', { ascending: true }),
      supabase.from('session_bookings').select('session_id, booking_ref')
        .eq('user_id', guideUserId).in('session_id', sessionIds),
      fetchCompanyGuides(supabase, guideId),
    ]);
    if (!mountedRef.current) return;

    setSessions(sessRes.data || []);
    const mySessionBookings = sbRes.data || [];
    setSessionBookings(mySessionBookings);
    setOtherGuides(otherGuidesData);

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
      if (!guideId) return;
      setPerfLoading(true);
      const [aRes, mRes, rRes, arrRes] = await Promise.all([
        supabase.from('guide_assignments')
          .select('id, guide_id, travel_date, travel_time, tour_name, tour_type, language, calculated_pay, rate_override, bonus, total_pay, is_paid, paid_date, product_code, option_name, booking_ref, clients, notes, pax_count')
          .eq('guide_id', guideId),
        supabase.from('guide_monthly')
          .select('id, guide_id, guide_name, month, tours_completed, amount_owed, invoice_received, invoice_amount, tva, difference, payment_sent, payment_date')
          .eq('guide_id', guideId),
        supabase.from('guide_ratings').select('*').eq('guide_id', guideId),
        supabase.from('guide_arrivals').select('minutes_late').eq('guide_id', guideId),
      ]);
      setAssignments(aRes.data || []);
      setMonthlyRows(mRes.data || []);
      setRatings(rRes.data || []);
      setArrivals(arrRes.data || []);
      setPerfLoading(false);
    };
    loadPerformance();
  }, [guideId]);

  const assignmentStats = useMemo(() => computeAssignmentStats(assignments, today), [assignments, today]);
  const monthlyEarnings = useMemo(() => groupMonthlyEarnings(assignments), [assignments]);
  const ratingStats = useMemo(
    () => computeRatingStats(ratings, assignmentStats.toursDone),
    [ratings, assignmentStats.toursDone]
  );
  const punctualityStats = useMemo(() => computePunctualityStats(arrivals), [arrivals]);
  const guideScore = useMemo(
    () => computeGuideScore(ratingStats, punctualityStats, assignmentStats.toursDone),
    [ratingStats, punctualityStats, assignmentStats.toursDone]
  );

  const sessionById = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions]);

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

  return (
    <div className="p-4 md:p-8 pb-32 max-w-3xl mx-auto space-y-8 animate-fade-in">
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
            <GuideEarningsChart data={monthlyEarnings} />
            <TourHistoryList assignments={assignments} todayStr={today} />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Invoices</h2>
            <MonthlyInvoiceList rows={monthlyRows} />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Performance</h2>
            <GuideScoreCard score={guideScore} />
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
