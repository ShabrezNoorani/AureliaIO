import { useState, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Users, CheckCircle2, Calendar as CalendarIcon, UserCheck, Eye, EyeOff, Clock, Sparkles, Plane, ClipboardList, X, ShieldAlert, ShieldCheck } from 'lucide-react';
import { localDateStr, isCancelled, shortProductCode, checkinTime } from '@/lib/utils';
import { buildStaffingAlerts, type StaffingAlert } from '@/lib/staffingAlerts';

// Owner-only, big-screen operations board — a TV monitor left open in the office, never a
// personal workflow page. Read-only everywhere: no writes happen here, this only ever displays
// what TodayToursPage/Dispatch/Check-in already produced. Reachable exclusively through the
// existing `/app` owner ProtectedRoute (see App.tsx/AppLayout.tsx) — same as every other AppLayout
// view, so no extra role check is needed in this file.

interface Booking {
  id: string;
  booking_ref: string;
  customer_name: string;
  option_name: string | null;
  product_name: string | null;
  product_code: string | null;
  channel: string | null;
  status: string | null;
  travel_date: string | null;
  travel_time: string | null;
  gross_revenue: number | null;
  net_profit: number | null;
  /** Booking-level cost columns — used to recompute profit live (see moneyToday) rather than
      trusting the stored net_profit column, which predates per-session guide pay and would
      otherwise silently omit it. guide_cost specifically is only ever a FALLBACK for a booking
      not linked to any tour_session; a session-linked booking's cost comes from that session's
      session_guides pay instead (see sessionedBookingRefsToday), never both. */
  ticket_cost: number | null;
  extra_cost: number | null;
  gyg_cost: number | null;
  commission_amount: number | null;
  marketplace_fee: number | null;
  guide_cost: number | null;
  pax_adult: number | null;
  pax_youth: number | null;
  pax_child: number | null;
  pax_infant: number | null;
}

interface TourSession {
  id: string;
  tour_date: string;
  label: string | null;
  start_time: string | null;
}

interface SessionBookingRow {
  session_id: string;
  booking_ref: string;
  allotted_guide_id: string | null;
}

interface SessionGuideRow {
  session_id: string;
  guide_id: string;
  status: string;
  /** The real, current source of truth for guide cost (see moneyToday) — bookings.guide_cost is
      stale/unused now that pay is set per session. */
  base_pay: number | null;
  bonus: number | null;
}

interface Guide {
  id: string;
  name: string;
}

interface Checkin {
  booking_ref: string;
  status: string;
  checked_in_at: string;
  display_name_override: string | null;
}

// Only what the two "This Month" tiles below need — a slimmer row than the full Booking shape
// used everywhere else on this page, since these two queries can span far more rows (a whole
// calendar month) than the today/tomorrow/24h ones.
interface MonthBookingRow {
  gross_revenue: number | null;
  status: string | null;
}

// One row per (option, time) group within a day's General view — e.g. Dispatch's "natural
// groups" concept, but a read-only summary here rather than something to build a session from.
interface GeneralGroup {
  key: string;
  time: string;
  label: string;
  pax: number;
  count: number;
}

interface DaySessionCard {
  id: string;
  label: string;
  startTime: string | null;
  pax: number;
  /** Only set for TODAY's cards — Tomorrow's sessions have no check-ins yet to show progress on. */
  checkedIn?: number;
  pct?: number;
  guideNames: string[];
}

interface NewBookingNotice {
  id: string;
  customerName: string;
  revenue: number;
  option: string;
  pax: number;
  travelDate: string;
}

interface CheckinNotice {
  id: string;
  name: string;
  option: string;
  pax: number;
  guideName: string;
  time: string;
}

// "e.g. last ~8" per the spec — enough to read as a live stream without ever needing to scroll.
const STREAM_CAP = 8;

const paxTotal = (b: Booking) =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);

const optionLabel = (b: Pick<Booking, 'product_code' | 'option_name'>) =>
  `${shortProductCode(b.product_code) || 'Unknown'} — ${b.option_name || 'Standard'}`;

/** A day's General view: non-cancelled bookings grouped by (time, option) with pax totals, plus
    the cancelled ones kept as a separate flat list (struck-through in the UI, never merged into
    a group's pax total). Pure so it's trivial to reason about independently of I/O. */
function buildGeneralGroups(bookings: Booking[]): { upcoming: GeneralGroup[]; cancelled: Booking[] } {
  const upcomingMap = new Map<string, GeneralGroup>();
  const cancelled: Booking[] = [];
  bookings.forEach((b) => {
    if (isCancelled(b.status)) { cancelled.push(b); return; }
    const time = b.travel_time || 'No time';
    // shortProductCode() here too, not just in optionLabel() below — an old gsheet row's "P13"
    // and a newer Bokun row's "5591586P13" are the same tour and must land in one card, not two.
    const key = `${time}|${shortProductCode(b.product_code) || ''}|${b.option_name || ''}`;
    const pax = paxTotal(b);
    const existing = upcomingMap.get(key);
    if (existing) {
      existing.pax += pax;
      existing.count += 1;
    } else {
      upcomingMap.set(key, { key, time, label: optionLabel(b), pax, count: 1 });
    }
  });
  const upcoming = Array.from(upcomingMap.values()).sort((a, b) => a.time.localeCompare(b.time));
  return { upcoming, cancelled };
}

