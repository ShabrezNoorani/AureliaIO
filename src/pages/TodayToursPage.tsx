import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Clock, Calendar as CalendarIcon, Share2, Check, Search, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { logChange } from '@/lib/changeLog';
import { computeBalance, pickLeastLoadedGuide } from '@/lib/allocationBalance';
import { localDateStr } from '@/lib/utils';
import GuestCard from '@/components/checkin/GuestCard';
import CheckinConfirmModal from '@/components/checkin/CheckinConfirmModal';
import TourGroup from '@/components/checkin/TourGroup';
import AllocationBoard, { AllocationGuide, AllocationGuest } from '@/components/checkin/AllocationBoard';

const paxTotal = (b: any) =>
  (Number(b?.pax_adult) || 0) + (Number(b?.pax_youth) || 0) + (Number(b?.pax_child) || 0) + (Number(b?.pax_infant) || 0);

interface SessionGuestRow {
  booking: any;
  displayName: string;
  pax: number;
  isCheckedIn: boolean;
  isNoShow: boolean;
  checkedInAt: string | null;
  allottedGuideId: string | null;
}

export default function TodayToursPage() {
  const { user, profile } = useAuth();

  const [bookings, setBookings] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionBookings, setSessionBookings] = useState<any[]>([]);
  const [sessionGuides, setSessionGuides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const [todayStrDate, setTodayStrDate] = useState(localDateStr());

  const [showConfirm, setShowConfirm] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [balancingSessionId, setBalancingSessionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Guards every setState below against firing after this page has unmounted (relevant now that
  // several async refreshes can be in flight at once: initial load, realtime-triggered refreshes,
  // and per-action refreshes).
  const mountedRef = useRef(true);

  const loadData = async () => {
    if (!user) return;
    const today = localDateStr();
    setTodayStrDate(today);

    const [bRes, gRes, cRes, sessRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user.id).eq('travel_date', today).not('status', 'in', '("CANCELLED_EARLY","CANCELLED_LATE")').order('travel_time', { ascending: true }),
      supabase.from('guides').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('checkins').select('*').eq('user_id', user.id).eq('travel_date', today),
      supabase.from('tour_sessions').select('id, label, start_time, tour_date').eq('user_id', user.id).eq('tour_date', today).order('start_time', { ascending: true }),
    ]);
    if (!mountedRef.current) return;

    setBookings(bRes.data || []);
    setGuides(gRes.data || []);
    setCheckins(cRes.data || []);

    const sessionsData = sessRes.data || [];
    setSessions(sessionsData);
    const sessionIds = sessionsData.map((s: any) => s.id);

    if (sessionIds.length > 0) {
      const [sbRes, sgRes] = await Promise.all([
        supabase.from('session_bookings').select('session_id, booking_ref, allotted_guide_id').eq('user_id', user.id).in('session_id', sessionIds),
        supabase.from('session_guides').select('session_id, guide_id, shuffle_locked, status').eq('user_id', user.id).in('session_id', sessionIds),
      ]);
      if (!mountedRef.current) return;
      setSessionBookings(sbRes.data || []);
      setSessionGuides(sgRes.data || []);
    } else {
      setSessionBookings([]);
      setSessionGuides([]);
    }

    setLoading(false);
  };

  // Lightweight, silent refreshes of just one table's worth of state — used both after this
  // client's own writes and as the target of the realtime subscriptions below. None of these
  // touch `loading`, so they never trigger the full-page spinner; only the very first mount does.
  const refreshCheckins = async () => {
    if (!user) return;
    const { data } = await supabase.from('checkins').select('*').eq('user_id', user.id).eq('travel_date', todayStrDate);
    if (!mountedRef.current) return;
    setCheckins(data || []);
  };

  const refreshSessionBookings = async () => {
    if (!user) return;
    const sessionIds = sessions.map((s: any) => s.id);
    if (sessionIds.length === 0) {
      setSessionBookings([]);
      return;
    }
    const { data } = await supabase.from('session_bookings').select('session_id, booking_ref, allotted_guide_id').eq('user_id', user.id).in('session_id', sessionIds);
    if (!mountedRef.current) return;
    setSessionBookings(data || []);
  };

  // session_guides isn't realtime-subscribed (out of this task's scope) — just a targeted
  // refetch after a lock toggle instead of a full page reload.
  const refreshSessionGuides = async () => {
    if (!user) return;
    const sessionIds = sessions.map((s: any) => s.id);
    if (sessionIds.length === 0) {
      setSessionGuides([]);
      return;
    }
    const { data } = await supabase.from('session_guides').select('session_id, guide_id, shuffle_locked, status').eq('user_id', user.id).in('session_id', sessionIds);
    if (!mountedRef.current) return;
    setSessionGuides(data || []);
  };

  // Keeps the long-lived realtime subscription (set up once per user, below) always calling the
  // LATEST version of these refreshers — they close over `sessions`/`todayStrDate`, which change
  // far more often than the subscription itself needs to re-establish.
  const refreshCheckinsRef = useRef(refreshCheckins);
  refreshCheckinsRef.current = refreshCheckins;
  const refreshSessionBookingsRef = useRef(refreshSessionBookings);
  refreshSessionBookingsRef.current = refreshSessionBookings;

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadData();
    if (mountedRef.current) setRefreshing(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [user]);

  // Realtime replaces the old interval poll: instead of reloading the whole page every 60s (which
  // visibly refreshed the screen and could interrupt a guide mid-check-in), quietly refresh just
  // the affected slice of state whenever a checkins or session_bookings row actually changes —
  // whether that change came from this owner, a guide, or another browser tab.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`today-tours-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins', filter: `user_id=eq.${user.id}` },
        () => { refreshCheckinsRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_bookings', filter: `user_id=eq.${user.id}` },
        () => { refreshSessionBookingsRef.current(); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  // Find (or lack of) an existing checkins row for a booking, scoped to this user + travel date.
  const findCheckinRow = async (bookingRef: string) => {
    if (!user) return null;
    const { data } = await supabase
      .from('checkins')
      .select('*')
      .eq('user_id', user.id)
      .eq('booking_ref', bookingRef)
      .eq('travel_date', todayStrDate)
      .maybeSingle();
    return data;
  };

  const getDisplayName = (b: any) => {
    const cRecord = checkins.find(c => c.booking_ref === b.booking_ref);
    const override = cRecord?.display_name_override;
    return override && String(override).trim() ? override : b.customer_name;
  };

  const bookingRefToSessionId = useMemo(() => {
    const m = new Map<string, string>();
    sessionBookings.forEach((sb: any) => m.set(sb.booking_ref, sb.session_id));
    return m;
  }, [sessionBookings]);

  // Accepted guides per session, for the allocation board — only guides actually working the
  // tour get a column.
  const sessionIdToTeam = useMemo(() => {
    const m = new Map<string, AllocationGuide[]>();
    sessionGuides.forEach((sg: any) => {
      if (sg.status !== 'accepted') return;
      const guide = guides.find(g => g.id === sg.guide_id);
      if (!guide) return;
      const arr = m.get(sg.session_id) || [];
      arr.push({ id: sg.guide_id, name: guide.name, locked: !!sg.shuffle_locked });
      m.set(sg.session_id, arr);
    });
    return m;
  }, [sessionGuides, guides]);

  // Every guest (checked in or not) per session — the single source of truth Tab 1's flat list,
  // the progress bar, Tab 2's checked-in-only view, and the summary cards all derive from.
  const sessionIdToGuests = useMemo(() => {
    const bookingByRef = new Map(bookings.map(b => [b.booking_ref, b]));
    const m = new Map<string, SessionGuestRow[]>();
    sessionBookings.forEach((sb: any) => {
      const b = bookingByRef.get(sb.booking_ref);
      if (!b) return;
      const cRecord = checkins.find(c => c.booking_ref === sb.booking_ref);
      const arr = m.get(sb.session_id) || [];
      arr.push({
        booking: b,
        displayName: getDisplayName(b),
        pax: paxTotal(b),
        isCheckedIn: cRecord?.status === 'checked_in',
        isNoShow: cRecord?.status === 'no_show',
        checkedInAt: cRecord?.checked_in_at || null,
        allottedGuideId: sb.allotted_guide_id ?? null,
      });
      m.set(sb.session_id, arr);
    });
    return m;
  }, [sessionBookings, bookings, checkins]);

  // Checked-in guests only, grouped by their CURRENT session_bookings.allotted_guide_id — never
  // a frozen "checked in by" name — so a guest's shown guide always reflects live allotment.
  const sessionIdToCheckedInGuests = useMemo(() => {
    const m = new Map<string, AllocationGuest[]>();
    sessionIdToGuests.forEach((rows, sessionId) => {
      m.set(sessionId, rows.filter(r => r.isCheckedIn).map(r => ({
        bookingRef: r.booking.booking_ref,
        displayName: r.displayName,
        pax: r.pax,
        allottedGuideId: r.allottedGuideId,
      })));
    });
    return m;
  }, [sessionIdToGuests]);

  const allSessionGuests = useMemo(() => Array.from(sessionIdToGuests.values()).flat(), [sessionIdToGuests]);
  const totalPaxExpected = allSessionGuests.reduce((s, g) => s + g.pax, 0);
  const totalPaxChecked = allSessionGuests.filter(g => g.isCheckedIn).reduce((s, g) => s + g.pax, 0);
  const totalGuidesAssigned = useMemo(() => {
    const ids = new Set<string>();
    sessionIdToTeam.forEach(team => team.forEach(g => ids.add(g.id)));
    return ids.size;
  }, [sessionIdToTeam]);

  const unsessionedBookings = useMemo(
    () => bookings.filter(b => !bookingRefToSessionId.has(b.booking_ref)),
    [bookings, bookingRefToSessionId]
  );

  // Records a check-in or no-show — identical to GuideCheckin's flow (same checkins row shape,
  // same ticket-photo capture, same idempotency guard). Owner-only additions: the change-log
  // audit entry, and auto-allotting a freshly-checked-in guest.
  const recordCheckin = async (b: any, status: 'checked_in' | 'no_show', photoBase64: string | null = null) => {
    if (!user) return;

    const existing = await findCheckinRow(b.booking_ref);
    if (existing?.status === 'checked_in' || existing?.status === 'no_show') {
      await refreshCheckins();
      return;
    }

    const totalPax = paxTotal(b);
    const checkinFields = {
      checked_in_at: new Date().toISOString(),
      checked_in_by: 'Coordinator',
      pax_checked_in: status === 'checked_in' ? totalPax : 0,
      status,
      ticket_photo: photoBase64,
    };

    if (existing) {
      await supabase.from('checkins').update(checkinFields).eq('id', existing.id);
    } else {
      await supabase.from('checkins').insert({
        user_id: user.id,
        booking_ref: b.booking_ref,
        travel_date: todayStrDate,
        ...checkinFields,
      });
    }

    if (status === 'checked_in') {
      await supabase.from('bookings').update({ status: 'DONE' }).eq('id', b.id);

      await logChange(supabase, user.id, {
        tableName: 'bookings',
        recordId: b.booking_ref,
        fieldName: 'status',
        oldValue: b.status || 'CONFIRMED',
        newValue: 'DONE',
        description: `${b.booking_ref} status changed to DONE (Checked In)`
      });

      // Auto-allot: pick the unlocked guide on this booking's session with the lowest current
      // pax total (same tie-break rule Balance uses) — keeps allocation roughly even as guests
      // check in live instead of dumping everyone into the holding area. A session with no
      // guides, or where every guide is locked, leaves the guest unallotted rather than
      // override an owner's explicit lock.
      const sessionId = bookingRefToSessionId.get(b.booking_ref);
      if (sessionId) {
        const team = sessionIdToTeam.get(sessionId) || [];
        const unlockedTeam = team.filter(g => !g.locked);
        const currentGuests = sessionIdToCheckedInGuests.get(sessionId) || [];
        const totals: Record<string, number> = {};
        unlockedTeam.forEach(g => { totals[g.id] = 0; });
        currentGuests.forEach(g => {
          if (g.allottedGuideId && totals[g.allottedGuideId] !== undefined) {
            totals[g.allottedGuideId] += g.pax;
          }
        });
        const targetGuideId = pickLeastLoadedGuide(unlockedTeam, totals);
        if (targetGuideId) {
          await supabase.from('session_bookings')
            .update({ allotted_guide_id: targetGuideId })
            .eq('user_id', user.id)
            .eq('booking_ref', b.booking_ref);
        }
      }
    }

    await refreshCheckins();
    await refreshSessionBookings();
  };

  const handleConfirmCheckin = (photoBase64: string | null) => {
    if (!showConfirm) return;
    const b = showConfirm;
    setShowConfirm(null);
    recordCheckin(b, 'checked_in', photoBase64);
  };

  // Saves a display-only name correction to checkins.display_name_override.
  // Never touches bookings — the master sheet sync is untouched by this.
  const handleSaveNameOverride = async (b: any, newName: string) => {
    if (!user) return;
    const trimmed = newName.trim();

    const existing = await findCheckinRow(b.booking_ref);

    if (existing) {
      await supabase.from('checkins').update({ display_name_override: trimmed || null }).eq('id', existing.id);
    } else {
      await supabase.from('checkins').insert({
        user_id: user.id,
        booking_ref: b.booking_ref,
        travel_date: todayStrDate,
        display_name_override: trimmed || null,
      });
    }

    await refreshCheckins();
  };

  // Reverts a wrongly checked-in guest: deletes their checkins row for today, puts the booking
  // back to UPCOMING, and clears their allotment. This is a deliberate manual override — the
  // gsheetSync DONE-pin protection only ever reads whatever status is in the DB at sync time, so
  // once this write lands there is nothing left for that protection to "block".
  const handleResetCheckin = async (b: any) => {
    if (!user) return;
    if (!confirm(`Reset check-in for ${getDisplayName(b)}? They'll return to not-checked-in.`)) return;

    const existing = await findCheckinRow(b.booking_ref);
    if (existing) {
      await supabase.from('checkins').delete().eq('id', existing.id);
    }

    await supabase.from('bookings').update({ status: 'UPCOMING' }).eq('id', b.id);

    await supabase.from('session_bookings')
      .update({ allotted_guide_id: null })
      .eq('user_id', user.id)
      .eq('booking_ref', b.booking_ref);

    await logChange(supabase, user.id, {
      tableName: 'bookings',
      recordId: b.booking_ref,
      fieldName: 'status',
      oldValue: 'DONE',
      newValue: 'UPCOMING',
      description: `${b.booking_ref} check-in reset by owner`
    });

    await refreshCheckins();
    await refreshSessionBookings();
  };

  // Owner-only: move a single checked-in guest to a different guide (or unassign to holding).
  const handleMoveGuest = async (bookingRef: string, newGuideId: string | null) => {
    if (!user) return;
    await supabase.from('session_bookings')
      .update({ allotted_guide_id: newGuideId })
      .eq('user_id', user.id)
      .eq('booking_ref', bookingRef);
    await refreshSessionBookings();
  };

  // Owner-only: lock/unlock a guide on a session — locked guides and their guests are excluded
  // from Balance entirely.
  const handleToggleLock = async (sessionId: string, guideId: string, locked: boolean) => {
    if (!user) return;
    await supabase.from('session_guides')
      .update({ shuffle_locked: locked })
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
      .eq('guide_id', guideId);
    await refreshSessionGuides();
  };

  // Owner-only: run the Balance algorithm for one session and persist the resulting moves.
  const handleBalance = async (sessionId: string) => {
    if (!user) return;
    const teamGuides = sessionIdToTeam.get(sessionId) || [];
    const checkedInGuests = sessionIdToCheckedInGuests.get(sessionId) || [];

    const result = computeBalance(
      teamGuides.map(g => ({ id: g.id, locked: g.locked })),
      checkedInGuests.map(g => ({ bookingRef: g.bookingRef, pax: g.pax, allottedGuideId: g.allottedGuideId }))
    );

    if ('error' in result) {
      toast.error(result.error);
      return;
    }

    if (result.moves.length === 0) {
      toast.success('Already balanced — no changes needed.');
      return;
    }

    setBalancingSessionId(sessionId);
    try {
      // session_bookings has no single-column primary key — every row is scoped by (user_id, booking_ref).
      await Promise.all(result.moves.map(m =>
        supabase.from('session_bookings')
          .update({ allotted_guide_id: m.newGuideId })
          .eq('user_id', user.id)
          .eq('booking_ref', m.bookingRef)
      ));

      const summary = teamGuides
        .filter(g => !g.locked)
        .map(g => `${g.name}: ${result.totalsByGuideId[g.id] ?? 0} pax`)
        .join(' · ');
      toast.success(`Balanced ${result.moves.length} guest${result.moves.length !== 1 ? 's' : ''} — ${summary}`);

      await refreshSessionBookings();
    } finally {
      setBalancingSessionId(null);
    }
  };

  const copyCheckinLink = () => {
    if (!profile?.checkin_token) return alert('No check-in token found. Please visit Settings to generate one.');
    const url = `${window.location.origin}/checkin/${profile.checkin_token}?date=${todayStrDate}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <div className="p-4 md:p-8 pb-32 max-w-5xl mx-auto space-y-8 animate-fade-in">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border/50">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-2">Today's Tours</h1>
            <div className="flex items-center gap-2 text-muted-foreground font-medium">
              <CalendarIcon size={16} className="text-[#f5a623]" />
              <span>{todayStr}</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-3">
            <div className="flex items-center justify-end gap-2 text-2xl font-mono font-bold text-[#f5a623] drop-shadow-md mb-2">
              <Clock size={20} />
              <span>{timeStr}</span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                title="Refresh"
                className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all text-gray-400 hover:text-gold disabled:opacity-50"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={copyCheckinLink}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all text-gray-400 hover:text-gold"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Share2 size={14} />}
                {copied ? 'Link Copied!' : 'Copy Check-in Link'}
              </button>
            </div>
          </div>
        </div>

        {/* SUMMARY BAR */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="aurelia-card p-4 border-l-[3px] border-l-[#f5a623]">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sessions</p>
            <p className="text-2xl font-extrabold">{sessions.length}</p>
          </div>
          <div className="aurelia-card p-4 border-l-[3px] border-l-blue-500">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Pax Expected</p>
            <p className="text-2xl font-extrabold">{totalPaxExpected}</p>
          </div>
          <div className="aurelia-card p-4 border-l-[3px] border-l-green-500">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Pax Checked In</p>
            <p className="text-2xl font-extrabold text-green-400">{totalPaxChecked}</p>
          </div>
          <div className="aurelia-card p-4 border-l-[3px] border-l-purple-500">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Guides Assigned</p>
            <p className="text-2xl font-extrabold text-purple-400">{totalGuidesAssigned}</p>
          </div>
        </div>

        {unsessionedBookings.length > 0 && (
          <div className="flex items-start gap-3 text-sm bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl p-4">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              {unsessionedBookings.length} booking{unsessionedBookings.length !== 1 ? 's' : ''} today {unsessionedBookings.length !== 1 ? "aren't" : "isn't"} in a session yet
              — build one in Dispatch to check {unsessionedBookings.length !== 1 ? 'them' : 'it'} in here.
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center p-12"><div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>
        ) : sessions.length === 0 ? (
          <div className="aurelia-card p-12 text-center flex flex-col items-center max-w-md mx-auto mt-12">
            <CalendarIcon size={48} className="text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-bold mb-2">No tour sessions for today</h3>
            <p className="text-muted-foreground mb-6">Build a session in Dispatch to start checking guests in.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sessions.map((session: any) => (
              <SessionBoard
                key={session.id}
                session={session}
                guests={sessionIdToGuests.get(session.id) || []}
                team={sessionIdToTeam.get(session.id) || []}
                checkedInGuests={sessionIdToCheckedInGuests.get(session.id) || []}
                onCheckInClick={(b: any) => setShowConfirm(b)}
                onNoShow={(b: any) => recordCheckin(b, 'no_show')}
                onSaveName={handleSaveNameOverride}
                onResetCheckin={handleResetCheckin}
                onMoveGuest={handleMoveGuest}
                onToggleLock={handleToggleLock}
                onBalance={handleBalance}
                balancing={balancingSessionId === session.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* CHECKIN CONFIRM MODAL (photo capture) — identical to GuideCheckin */}
      {showConfirm && (
        <CheckinConfirmModal
          customerName={getDisplayName(showConfirm)}
          pax={{ adult: showConfirm.pax_adult, youth: showConfirm.pax_youth, child: showConfirm.pax_child, infant: showConfirm.pax_infant }}
          onConfirm={handleConfirmCheckin}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </div>
  );
}

// ────────── SESSION BOARD (Check-in / Allocation tabs) ──────────

function SessionBoard({
  session,
  guests,
  team,
  checkedInGuests,
  onCheckInClick,
  onNoShow,
  onSaveName,
  onResetCheckin,
  onMoveGuest,
  onToggleLock,
  onBalance,
  balancing,
}: {
  session: any;
  guests: SessionGuestRow[];
  team: AllocationGuide[];
  checkedInGuests: AllocationGuest[];
  onCheckInClick: (b: any) => void;
  onNoShow: (b: any) => void;
  onSaveName: (b: any, newName: string) => void;
  onResetCheckin: (b: any) => void;
  onMoveGuest: (bookingRef: string, newGuideId: string | null) => void;
  onToggleLock: (sessionId: string, guideId: string, locked: boolean) => void;
  onBalance: (sessionId: string) => void;
  balancing: boolean;
}) {
  const [tab, setTab] = useState<'checkin' | 'allocation'>('checkin');
  const [search, setSearch] = useState('');

  const totalGuests = guests.length;
  const checkedInCount = guests.filter(g => g.isCheckedIn).length;
  const pct = totalGuests > 0 ? Math.round((checkedInCount / totalGuests) * 100) : 0;

  const filteredGuests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter(g => g.displayName.toLowerCase().includes(q));
  }, [guests, search]);

  const filteredPax = filteredGuests.reduce((s, g) => s + g.pax, 0);

  return (
    <div className="aurelia-card overflow-hidden border border-white/5">
      <div className="bg-[#0f0f17] border-b border-white/5 px-4 md:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-extrabold text-lg truncate">{session.label || 'Untitled Session'}</h3>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
            <Clock size={12} /> {session.start_time || '—'}
          </p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setTab('checkin')}
            className={`px-3 md:px-4 py-2 text-[11px] md:text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'checkin' ? 'bg-gold text-black' : 'text-gray-400'}`}
          >
            Check-in
          </button>
          <button
            onClick={() => setTab('allocation')}
            className={`px-3 md:px-4 py-2 text-[11px] md:text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'allocation' ? 'bg-gold text-black' : 'text-gray-400'}`}
          >
            Allocation
          </button>
        </div>
      </div>

      <div className="p-4 md:p-5">
        {tab === 'checkin' ? (
          <div className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search guests…"
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm font-bold text-white placeholder:text-gray-500 focus:border-gold/50 outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-bold text-gray-400 mb-1.5">
                <span>{checkedInCount} / {totalGuests} checked in</span>
                <span className="text-gold">{pct}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gold transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {filteredGuests.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                {guests.length === 0 ? 'No guests in this session.' : 'No guests match your search.'}
              </p>
            ) : (
              <TourGroup
                time={session.start_time || ''}
                code={session.label || 'Session'}
                bookingsCount={filteredGuests.length}
                totalPax={filteredPax}
              >
                {filteredGuests.map(g => (
                  <GuestCard
                    key={g.booking.id}
                    booking={g.booking}
                    displayName={g.displayName}
                    isCheckedIn={g.isCheckedIn}
                    isNoShow={g.isNoShow}
                    checkedInAt={g.checkedInAt}
                    onCheckIn={() => onCheckInClick(g.booking)}
                    onNoShow={() => onNoShow(g.booking)}
                    editableName
                    isOwner
                    onSaveName={(newName) => onSaveName(g.booking, newName)}
                    onReset={g.isCheckedIn ? () => onResetCheckin(g.booking) : undefined}
                  />
                ))}
              </TourGroup>
            )}
          </div>
        ) : (
          <AllocationBoard
            guides={team}
            guests={checkedInGuests}
            isOwner
            onMoveGuest={onMoveGuest}
            onToggleLock={(guideId, locked) => onToggleLock(session.id, guideId, locked)}
            onBalance={() => onBalance(session.id)}
            balancing={balancing}
          />
        )}
      </div>
    </div>
  );
}
