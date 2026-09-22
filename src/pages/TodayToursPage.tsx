import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Clock, Calendar as CalendarIcon, Search, AlertTriangle, RefreshCw, MapPin, CalendarPlus, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { logChange } from '@/lib/changeLog';
import { computeBalance, pickLeastLoadedGuide } from '@/lib/allocationBalance';
import { localDateStr } from '@/lib/utils';
import GuestCard from '@/components/checkin/GuestCard';
import CheckinConfirmModal from '@/components/checkin/CheckinConfirmModal';
import TourGroup from '@/components/checkin/TourGroup';
import AllocationBoard, { AllocationGuide, AllocationGuest } from '@/components/checkin/AllocationBoard';
import SyncStatusIndicator from '@/components/checkin/SyncStatusIndicator';
import { enqueueRetry, useRetryQueueItems } from '@/lib/retryQueue';
import { findCheckinRow, writeCheckin, attachCheckinPhoto, deleteCheckin, mergeGuardingPending } from '@/lib/checkinWrites';
import { uploadCheckinPhoto } from '@/lib/checkinPhotos';
import { ARRIVAL_COLUMNS, ArrivalRow, formatArrivalStatus } from '@/lib/guideArrivals';
import { buildGuideInviteLinks, type GuideInviteTarget } from '@/lib/tourInvites';

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
  ticketPhoto: string | null;
}