const fmtE = (v: number) => `€${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Formats a bare YYYY-MM-DD travel_date as e.g. "24 Sep" — parsed with an explicit T00:00:00 so
// it's read as LOCAL midnight, never `new Date(dateStr)`'s UTC parse (which can silently shift
// the displayed day depending on the viewer's timezone).
const fmtShortDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '—';
  return new Date(`${dateStr.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function LiveDashboardPage() {
  const { user } = useAuth();

  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const [tomorrowBookings, setTomorrowBookings] = useState<Booking[]>([]);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [sessions, setSessions] = useState<TourSession[]>([]);
  const [sessionBookings, setSessionBookings] = useState<SessionBookingRow[]>([]);
  const [sessionGuides, setSessionGuides] = useState<SessionGuideRow[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [monthTravelBookings, setMonthTravelBookings] = useState<MonthBookingRow[]>([]);
  const [monthBookedBookings, setMonthBookedBookings] = useState<MonthBookingRow[]>([]);

  // STAFFING ALERTS — a separate, wider (today..+5 days) window from the today/tomorrow-scoped
  // state above, kept minimal (only what's needed to compute capacity). Owner-only, admin-only —
  // this whole page already is (see the file-top note), so no extra role check is needed here.
  const [staffSessions, setStaffSessions] = useState<{
    id: string; tour_date: string; label: string | null; start_time: string | null;
    max_pax_per_guide: number | null; needs_guide: boolean;
  }[]>([]);
  const [staffSessionBookings, setStaffSessionBookings] = useState<{ session_id: string; booking_ref: string }[]>([]);
  const [staffSessionGuides, setStaffSessionGuides] = useState<{ session_id: string; guide_id: string; status: string }[]>([]);
  const [staffBookings, setStaffBookings] = useState<{
    booking_ref: string; pax_adult: number | null; pax_youth: number | null; pax_child: number | null;
    pax_infant: number | null; status: string | null; option_name: string | null; product_code: string | null;
  }[]>([]);

  const [loading, setLoading] = useState(true);
  const [showMoney, setShowMoney] = useState(false);
  const [now, setNow] = useState(new Date());
  // Reflects the realtime channel's own connection state in the UI, not just the console — a dead
  // subscription (missing publication entry, RLS issue, dropped socket) must never look identical
  // to a healthy, quiet board.
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'error'>('connecting');

  // Live notification streams — purely additive to the existing summary containers, purely
  // in-app (no browser push). Capped to the newest STREAM_CAP entries; older ones just drop off
  // the array (no exit animation — "dismissed cards disappear immediately" applies to natural
  // eviction too, matching the requested behavior). New entries ease in via animate-rise-in.
  const [newBookingNotices, setNewBookingNotices] = useState<NewBookingNotice[]>([]);
  const [checkinNotices, setCheckinNotices] = useState<CheckinNotice[]>([]);

  const mountedRef = useRef(true);

  const today = localDateStr();
  const tomorrow = localDateStr(new Date(Date.now() + 24 * 60 * 60 * 1000));
  // "Next 5 days" for Staffing Alerts — today through +5 calendar days, inclusive.
  const day5 = localDateStr(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  const tomorrowLabel = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

  // Current calendar month's bounds, computed from local Y/M/D (never `new Date(dateStr)` on a
  // bare string, which parses as UTC and can shift the date by a day) then formatted through the
  // same localDateStr() every other date on this page goes through — so "this month" always means
  // this OWNER'S local calendar month, not the server's.
  const nowForMonth = new Date();
  const monthStart = localDateStr(new Date(nowForMonth.getFullYear(), nowForMonth.getMonth(), 1));
  const monthEnd = localDateStr(new Date(nowForMonth.getFullYear(), nowForMonth.getMonth() + 1, 0));
  const monthLabel = nowForMonth.toLocaleDateString('en-US', { month: 'long' });

  const loadData = async () => {
    if (!user) return;
    const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [tRes, tomRes, recentRes, sessRes, guidesRes, checkinsRes, monthTravelRes, monthBookedRes] = await Promise.all([
      // Cancelled bookings are fetched too (not filtered out here) — the General view below needs
      // to show them, struck through. Every OPERATIONAL derivation from these two (pax counts,
      // session pax, checking-in feed, today's money) already guards with isCancelled() itself.
      supabase.from('bookings').select('*').eq('user_id', user.id).eq('travel_date', today),
      supabase.from('bookings').select('*').eq('user_id', user.id).eq('travel_date', tomorrow),
      supabase.from('bookings').select('*').eq('user_id', user.id).gte('created_at', dayAgoIso).not('status', 'eq', 'CANCELLED').order('created_at', { ascending: false }),
      supabase.from('tour_sessions').select('*').eq('user_id', user.id).in('tour_date', [today, tomorrow]).order('start_time', { ascending: true }),
      supabase.from('guides').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('checkins').select('*').eq('user_id', user.id).eq('travel_date', today),
      // THIS MONTH — EARNING: by travel_date, so it grows as this month's tours actually happen.
      supabase.from('bookings').select('gross_revenue, status').eq('user_id', user.id).gte('travel_date', monthStart).lte('travel_date', monthEnd),
      // THIS MONTH — BOOKINGS: by booking_date, so it counts demand landing this month regardless
      // of when the travel itself is (could be next year).
      supabase.from('bookings').select('gross_revenue, status').eq('user_id', user.id).gte('booking_date', monthStart).lte('booking_date', monthEnd),
    ]);
    if (!mountedRef.current) return;

    setTodayBookings(tRes.data || []);
    setTomorrowBookings(tomRes.data || []);
    setRecentBookings(recentRes.data || []);
    setGuides(guidesRes.data || []);
    setCheckins(checkinsRes.data || []);
    setMonthTravelBookings(monthTravelRes.data || []);
    setMonthBookedBookings(monthBookedRes.data || []);

    const sessionsData = sessRes.data || [];
    setSessions(sessionsData);
    const sessionIds = sessionsData.map((s) => s.id);

    if (sessionIds.length > 0) {
      const [sbRes, sgRes] = await Promise.all([
        supabase.from('session_bookings').select('session_id, booking_ref, allotted_guide_id').eq('user_id', user.id).in('session_id', sessionIds),
        supabase.from('session_guides').select('session_id, guide_id, status, base_pay, bonus').eq('user_id', user.id).in('session_id', sessionIds),
      ]);
      if (!mountedRef.current) return;
      setSessionBookings(sbRes.data || []);
      setSessionGuides(sgRes.data || []);
    } else {
      setSessionBookings([]);
      setSessionGuides([]);
    }

    // STAFFING ALERTS — sessions over the next 5 days (today..+5), separate/wider window from the
    // today/tomorrow state above. Refreshed by the SAME loadData() this whole page already calls
    // on every relevant realtime event (session_guides/session_bookings/bookings/tour_sessions —
    // see the subscription below), so this stays live with zero extra listeners.
    const { data: staffSessData } = await supabase.from('tour_sessions')
      .select('id, tour_date, label, start_time, max_pax_per_guide, needs_guide')
      .eq('user_id', user.id).gte('tour_date', today).lte('tour_date', day5)
      .order('tour_date', { ascending: true }).order('start_time', { ascending: true });
    if (!mountedRef.current) return;
    const staffSessData_ = staffSessData || [];
    setStaffSessions(staffSessData_);
    const staffSessionIds = staffSessData_.map((s) => s.id);

    if (staffSessionIds.length > 0) {
      const [staffSbRes, staffSgRes, staffBookRes] = await Promise.all([
        supabase.from('session_bookings').select('session_id, booking_ref').eq('user_id', user.id).in('session_id', staffSessionIds),
        supabase.from('session_guides').select('session_id, guide_id, status').eq('user_id', user.id).in('session_id', staffSessionIds),
        supabase.from('bookings').select('booking_ref, pax_adult, pax_youth, pax_child, pax_infant, status, option_name, product_code')
          .eq('user_id', user.id).gte('travel_date', today).lte('travel_date', day5),
      ]);
      if (!mountedRef.current) return;
      setStaffSessionBookings(staffSbRes.data || []);
      setStaffSessionGuides(staffSgRes.data || []);
      setStaffBookings(staffBookRes.data || []);
    } else {
      setStaffSessionBookings([]);
      setStaffSessionGuides([]);
      setStaffBookings([]);
    }

    setLoading(false);
  };

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  // Declared here (assigned below, once the memos they mirror exist) so the realtime effect
  // further down can reference them without a temporal-dead-zone issue.
  const guideByIdRef = useRef<Map<string, Guide>>(new Map());
  const todayBookingByRefRef = useRef<Map<string, Booking>>(new Map());
  const todaySessionBookingByRefRef = useRef<Map<string, SessionBookingRow>>(new Map());

  // Builds a "Just checked in" notice from a realtime checkins payload — reads the ref mirrors
  // above (not state directly) since this is called from the long-lived realtime subscription's
  // closure, which only re-subscribes on [user]. Resolves guide/option/pax via today's already-
  // loaded bookings; if the booking genuinely can't be found yet (a rare race against the initial
  // load), it's skipped rather than shown with blank fields.
  const pushCheckinNotice = (c: Checkin) => {
    if (c.status !== 'checked_in') return;
    const b = todayBookingByRefRef.current.get(c.booking_ref);
    if (!b || isCancelled(b.status)) return;
    const sb = todaySessionBookingByRefRef.current.get(c.booking_ref);
    const guide = sb?.allotted_guide_id ? guideByIdRef.current.get(sb.allotted_guide_id) : null;
    const name = (c.display_name_override && String(c.display_name_override).trim()) || b.customer_name;
    setCheckinNotices((prev) => [
      ...prev,
      {
        id: `${c.booking_ref}-${Date.now()}`,
        name,
        option: b.option_name || b.product_name || 'Tour',
        pax: paxTotal(b),
        guideName: guide?.name || 'Unassigned',
        time: c.checked_in_at,
      },
    ].slice(-STREAM_CAP));
  };

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => { mountedRef.current = false; };
  }, [user]);

  // No polling — every section here is driven off the same realtime tables TodayToursPage already
  // subscribes to, plus `bookings` (new bookings feed + live pax counts as Bokun/gsheet ingest
  // them). A single silent reload keeps every section consistent with every other — this page
  // never writes, so there's no optimistic state to protect from being clobbered by a refetch.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`live-dashboard-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins', filter: `user_id=eq.${user.id}` },
        () => { loadDataRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_bookings', filter: `user_id=eq.${user.id}` },
        () => { loadDataRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_guides', filter: `user_id=eq.${user.id}` },
        () => { loadDataRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_sessions', filter: `user_id=eq.${user.id}` },
        () => { loadDataRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `user_id=eq.${user.id}` },
        () => { loadDataRef.current(); })
      // ── LIVE NOTIFICATION STREAMS — dedicated handlers, additive to the reload-triggering ones
      // above. Built straight from the realtime payload (no round-trip wait), capped to the
      // newest STREAM_CAP entries. Cancelled bookings never enter the "new bookings" stream.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const b = payload.new as Booking;
          if (isCancelled(b.status)) return;
          setNewBookingNotices((prev) => [
            ...prev,
            {
              id: `${b.booking_ref}-${Date.now()}`,
              customerName: b.customer_name,
              revenue: Number(b.gross_revenue) || 0,
              option: optionLabel(b),
              pax: paxTotal(b),
              travelDate: b.travel_date || '',
            },
          ].slice(-STREAM_CAP));
        })
      // Fires on both INSERT (the common case — a checkins row is created already 'checked_in')
      // and UPDATE (a row that existed in some other terminal status changing to checked_in) —
      // either way, only a transition INTO checked_in ever produces a notice.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter: `user_id=eq.${user.id}` },
        (payload) => { pushCheckinNotice(payload.new as Checkin); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'checkins', filter: `user_id=eq.${user.id}` },
        (payload) => { pushCheckinNotice(payload.new as Checkin); })
      // Surfaces a failed/dropped subscription both in the console AND in the header badge below
      // (see realtimeStatus) — this channel otherwise fails silently (e.g. a table missing from
      // the `supabase_realtime` publication produces no error at all, just no events), so a dead
      // board would otherwise look identical to a quiet one to anyone actually looking at it.
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.error(`[LiveDashboard] realtime subscription ${status}`, err);
          setRealtimeStatus('error');
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Live clock — purely ambient, confirms the screen is alive from across the room.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const guideById = useMemo(() => new Map(guides.map((g) => [g.id, g])), [guides]);

  // ── STAFFING ALERTS (next 5 days) ─────────────────────────────────────────────────────────
  const staffingAlerts: StaffingAlert[] = useMemo(
    () => buildStaffingAlerts(staffSessions, staffSessionBookings, staffSessionGuides, staffBookings),
    [staffSessions, staffSessionBookings, staffSessionGuides, staffBookings]
  );
  const todayBookingByRef = useMemo(() => new Map(todayBookings.map((b) => [b.booking_ref, b])), [todayBookings]);
  const todaySessionBookingByRef = useMemo(() => {
    const m = new Map<string, SessionBookingRow>();
    const todaySessionIds = new Set(sessions.filter((s) => s.tour_date === today).map((s) => s.id));
    sessionBookings.forEach((sb) => { if (todaySessionIds.has(sb.session_id)) m.set(sb.booking_ref, sb); });
    return m;
  }, [sessionBookings, sessions, today]);

  // "Always latest" mirrors for the realtime effect's dedicated INSERT/UPDATE handlers below — that
  // effect only re-subscribes on [user], so its callbacks would otherwise close over stale state.
  guideByIdRef.current = guideById;
  todayBookingByRefRef.current = todayBookingByRef;
  todaySessionBookingByRefRef.current = todaySessionBookingByRef;

  // ── TOP STAT STRIP ────────────────────────────────────────────────────────────────────────
  const paxExpected = useMemo(() => todayBookings.reduce((s, b) => s + (isCancelled(b.status) ? 0 : paxTotal(b)), 0), [todayBookings]);
  const checkedInRows = useMemo(() => checkins.filter((c) => c.status === 'checked_in'), [checkins]);
  const paxCheckedIn = useMemo(() => checkedInRows.reduce((s, c) => {
    const b = todayBookingByRef.get(c.booking_ref);
    return s + (b && !isCancelled(b.status) ? paxTotal(b) : 0);
  }, 0), [checkedInRows, todayBookingByRef]);
  const todaySessions = useMemo(() => sessions.filter((s) => s.tour_date === today), [sessions, today]);
  const tomorrowSessions = useMemo(() => sessions.filter((s) => s.tour_date === tomorrow), [sessions, tomorrow]);
  const todaySessionIds = useMemo(() => new Set(todaySessions.map((s) => s.id)), [todaySessions]);
  const guidesOnToday = useMemo(() => {
    const ids = new Set<string>();
    sessionGuides.forEach((sg) => { if (sg.status === 'accepted' && todaySessionIds.has(sg.session_id)) ids.add(sg.guide_id); });
    return ids.size;
  }, [sessionGuides, todaySessionIds]);
  const checkinPct = paxExpected > 0 ? Math.round((paxCheckedIn / paxExpected) * 100) : 0;

  // ── CHECKING IN NOW ───────────────────────────────────────────────────────────────────────
  const checkingInFeed = useMemo(() => {
    return checkedInRows
      .map((c) => {
        const b = todayBookingByRef.get(c.booking_ref);
        if (!b || isCancelled(b.status)) return null;
        const sb = todaySessionBookingByRef.get(c.booking_ref);
        const guide = sb?.allotted_guide_id ? guideById.get(sb.allotted_guide_id) : null;
        const name = (c.display_name_override && String(c.display_name_override).trim()) || b.customer_name;
        return {
          bookingRef: c.booking_ref,
          name,
          option: b.option_name || b.product_name || 'Tour',
          pax: paxTotal(b),
          guideName: guide?.name || 'Unassigned',
          checkedInAt: c.checked_in_at,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (b.checkedInAt || '').localeCompare(a.checkedInAt || ''));
  }, [checkedInRows, todayBookingByRef, todaySessionBookingByRef, guideById]);

  // ── TODAY / TOMORROW DAY BOXES — "Sessions" view ─────────────────────────────────────────
  const todayTourCards = useMemo<DaySessionCard[]>(() => {
    return todaySessions.map((session) => {
      const links = sessionBookings.filter((sb) => sb.session_id === session.id);
      let pax = 0;
      let checkedIn = 0;
      links.forEach((sb) => {
        const b = todayBookingByRef.get(sb.booking_ref);
        if (!b || isCancelled(b.status)) return;
        const bp = paxTotal(b);
        pax += bp;
        const c = checkins.find((cr) => cr.booking_ref === sb.booking_ref);
        if (c?.status === 'checked_in') checkedIn += bp;
      });
      const guideNames = sessionGuides
        .filter((sg) => sg.session_id === session.id && sg.status === 'accepted')
        .map((sg) => guideById.get(sg.guide_id)?.name)
        .filter(Boolean) as string[];
      return {
        id: session.id,
        label: session.label || 'Untitled Session',
        startTime: session.start_time,
        pax,
        checkedIn,
        pct: pax > 0 ? Math.round((checkedIn / pax) * 100) : 0,
        guideNames,
      };
    }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [todaySessions, sessionBookings, todayBookingByRef, checkins, sessionGuides, guideById]);

  const tomorrowBookingByRef = useMemo(() => new Map(tomorrowBookings.map((b) => [b.booking_ref, b])), [tomorrowBookings]);
  const tomorrowTourCards = useMemo<DaySessionCard[]>(() => {
    return tomorrowSessions.map((session) => {
      const links = sessionBookings.filter((sb) => sb.session_id === session.id);
      let pax = 0;
      links.forEach((sb) => {
        const b = tomorrowBookingByRef.get(sb.booking_ref);
        if (b && !isCancelled(b.status)) pax += paxTotal(b);
      });
      const guideNames = sessionGuides
        .filter((sg) => sg.session_id === session.id && sg.status === 'accepted')
        .map((sg) => guideById.get(sg.guide_id)?.name)
        .filter(Boolean) as string[];
      // No `checkedIn`/`pct` — tomorrow has no check-ins yet, so no progress bar to show.
      return { id: session.id, label: session.label || 'Untitled Session', startTime: session.start_time, pax, guideNames };
    }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [tomorrowSessions, sessionBookings, tomorrowBookingByRef, sessionGuides, guideById]);

  // ── TODAY / TOMORROW DAY BOXES — "General" view (straight from bookings, session-independent) ─
  const todayGeneral = useMemo(() => buildGeneralGroups(todayBookings), [todayBookings]);
  const tomorrowGeneral = useMemo(() => buildGeneralGroups(tomorrowBookings), [tomorrowBookings]);

  // ── NEW BOOKINGS (LAST 24H) ───────────────────────────────────────────────────────────────
  const newBookingsFeed = useMemo(() => recentBookings.filter((b) => !isCancelled(b.status)), [recentBookings]);

  // ── TODAY'S MONEY ─────────────────────────────────────────────────────────────────────────
  // Profit is recomputed live from cost components rather than trusting the stored
  // bookings.net_profit column, which predates per-session guide pay (session_guides.base_pay/
  // bonus) and would otherwise silently show a stale, too-high profit. A booking already linked
  // to one of today's sessions gets its guide cost from that session's pay (summed once below,
  // per session-guide, independent of how many bookings the session has) — its own guide_cost
  // column is a FALLBACK, used only when the booking isn't linked to any session at all, so guide
  // cost is never counted twice for the same booking.
  const sessionedBookingRefsToday = useMemo(() => {
    const set = new Set<string>();
    sessionBookings.forEach((sb) => { if (todaySessionIds.has(sb.session_id)) set.add(sb.booking_ref); });
    return set;
  }, [sessionBookings, todaySessionIds]);

  const moneyToday = useMemo(() => {
    let revenue = 0;
    let bookingCosts = 0;
    todayBookings.forEach((b) => {
      if (isCancelled(b.status)) return;
      revenue += Number(b.gross_revenue) || 0;
      bookingCosts += (Number(b.ticket_cost) || 0) + (Number(b.extra_cost) || 0) + (Number(b.gyg_cost) || 0)
        + (Number(b.commission_amount) || 0) + (Number(b.marketplace_fee) || 0);
      if (!sessionedBookingRefsToday.has(b.booking_ref)) {
        bookingCosts += Number(b.guide_cost) || 0;
      }
    });

    // Session-based guide pay — summed once per (session, guide) row, never per booking, so a
    // session with many bookings can never inflate this.
    let sessionGuideCost = 0;
    sessionGuides.forEach((sg) => {
      if (sg.status !== 'accepted' || !todaySessionIds.has(sg.session_id)) return;
      sessionGuideCost += (Number(sg.base_pay) || 0) + (Number(sg.bonus) || 0);
    });

    return { revenue, profit: revenue - bookingCosts - sessionGuideCost };
  }, [todayBookings, sessionGuides, todaySessionIds, sessionedBookingRefsToday]);

  // ── THIS MONTH — EARNING (travel date) ───────────────────────────────────────────────────
  // Revenue + count of bookings whose TRAVEL happens this calendar month — grows as this month's
  // tours actually run, regardless of when they were booked. Same {revenue, count} shape as
  // monthBookedStats below so both "This Month" tiles read the same way: big money, small count.
  const monthTravelStats = useMemo(() => {
    let revenue = 0;
    let count = 0;
    monthTravelBookings.forEach((b) => {
      if (isCancelled(b.status)) return;
      revenue += Number(b.gross_revenue) || 0;
      count += 1;
    });
    return { revenue, count };
  }, [monthTravelBookings]);

  // ── THIS MONTH — BOOKINGS (booking date) ─────────────────────────────────────────────────
  // Count + gross_revenue of bookings MADE this calendar month, regardless of travel date — a
  // demand signal, not a "tours happening" one. Deliberately a separate query/memo from the one
  // above so the two dimensions (travel vs. booking date) can never leak into each other.
  const monthBookedStats = useMemo(() => {
    let count = 0;
    let revenue = 0;
    monthBookedBookings.forEach((b) => {
      if (isCancelled(b.status)) return;
      count += 1;
      revenue += Number(b.gross_revenue) || 0;
    });
    return { count, revenue };
  }, [monthBookedBookings]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-4 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="p-5 sm:p-6 lg:p-10 space-y-8 lg:space-y-10 max-w-[1800px] mx-auto">

        {/* HEADER — a small "LIVE" pulse badge sits above the title (its own visual weight,
            distinct from the page name) with the clock as a self-contained chip on the right,
            rather than floating bare mono text — reads calmer, more like an instrument panel. */}
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              {realtimeStatus === 'error' ? (
                <>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600 shrink-0" />
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-red-700">Disconnected</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
                  </span>
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-green-700">
                    {realtimeStatus === 'live' ? 'Live' : 'Connecting…'}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight mt-1">Live Board</h1>
            <p className="text-muted-foreground font-medium mt-1 text-sm lg:text-base">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2.5 lg:px-5 lg:py-3 rounded-2xl bg-card border border-border shadow-sm">
            <Clock size={20} className="text-gold shrink-0" />
            <span className="text-xl sm:text-2xl lg:text-3xl font-bold font-mono text-foreground tabular-nums">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Only shown when the realtime channel itself reports CHANNEL_ERROR/TIMED_OUT/CLOSED —
            not shown while merely connecting, so a normal page load never flashes this. */}
        {realtimeStatus === 'error' && (
          <div className="flex items-center gap-2.5 bg-red-600/10 border border-red-600/25 text-red-700 text-xs sm:text-sm font-bold rounded-xl px-4 py-3">
            <ShieldAlert size={16} className="shrink-0" />
            Live updates disconnected — this board will not update on its own until refreshed. (Realtime subscription error)
          </div>
        )}

        {/* TODAY AT A GLANCE — the stat strip and check-in progress bar unified into one card
            (they're both "today's headline status") instead of floating as separate elements,
            so the most important numbers read as one coherent block. */}
        <section className="aurelia-card p-5 sm:p-6 lg:p-8">
          <h2 className="aurelia-section-title mb-5">Today at a Glance</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
            <StatTile label="Pax Expected" value={paxExpected} icon={Users} accent="blue" />
            <StatTile label="Pax Checked In" value={paxCheckedIn} icon={CheckCircle2} accent="green" />
            <StatTile label="Tours Today" value={todaySessions.length} icon={CalendarIcon} accent="gold" />
            <StatTile label="Guides On Today" value={guidesOnToday} icon={UserCheck} accent="purple" />
          </div>
          <div className="mt-6 lg:mt-8 pt-5 lg:pt-6 border-t border-border/60">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs lg:text-sm font-bold text-muted-foreground uppercase tracking-wide">Check-in Progress</span>
              <span className="text-xl lg:text-2xl font-extrabold text-gold tabular-nums">{checkinPct}%</span>
            </div>
            <div className="h-3 lg:h-3.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gold transition-all duration-700 ease-out rounded-full" style={{ width: `${checkinPct}%` }} />
            </div>
          </div>
        </section>

        {/* STAFFING ALERTS — the at-a-glance "does anything in the next 5 days need another
            guide" view, so the owner never has to hunt date by date. Admin-only (this whole page
            already is — see the file-top note); guides never see this. Live via the SAME
            realtime subscription that already drives every other section (session_guides/
            session_bookings/bookings/tour_sessions changes all re-run loadData()). Collapses to
            a single calm line when clear; expands with a red-tinted zone only when something
            actually needs attention. */}
        <section className={`rounded-2xl border shadow-sm transition-colors ${
          staffingAlerts.length > 0 ? 'border-red-600/25 bg-red-600/[0.025] p-5 lg:p-6' : 'border-border bg-card px-5 py-4 lg:px-6'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {staffingAlerts.length > 0
                ? <ShieldAlert size={18} className="text-red-600 shrink-0" />
                : <ShieldCheck size={18} className="text-green-600 shrink-0" />}
              <h2 className="aurelia-section-title shrink-0">Staffing Alerts</h2>
              {staffingAlerts.length === 0 && (
                <span className="text-sm text-muted-foreground truncate">All staffed — next 5 days clear</span>
              )}
            </div>
            {staffingAlerts.length > 0 && (
              <span className="text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full bg-red-600/15 text-red-700 shrink-0">
                {staffingAlerts.length} session{staffingAlerts.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {staffingAlerts.length > 0 && (
            <div className="space-y-2.5 mt-4">
              {staffingAlerts.map((a) => (
                <div key={a.sessionId} className="flex flex-wrap items-center justify-between gap-3 bg-card border border-red-600/15 rounded-xl p-3.5 lg:p-4 shadow-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-extrabold text-red-700 uppercase tracking-wide bg-red-600/10 px-2 py-0.5 rounded-full shrink-0">
                        {fmtShortDate(a.tourDate)}
                      </span>
                      <span className="font-bold text-sm truncate">{a.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tour {a.startTime || '—'} &middot; {a.guideCount} guide{a.guideCount !== 1 ? 's' : ''} &middot; {a.totalPax} pax
                    </p>
                    <p className="text-xs font-semibold text-red-700 mt-1">{a.reasons.join(' · ')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* FINANCIALS — Today's Money (revealable) and This Month grouped under one label, since
            they're both money-shaped numbers, distinct from the operational zones around them. */}
        <section className="space-y-4 lg:space-y-5">
          <h2 className="aurelia-section-title">Financials</h2>

          {/* TODAY'S MONEY — prominent, but still HIDDEN BY DEFAULT behind its own toggle so the
              screen stays safe to leave on a monitor others can see. */}
          <div>
            <button
              onClick={() => setShowMoney((v) => !v)}
              className="w-full flex items-center justify-between gap-3 aurelia-card p-5 lg:p-6 hover:border-gold/30 transition-colors"
            >
              <span className="text-base lg:text-lg font-bold">Today's Money</span>
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {showMoney ? <><EyeOff size={16} /> Hide</> : <><Eye size={16} /> Tap to reveal</>}
              </span>
            </button>
            {showMoney && (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-6 mt-4 animate-fade-in">
                <div className="aurelia-card p-5 lg:p-6">
                  <div className="flex items-center gap-2 text-green-700 mb-2">
                    <span className="w-2 h-2 rounded-full bg-green-600 shrink-0" />
                    <p className="text-xs lg:text-sm font-bold uppercase tracking-wide">Revenue</p>
                  </div>
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tabular-nums leading-none">{fmtE(moneyToday.revenue)}</p>
                </div>
                <div className="aurelia-card p-5 lg:p-6">
                  <div className="flex items-center gap-2 text-gold mb-2">
                    <span className="w-2 h-2 rounded-full bg-gold shrink-0" />
                    <p className="text-xs lg:text-sm font-bold uppercase tracking-wide">Profit</p>
                  </div>
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tabular-nums leading-none">{fmtE(moneyToday.profit)}</p>
                </div>
              </div>
            )}
          </div>

          {/* THIS MONTH — two deliberately DISTINCT lenses on the same month, so travel-based vs.
              booking-based is never confused: tile 1 is TRAVEL DATE (grows as this month's tours
              actually happen), tile 2 is BOOKING DATE (demand landing this month, however far in
              the future the travel itself is). Different accent color + an explicit "By ___ date"
              badge on each. A third "Net Profit This Month" tile slots in here later, once
              per-session guide cost exists — deliberately not computed yet, gross only. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
            <MonthStatCard
              title="This Month — Earning"
              badge="By travel date"
              badgeClass="bg-sky-500/10 text-sky-700"
              icon={Plane}
              dotClass="bg-sky-500"
              value={fmtE(monthTravelStats.revenue)}
              count={`${monthTravelStats.count} tour${monthTravelStats.count !== 1 ? 's' : ''}`}
              sublabel={`Tours running in ${monthLabel} — grows as they happen`}
            />
            <MonthStatCard
              title="This Month — Bookings"
              badge="By booking date"
              badgeClass="bg-amber-500/10 text-amber-700"
              icon={ClipboardList}
              dotClass="bg-amber-500"
              value={fmtE(monthBookedStats.revenue)}
              count={`${monthBookedStats.count} booking${monthBookedStats.count !== 1 ? 's' : ''}`}
              sublabel={`Booked in ${monthLabel} — demand, may travel later`}
            />
          </div>
        </section>

        {/* OPERATIONS — the main working grid: sticky check-in rail in landscape, full-width
            stacked in portrait/phone. */}
        <section className="space-y-4">
          <h2 className="aurelia-section-title">Operations</h2>
          <div className="grid grid-cols-1 2xl:grid-cols-[400px_1fr] gap-5 lg:gap-8 items-start">

            {/* CHECKING IN NOW — the heartbeat */}
            <div className="aurelia-card p-5 lg:p-6 2xl:sticky 2xl:top-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={18} className="text-gold" />
                <h3 className="aurelia-section-title">Checking In Now</h3>
              </div>
              {checkingInFeed.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center italic">No check-ins yet today.</p>
              ) : (
                <div className="space-y-2.5 max-h-[560px] overflow-y-auto aurelia-scrollbar pr-1">
                  {checkingInFeed.map((c) => (
                    <div key={c.bookingRef} className="animate-slide-in bg-muted/60 rounded-xl p-3.5 border border-border/50">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-base leading-tight truncate">{c.name}</span>
                        <span className="text-gold font-extrabold text-lg shrink-0">{c.pax}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">{c.option}</p>
                      <div className="flex items-center justify-between mt-1.5 text-xs font-bold">
                        <span className="text-green-700 uppercase tracking-wide">{c.guideName}</span>
                        <span className="text-muted-foreground">{fmtTime(c.checkedInAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN — Today's tours, tomorrow's tours, new bookings */}
            <div className="space-y-6 lg:space-y-8 min-w-0">

              {/* TODAY / TOMORROW — each with its own Sessions/General toggle */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6">
                <DayBox
                  title="Today"
                  dateLabel={todayLabel}
                  defaultView="sessions"
                  sessionCards={todayTourCards}
                  general={todayGeneral}
                />
                <DayBox
                  title="Tomorrow"
                  dateLabel={tomorrowLabel}
                  defaultView="general"
                  sessionCards={tomorrowTourCards}
                  general={tomorrowGeneral}
                />
              </div>

              {/* NEW BOOKINGS (LAST 24H) */}
              <div className="aurelia-card p-5 lg:p-6">
                <h3 className="aurelia-section-title mb-4">New Bookings — Last 24h</h3>
                {newBookingsFeed.length === 0 ? (
                  <p className="text-muted-foreground text-sm italic text-center py-6">No new bookings in the last 24 hours.</p>
                ) : (
                  <div className="divide-y divide-border/70 -mx-1 max-h-[360px] overflow-y-auto aurelia-scrollbar">
                    {newBookingsFeed.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-3 px-1 py-3">
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{b.customer_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {shortProductCode(b.product_code) || 'Unknown'} — {b.option_name || 'Standard'}
                            <span className="mx-1">&middot;</span>
                            {b.channel || 'Unknown'}
                          </p>
                          <p className="text-xs font-semibold text-foreground/70 mt-0.5">
                            Travel: {fmtShortDate(b.travel_date)}
                          </p>
                        </div>
                        <span className="text-gold font-extrabold text-sm shrink-0">{paxTotal(b)} pax</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </section>

        {/* LIVE ACTIVITY — two ephemeral "flying up" streams, additive to the persistent summary
            containers elsewhere on the board (Checking In Now, New Bookings — Last 24h). Sits at
            the bottom of the board — the operational summaries above are what the owner actually
            works from; this is a secondary, ambient "things just happened" strip. Left/right
            columns in landscape, stacked rows in portrait (xl breakpoint, same threshold used for
            the Today/Tomorrow boxes) — always in normal page flow, never fixed/overlay, so it can
            never cover another section. */}
        <section className="space-y-4">
          <h2 className="aurelia-section-title">Live Activity</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6">
            <NoticeStream
              title="New Bookings"
              icon={ClipboardList}
              accentClass="text-sky-600"
              emptyText="Waiting for the next booking…"
            >
              {newBookingNotices.map((n) => (
                <div key={n.id} className="animate-rise-in relative bg-sky-500/[0.04] rounded-xl p-3.5 pr-8 border border-sky-500/15 border-l-[3px] border-l-sky-500/50">
                  <button
                    onClick={() => setNewBookingNotices((prev) => prev.filter((x) => x.id !== n.id))}
                    className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-sm leading-tight truncate">{n.customerName}</span>
                    <span className="text-sky-600 font-extrabold text-sm shrink-0">{fmtE(n.revenue)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.option}</p>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] font-bold text-muted-foreground">
                    <span>{n.pax} pax</span>
                    <span>{n.travelDate}</span>
                  </div>
                </div>
              ))}
            </NoticeStream>

            <NoticeStream
              title="Just Checked In"
              icon={UserCheck}
              accentClass="text-green-700"
              emptyText="Waiting for the next check-in…"
            >
              {checkinNotices.map((n) => (
                <div key={n.id} className="animate-rise-in relative bg-green-600/[0.04] rounded-xl p-3.5 pr-8 border border-green-600/15 border-l-[3px] border-l-green-600/50">
                  <button
                    onClick={() => setCheckinNotices((prev) => prev.filter((x) => x.id !== n.id))}
                    className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-sm leading-tight truncate">{n.name}</span>
                    <span className="text-gold font-extrabold text-sm shrink-0">{n.pax} pax</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.option}</p>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] font-bold">
                    <span className="text-green-700 uppercase tracking-wide">{n.guideName}</span>
                    <span className="text-muted-foreground">{fmtTime(n.time)}</span>
                  </div>
                </div>
              ))}
            </NoticeStream>
          </div>
        </section>
      </div>
    </div>
  );
}

const STAT_ACCENTS: Record<string, { chip: string; icon: string }> = {
  blue: { chip: 'bg-blue-500/10', icon: 'text-blue-600' },
  green: { chip: 'bg-green-500/10', icon: 'text-green-600' },
  gold: { chip: 'bg-gold/10', icon: 'text-gold' },
  purple: { chip: 'bg-purple-500/10', icon: 'text-purple-600' },
};

/** One tile inside the "Today at a Glance" card — a soft tinted icon chip above a big number,
    rather than a loud colored border bar, so the NUMBER (not the label) carries the visual
    weight. Nested directly in the parent card's grid rather than being its own elevated card, so
    four related stats read as one glanceable group instead of four separate floating boxes. */
function StatTile({ label, value, icon: Icon, accent }: { label: string; value: number; icon: LucideIcon; accent: string }) {
  const a = STAT_ACCENTS[accent];
  return (
    <div className="rounded-2xl p-4 lg:p-5 bg-muted/40 border border-border/60">
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl mb-3 ${a.chip}`}>
        <Icon size={16} className={a.icon} />
      </div>
      <p className="text-[10px] lg:text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tabular-nums leading-none">{value}</p>
    </div>
  );
}

/** Like StatTile, but for the "This Month" row — carries an explicit date-basis badge (so
    travel-based vs. booking-based is never ambiguous at a glance). Money is always the headline
    figure (biggest = most important); the supporting booking/tour count sits directly below it in
    small text, same position and style on both tiles, so the two read as one consistent pattern. */
function MonthStatCard({
  title, badge, badgeClass, icon: Icon, dotClass, value, count, sublabel,
}: {
  title: string;
  badge: string;
  badgeClass: string;
  icon: LucideIcon;
  dotClass: string;
  /** Big headline figure — always the money amount for this lens. */
  value: string;
  /** Small supporting count below the money, e.g. "162 bookings" / "148 tours". */
  count?: string;
  sublabel: string;
}) {
  return (
    <div className="aurelia-card p-5 lg:p-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
          <Icon size={15} className="shrink-0" />
          <p className="text-xs lg:text-sm font-bold truncate">{title}</p>
        </div>
        <span className={`text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${badgeClass}`}>
          {badge}
        </span>
      </div>
      <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tabular-nums leading-none">{value}</p>
      {count && (
        <p className="text-xs lg:text-sm font-bold text-muted-foreground mt-1.5">{count}</p>
      )}
      <p className="text-xs lg:text-sm text-muted-foreground font-medium mt-2">{sublabel}</p>
    </div>
  );
}

/** Shell for one of the two "flying up" live streams — fixed height so the board's layout never
    jumps as cards arrive, newest at the bottom (children are expected in chronological order,
    oldest first) so a fresh arrival naturally eases in at the bottom edge and everything above it
    reads as having drifted upward. No exit animation on removal (dismiss or natural cap-eviction)
    — cards simply disappear, matching "dismissed cards disappear immediately". */
function NoticeStream({
  title, icon: Icon, accentClass, emptyText, children,
}: {
  title: string;
  icon: LucideIcon;
  accentClass: string;
  emptyText: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="aurelia-card p-5 lg:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className={accentClass} />
        <h3 className="aurelia-section-title">{title}</h3>
      </div>
      <div className="h-[380px] lg:h-[420px] overflow-hidden flex flex-col justify-end gap-2.5">
        {hasChildren ? children : (
          <p className="text-muted-foreground text-sm italic text-center">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

/** One of the Today/Tomorrow boxes — own Sessions/General toggle, defaulting per `defaultView`
    (Today starts on Sessions, Tomorrow on General, since tomorrow's sessions usually aren't built
    yet). The toggle is local state, set once from the prop at mount — matches the same
    tab-button pattern used throughout the app (TodayToursPage/GuideCheckin). */
function DayBox({
  title, dateLabel, defaultView, sessionCards, general,
}: {
  title: string;
  dateLabel: string;
  defaultView: 'sessions' | 'general';
  sessionCards: DaySessionCard[];
  general: { upcoming: GeneralGroup[]; cancelled: Booking[] };
}) {
  const [view, setView] = useState<'sessions' | 'general'>(defaultView);

  return (
    <div className="aurelia-card p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="aurelia-section-title">{title}</h3>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">{dateLabel}</p>
        </div>
        <div className="flex bg-muted p-1 rounded-xl shrink-0">
          <button
            onClick={() => setView('sessions')}
            className={`min-h-9 px-3 text-[11px] font-bold uppercase tracking-wide rounded-lg transition-all ${view === 'sessions' ? 'bg-gold text-black' : 'text-muted-foreground'}`}
          >
            Sessions
          </button>
          <button
            onClick={() => setView('general')}
            className={`min-h-9 px-3 text-[11px] font-bold uppercase tracking-wide rounded-lg transition-all ${view === 'general' ? 'bg-gold text-black' : 'text-muted-foreground'}`}
          >
            General
          </button>
        </div>
      </div>

      {view === 'sessions' ? (
        sessionCards.length === 0 ? (
          <p className="text-muted-foreground text-sm italic py-6 text-center">No sessions built yet.</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {sessionCards.map((s) => (
              <div key={s.id} className="bg-muted/40 border border-border/70 rounded-xl p-4 space-y-2.5">
                <div>
                  <p className="font-bold text-sm leading-snug truncate">{s.label}</p>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">
                    {s.startTime ? `Check-in ${checkinTime(s.startTime)} · Tour ${s.startTime}` : '—'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.guideNames.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground italic">No guide assigned</span>
                  ) : s.guideNames.map((n) => (
                    <span key={n} className="text-[10px] font-bold bg-gold/10 text-gold px-1.5 py-0.5 rounded-full border border-gold/20">{n}</span>
                  ))}
                </div>
                {s.pct !== undefined ? (
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground mb-1">
                      <span>{s.checkedIn} / {s.pax} pax in</span>
                      <span className="text-gold">{s.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gold transition-all duration-500 rounded-full" style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-gold">{s.pax} pax</p>
                )}
              </div>
            ))}
          </div>
        )
      ) : general.upcoming.length === 0 && general.cancelled.length === 0 ? (
        <p className="text-muted-foreground text-sm italic py-6 text-center">No bookings for this day.</p>
      ) : (
        <div className="space-y-4">
          {general.upcoming.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Upcoming</p>
              {general.upcoming.map((g) => (
                <div key={g.key} className="flex items-center justify-between gap-3 bg-muted/40 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{g.label}</p>
                    <p className="text-xs text-muted-foreground">{g.time} &middot; {g.count} booking{g.count !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-gold font-extrabold text-sm shrink-0">{g.pax} pax</span>
                </div>
              ))}
            </div>
          )}
          {general.cancelled.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Cancelled</p>
              {general.cancelled.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 bg-muted/20 rounded-lg px-3 py-2 opacity-60">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate line-through">{b.customer_name}</p>
                    <p className="text-xs text-muted-foreground truncate line-through">{optionLabel(b)}</p>
                  </div>
                  <span className="text-muted-foreground font-bold text-sm shrink-0 line-through">{paxTotal(b)} pax</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