export default function TodayToursPage() {
  const { user, profile } = useAuth();

  const [bookings, setBookings] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionBookings, setSessionBookings] = useState<any[]>([]);
  const [sessionGuides, setSessionGuides] = useState<any[]>([]);
  // Read-only: every assigned guide's "I've arrived" record for today's sessions. The owner sees
  // the whole company's rows; this board never writes them.
  const [arrivals, setArrivals] = useState<ArrivalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const [todayStrDate, setTodayStrDate] = useState(localDateStr());

  const [showConfirm, setShowConfirm] = useState<any | null>(null);
  const [balancingSessionId, setBalancingSessionId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Guards every setState below against firing after this page has unmounted (relevant now that
  // several async refreshes can be in flight at once: initial load, realtime-triggered refreshes,
  // and per-action refreshes).
  const mountedRef = useRef(true);

  // Actions currently queued/retrying — used both to render sync status and to stop refreshes
  // (manual, or realtime-triggered) from clobbering an optimistic card back to its pre-tap state
  // while its write is still in flight.
  const queueItems = useRetryQueueItems();
  const pendingBookingRefs = useMemo(() => new Set(queueItems.map(i => i.key)), [queueItems]);
  const stuckBookingRefs = useMemo(() => new Set(queueItems.filter(i => i.stuck).map(i => i.key)), [queueItems]);

  const loadData = async () => {
    if (!user) return;
    const today = localDateStr();
    setTodayStrDate(today);

    const [bRes, gRes, cRes, sessRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user.id).eq('travel_date', today).not('status', 'eq', 'CANCELLED').order('travel_time', { ascending: true }),
      supabase.from('guides').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('checkins').select('*').eq('user_id', user.id).eq('travel_date', today),
      supabase.from('tour_sessions').select('id, label, start_time, tour_date').eq('user_id', user.id).eq('tour_date', today).order('start_time', { ascending: true }),
    ]);
    if (!mountedRef.current) return;

    setBookings(bRes.data || []);
    setGuides(gRes.data || []);
    setCheckins(prev => mergeGuardingPending(cRes.data || [], prev, pendingBookingRefs));

    const sessionsData = sessRes.data || [];
    setSessions(sessionsData);
    const sessionIds = sessionsData.map((s: any) => s.id);

    if (sessionIds.length > 0) {
      const [sbRes, sgRes, arrRes] = await Promise.all([
        supabase.from('session_bookings').select('session_id, booking_ref, allotted_guide_id').eq('user_id', user.id).in('session_id', sessionIds),
        supabase.from('session_guides').select('session_id, guide_id, shuffle_locked, status').eq('user_id', user.id).in('session_id', sessionIds),
        supabase.from('guide_arrivals').select(ARRIVAL_COLUMNS).eq('user_id', user.id).in('session_id', sessionIds),
      ]);
      if (!mountedRef.current) return;
      setSessionBookings(prev => mergeGuardingPending(sbRes.data || [], prev, pendingBookingRefs));
      setSessionGuides(sgRes.data || []);
      setArrivals(arrRes.data || []);
    } else {
      setSessionBookings([]);
      setSessionGuides([]);
      setArrivals([]);
    }

    setLoading(false);
  };

  // Lightweight, silent refreshes of just one table's worth of state — used both after this
  // client's own writes and as the target of the realtime subscriptions below. None of these
  // touch `loading`, so they never trigger the full-page spinner; only the very first mount does.
  // Both guard any booking_ref with a write still in flight (queued/retrying) — a realtime event
  // or a manual refresh landing mid-retry must never revert an optimistic card back to its
  // pre-tap state.
  const refreshCheckins = async () => {
    if (!user) return;
    const { data } = await supabase.from('checkins').select('*').eq('user_id', user.id).eq('travel_date', todayStrDate);
    if (!mountedRef.current) return;
    setCheckins(prev => mergeGuardingPending(data || [], prev, pendingBookingRefs));
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
    setSessionBookings(prev => mergeGuardingPending(data || [], prev, pendingBookingRefs));
  };

  // Targeted refetch — used both after a lock toggle and as the target of the session_guides
  // realtime listener below (an assignment, reassignment, or a guide's own transfer).
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
  const refreshSessionGuidesRef = useRef(refreshSessionGuides);
  refreshSessionGuidesRef.current = refreshSessionGuides;

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
  // the affected slice of state whenever a checkins, session_bookings or session_guides row
  // actually changes — whether that change came from this owner, a guide, or another browser tab.
  // session_guides covers an assignment, a reassignment made here or on Dispatch, and a guide's
  // own reassign_my_slot transfer — all land here the same way, live.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`today-tours-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins', filter: `user_id=eq.${user.id}` },
        () => { refreshCheckinsRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_bookings', filter: `user_id=eq.${user.id}` },
        () => { refreshSessionBookingsRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_guides', filter: `user_id=eq.${user.id}` },
        () => { refreshSessionGuidesRef.current(); })
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

  // Full guide rows (incl. whatsapp) by id — the allocation board's own AllocationGuide shape
  // only carries id/name/locked, so this is looked up separately for the calendar/WhatsApp send.
  const guideById = useMemo(() => new Map(guides.map((g) => [g.id, g])), [guides]);

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

  // Arrival status text per session+guide, ready to render — "Arrived 8:58, on time" / "Arrived
  // 9:07, 7 min late". A guide with no row simply isn't in the map ("Not yet arrived").
  const arrivalStatusBySessionGuide = useMemo(() => {
    const m = new Map<string, string>();
    arrivals.forEach(a => m.set(
      `${a.session_id}:${a.guide_id}`,
      formatArrivalStatus(a.arrived_at, a.minutes_late, ', '),
    ));
    return m;
  }, [arrivals]);

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
        ticketPhoto: cRecord?.ticket_photo ?? null,
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
  //
  // Resilience: the card updates immediately (optimistic), then the actual write is handed to the
  // retry queue rather than awaited directly — a network drop mid-write never blocks the UI or
  // reverts the card, it just keeps retrying with backoff until it lands (see src/lib/retryQueue).
  // writeCheckin() re-derives insert-vs-update from a fresh read on every attempt (no DB unique
  // constraint on booking_ref+travel_date exists to upsert against), so a retry of a write that
  // actually succeeded but lost its response to the drop finds the row already in a terminal
  // status and no-ops instead of inserting a duplicate.
  // The photo (if any) is a SEPARATE retry-queue item, enqueued under the same booking_ref key
  // right after the check-in one — the queue chains same-key items in order (see
  // lib/retryQueue.ts), so the upload only starts once the check-in write has actually succeeded,
  // and never blocks or is bundled with it. A photo stuck retrying on bad signal never loses or
  // delays the check-in itself; the check-in is already durably saved by then.
  const recordCheckin = (b: any, status: 'checked_in' | 'no_show', photo: Blob | null = null) => {
    if (!user) return;

    const already = checkins.find(c => c.booking_ref === b.booking_ref);
    if (already?.status === 'checked_in' || already?.status === 'no_show') return;

    const nowIso = new Date().toISOString();
    const existingOverride = already?.display_name_override ?? null;

    setCheckins(prev => [
      ...prev.filter(c => c.booking_ref !== b.booking_ref),
      { booking_ref: b.booking_ref, status, checked_in_at: nowIso, display_name_override: existingOverride, ticket_photo: null },
    ]);

    // Auto-allot: pick the unlocked guide on this booking's session with the lowest current pax
    // total (same tie-break rule Balance uses). Decided once, at tap time, and baked into the
    // retried write — a delayed retry must apply the exact outcome already shown on screen, not
    // one recomputed from whatever state happens to exist whenever it finally runs.
    let targetGuideId: string | null = null;
    if (status === 'checked_in') {
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
        targetGuideId = pickLeastLoadedGuide(unlockedTeam, totals);
      }
    }
    if (targetGuideId) {
      setSessionBookings(prev => prev.map((sb: any) => (
        sb.booking_ref === b.booking_ref ? { ...sb, allotted_guide_id: targetGuideId } : sb
      )));
    }

    const totalPax = paxTotal(b);
    enqueueRetry(b.booking_ref, status === 'checked_in' ? 'Check-in' : 'No-show', async () => {
      await writeCheckin({
        userId: user.id,
        bookingRef: b.booking_ref,
        travelDate: todayStrDate,
        status,
        checkedInBy: 'Coordinator',
        pax: totalPax,
        ticketPhoto: null,
      });

      if (status === 'checked_in') {
        const { error } = await supabase.from('bookings').update({ status: 'DONE' }).eq('id', b.id);
        if (error) throw error;

        await logChange(supabase, user.id, {
          tableName: 'bookings',
          recordId: b.booking_ref,
          fieldName: 'status',
          oldValue: b.status || 'CONFIRMED',
          newValue: 'DONE',
          description: `${b.booking_ref} status changed to DONE (Checked In)`
        });

        if (targetGuideId) {
          const { error: allotError } = await supabase.from('session_bookings')
            .update({ allotted_guide_id: targetGuideId })
            .eq('user_id', user.id)
            .eq('booking_ref', b.booking_ref);
          if (allotError) throw allotError;
        }
      }

      // Refs, not the closed-over functions directly — a retry can fire minutes after the
      // original tap and must use whichever refresher version is current at that moment (the
      // same "always latest" pattern the realtime subscription relies on), not one frozen with
      // whatever sessions/sessionBookings existed back when this was first tapped.
      await refreshCheckinsRef.current();
      await refreshSessionBookingsRef.current();
    });

    if (photo) {
      enqueueRetry(b.booking_ref, 'Ticket photo', async () => {
        const path = await uploadCheckinPhoto({ userId: user.id, travelDate: todayStrDate, bookingRef: b.booking_ref, photo });
        await attachCheckinPhoto(user.id, b.booking_ref, todayStrDate, path);
        await refreshCheckinsRef.current();
      });
    }
  };

  const handleConfirmCheckin = (photo: Blob | null) => {
    if (!showConfirm) return;
    const b = showConfirm;
    setShowConfirm(null);
    recordCheckin(b, 'checked_in', photo);
  };

  // Saves a display-only name correction to checkins.display_name_override.
  // Never touches bookings — the master sheet sync is untouched by this.
  const handleSaveNameOverride = async (b: any, newName: string) => {
    if (!user) return;
    const trimmed = newName.trim();

    const existing = await findCheckinRow(user.id, b.booking_ref, todayStrDate);

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
  const handleResetCheckin = (b: any) => {
    if (!user) return;
    if (!confirm(`Reset check-in for ${getDisplayName(b)}? They'll return to not-checked-in.`)) return;

    setCheckins(prev => prev.filter(c => c.booking_ref !== b.booking_ref));
    setSessionBookings(prev => prev.map((sb: any) => (
      sb.booking_ref === b.booking_ref ? { ...sb, allotted_guide_id: null } : sb
    )));

    enqueueRetry(b.booking_ref, 'Reset', async () => {
      await deleteCheckin(user.id, b.booking_ref, todayStrDate);

      const { error } = await supabase.from('bookings').update({ status: 'UPCOMING' }).eq('id', b.id);
      if (error) throw error;

      const { error: allotError } = await supabase.from('session_bookings')
        .update({ allotted_guide_id: null })
        .eq('user_id', user.id)
        .eq('booking_ref', b.booking_ref);
      if (allotError) throw allotError;

      await logChange(supabase, user.id, {
        tableName: 'bookings',
        recordId: b.booking_ref,
        fieldName: 'status',
        oldValue: 'DONE',
        newValue: 'UPCOMING',
        description: `${b.booking_ref} check-in reset by owner`
      });

      await refreshCheckinsRef.current();
      await refreshSessionBookingsRef.current();
    });
  };

  // Owner-only: move a single checked-in guest to a different guide (or unassign to holding).
  const handleMoveGuest = (bookingRef: string, newGuideId: string | null) => {
    if (!user) return;

    setSessionBookings(prev => prev.map((sb: any) => (
      sb.booking_ref === bookingRef ? { ...sb, allotted_guide_id: newGuideId } : sb
    )));

    enqueueRetry(bookingRef, 'Move guide', async () => {
      const { error } = await supabase.from('session_bookings')
        .update({ allotted_guide_id: newGuideId })
        .eq('user_id', user.id)
        .eq('booking_ref', bookingRef);
      if (error) throw error;
      await refreshSessionBookingsRef.current();
    });
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

  return (
    <div className="relative">
      <div className="p-4 md:p-8 pb-32 max-w-5xl mx-auto space-y-8 animate-fade-in">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border/50">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-2">Today's Tours</h1>
            <div className="flex items-center gap-2 text-muted-foreground font-medium">
              <CalendarIcon size={16} className="text-gold" />
              <span>{todayStr}</span>
            </div>
            <div className="mt-2"><SyncStatusIndicator /></div>
          </div>
          <div className="text-right flex flex-col items-end gap-3">
            <div className="flex items-center justify-end gap-2 text-2xl font-mono font-bold text-gold drop-shadow-md mb-2">
              <Clock size={20} />
              <span>{timeStr}</span>
            </div>
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              title="Refresh"
              className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-muted/70 transition-all text-muted-foreground hover:text-gold disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* SUMMARY BAR */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="aurelia-card p-4 border-l-[3px] border-l-gold">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Sessions</p>
            <p className="text-2xl font-extrabold">{sessions.length}</p>
          </div>
          <div className="aurelia-card p-4 border-l-[3px] border-l-blue-500">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Pax Expected</p>
            <p className="text-2xl font-extrabold">{totalPaxExpected}</p>
          </div>
          <div className="aurelia-card p-4 border-l-[3px] border-l-green-500">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Pax Checked In</p>
            <p className="text-2xl font-extrabold text-green-700">{totalPaxChecked}</p>
          </div>
          <div className="aurelia-card p-4 border-l-[3px] border-l-purple-500">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Guides Assigned</p>
            <p className="text-2xl font-extrabold text-purple-700">{totalGuidesAssigned}</p>
          </div>
        </div>

        {unsessionedBookings.length > 0 && (
          <div className="flex items-start gap-3 text-sm bg-amber-600/10 border border-amber-600/20 text-amber-700 rounded-xl p-4">
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
                guideById={guideById}
                companyName={profile?.company_name}
                arrivalStatusByGuide={arrivalStatusBySessionGuide}
                checkedInGuests={sessionIdToCheckedInGuests.get(session.id) || []}
                onCheckInClick={(b: any) => setShowConfirm(b)}
                onNoShow={(b: any) => recordCheckin(b, 'no_show')}
                onSaveName={handleSaveNameOverride}
                onResetCheckin={handleResetCheckin}
                onMoveGuest={handleMoveGuest}
                onToggleLock={handleToggleLock}
                onBalance={handleBalance}
                balancing={balancingSessionId === session.id}
                stuckBookingRefs={stuckBookingRefs}
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
  guideById,
  companyName,
  arrivalStatusByGuide,
  checkedInGuests,
  onCheckInClick,
  onNoShow,
  onSaveName,
  onResetCheckin,
  onMoveGuest,
  onToggleLock,
  onBalance,
  balancing,
  stuckBookingRefs,
}: {
  session: any;
  guests: SessionGuestRow[];
  team: AllocationGuide[];
  /** Full guide rows (incl. whatsapp) by id, for the calendar/WhatsApp send below. */
  guideById: Map<string, GuideInviteTarget>;
  companyName?: string | null;
  /** Read-only arrival text keyed `${session_id}:${guide_id}`; absent = not yet arrived. */
  arrivalStatusByGuide: Map<string, string>;
  checkedInGuests: AllocationGuest[];
  onCheckInClick: (b: any) => void;
  onNoShow: (b: any) => void;
  onSaveName: (b: any, newName: string) => void;
  onResetCheckin: (b: any) => void;
  onMoveGuest: (bookingRef: string, newGuideId: string | null) => void;
  onToggleLock: (sessionId: string, guideId: string, locked: boolean) => void;
  onBalance: (sessionId: string) => void;
  balancing: boolean;
  stuckBookingRefs: Set<string>;
}) {
  const [tab, setTab] = useState<'checkin' | 'allocation'>('checkin');
  const [search, setSearch] = useState('');

  const totalGuests = guests.length;
  const checkedInCount = guests.filter(g => g.isCheckedIn).length;
  const pct = totalGuests > 0 ? Math.round((checkedInCount / totalGuests) * 100) : 0;
  // Unfiltered session total — the search box below only narrows the guest LIST, the invite
  // message below must always quote the whole session's pax, same as Dispatch's sPax.
  const sessionPax = guests.reduce((s, g) => s + g.pax, 0);

  const filteredGuests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter(g => g.displayName.toLowerCase().includes(q));
  }, [guests, search]);

  const filteredPax = filteredGuests.reduce((s, g) => s + g.pax, 0);

  return (
    <div className="aurelia-card overflow-hidden border border-border">
      <div className="bg-muted border-b border-border px-4 md:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-extrabold text-lg truncate">{session.label || 'Untitled Session'}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Clock size={12} /> {session.start_time || '—'}
          </p>
          {team.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {team.map(g => {
                const arrival = arrivalStatusByGuide.get(`${session.id}:${g.id}`);
                const guide = guideById.get(g.id);
                const { calendarUrl, whatsappUrl } = buildGuideInviteLinks(session, guide, sessionPax, companyName);
                return (
                  <div key={g.id} className="text-[11px]">
                    <p className="flex items-center gap-1.5">
                      <MapPin size={11} className={arrival ? 'text-green-700 shrink-0' : 'text-muted-foreground/50 shrink-0'} />
                      <span className="font-bold text-foreground">{g.name}</span>
                      <span className={arrival ? 'text-green-700 font-medium' : 'text-muted-foreground'}>
                        {arrival || 'Not yet arrived'}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 pl-[17px]">
                      <a
                        href={calendarUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold px-2 py-0.5 rounded-lg border border-border text-muted-foreground hover:text-gold hover:border-gold/30 transition-colors inline-flex items-center gap-1"
                      >
                        <CalendarPlus size={10} /> Add to Calendar
                      </a>
                      {whatsappUrl ? (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold px-2 py-0.5 rounded-lg border border-green-600/20 text-green-700 hover:bg-green-600/10 transition-colors inline-flex items-center gap-1"
                        >
                          <MessageCircle size={10} /> Send WhatsApp
                        </a>
                      ) : (
                        <span className="text-[9px] text-muted-foreground italic">no WhatsApp number</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex bg-background p-1 rounded-xl shrink-0">
          <button
            onClick={() => setTab('checkin')}
            className={`px-3 md:px-4 py-2 text-[11px] md:text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'checkin' ? 'bg-gold text-black' : 'text-muted-foreground'}`}
          >
            Check-in
          </button>
          <button
            onClick={() => setTab('allocation')}
            className={`px-3 md:px-4 py-2 text-[11px] md:text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'allocation' ? 'bg-gold text-black' : 'text-muted-foreground'}`}
          >
            Allocation
          </button>
        </div>
      </div>

      <div className="p-4 md:p-5">
        {tab === 'checkin' ? (
          <div className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search guests…"
                className="w-full bg-muted border border-border rounded-2xl pl-11 pr-4 py-3 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:border-gold/50 outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground mb-1.5">
                <span>{checkedInCount} / {totalGuests} checked in</span>
                <span className="text-gold">{pct}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gold transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {filteredGuests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
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
                    syncStuck={stuckBookingRefs.has(g.booking.booking_ref)}
                    ticketPhoto={g.ticketPhoto}
                  />
                ))}
              </TourGroup>
            )}
          </div>
        ) : (
          <AllocationBoard
            guides={team}
            guests={checkedInGuests}
            canControl
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
