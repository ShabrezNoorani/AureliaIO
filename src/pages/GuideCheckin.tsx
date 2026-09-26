import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import GuestCard from '@/components/checkin/GuestCard';
import CheckinConfirmModal from '@/components/checkin/CheckinConfirmModal';
import TourGroup from '@/components/checkin/TourGroup';
import type { AllocationGuide, AllocationGuest } from '@/components/checkin/AllocationBoard';
import GuideAllocationBoard, { GuideAllocationGuest } from '@/components/checkin/GuideAllocationBoard';
import SyncStatusIndicator from '@/components/checkin/SyncStatusIndicator';
import GuideArrivalCard from '@/components/checkin/GuideArrivalCard';
import { localDateStr, isCancelled, checkinTime } from '@/lib/utils';
import { logChange } from '@/lib/changeLog';
import { computeBalance } from '@/lib/allocationBalance';
import { matchBookingsToSessions, autoPopulateSessionBookings, pickBestSessionForBooking } from '@/lib/sessionAutoPopulate';
import { enqueueRetry, useRetryQueueItems, type QueueItem } from '@/lib/retryQueue';
import { writeCheckin, attachCheckinPhoto, deleteCheckin, mergeGuardingPending } from '@/lib/checkinWrites';
import { uploadCheckinPhoto } from '@/lib/checkinPhotos';
import {
  ARRIVAL_COLUMNS, ArrivalRow, arrivalRetryKey, buildArrivalPayload, formatArrivalStatus,
  getArrivalCoords, mergeArrivalsGuardingPending, saveArrival, sessionIdFromArrivalKey,
} from '@/lib/guideArrivals';
import { fetchCompanyGuides, transferTourToGuide, type CompanyGuide } from '@/lib/guideTransfer';
import TransferTourModal from '@/components/guide/TransferTourModal';

interface Booking {
  id: string;
  booking_ref: string;
  customer_name: string;
  customer_phone: string;
  travel_date: string;
  travel_time: string;
  product_code: string;
  product_name: string;
  option_name: string;
  channel: string;
  status: string;
  pax_adult: number;
  pax_youth: number;
  pax_child: number;
  pax_infant: number;
}

interface Checkin {
  booking_ref: string;
  status: string;
  checked_in_at: string;
  display_name_override?: string | null;
  ticket_photo?: string | null;
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
  allotted_guide_id: string | null;
}

// One row per (session, guide) pair, returned by the my_session_team() RPC for every session the
// logged-in guide belongs to — includes the guide's own row and is not status-case-sensitive
// (unlike my_company_guides(), which filters status = 'Active' and excludes the caller — correct
// for the transfer picker, wrong for the allocation board's name lookup). Deliberately carries NO
// pay fields — a guide's raw SELECT on session_guides is now restricted to their own row (pay
// privacy), so this RPC is the ONLY source for co-guide info, and it only ever exposes
// name/session/lock, never base_pay/bonus. This is what makes it safe to use here at all.
interface SessionTeamRow {
  id: string;
  name: string;
  session_id: string;
  shuffle_locked: boolean;
}

// This guide's OWN base_pay/bonus/checkin_time for one of their sessions today — read directly off
// their own session_guides row (RLS permits a guide to SELECT their own row; co-guides' rows are
// invisible to this same query, which is exactly why co-guide info above comes from
// my_session_team() instead). Never fetched for, or shown alongside, any other guide — check-in
// time isn't pay-sensitive, but this card still only ever shows this guide's own value.
interface MyPayRow {
  session_id: string;
  base_pay: number | null;
  bonus: number | null;
  checkin_time: string | null;
}

const paxTotal = (b: Booking) =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);

// The session ids among queued writes that are ARRIVALS (the queue also carries check-in writes,
// which are keyed by booking_ref and yield null here).
const toArrivalSessionIds = (items: QueueItem[]) => new Set(
  items.map(i => sessionIdFromArrivalKey(i.key)).filter((id): id is string => id !== null)
);

export default function GuideCheckin() {
  const { guideId, guideName, guideUserId } = useAuth();

  // RLS (via my_session_booking_refs()) already limits tour_sessions/session_bookings/bookings/
  // checkins reads to this guide's own sessions — no client-side guide_id filtering needed here.
  const [sessions, setSessions] = useState<TourSession[]>([]);
  const [sessionBookings, setSessionBookings] = useState<SessionBookingRow[]>([]);
  const [sessionTeamRows, setSessionTeamRows] = useState<SessionTeamRow[]>([]);
  const [myPay, setMyPay] = useState<MyPayRow[]>([]);
  // Today's non-cancelled bookings matching NO session at all, company-wide (via the
  // my_company_unsessioned_bookings() RPC — RLS otherwise only lets a guide read bookings already
  // linked to one of their own sessions, so this is the one company-wide exception). Shown as
  // "Unassigned — last-minute" so a guide can still check one in even though Dispatch never built
  // a session for it. Empty (not broken) if that RPC isn't deployed yet — see lib error handling.
  const [unsessionedBookings, setUnsessionedBookings] = useState<Booking[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [arrivals, setArrivals] = useState<ArrivalRow[]>([]);
  // Sessions whose arrival tap is mid-flight (waiting on the location fix) — distinct from the
  // retry queue, which only takes over once there's a payload to write.
  const [arrivingSessionIds, setArrivingSessionIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState<Booking | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Allocation board controls — a guide gets the exact same move/lock/balance capability the
  // owner has on TodayToursPage, for ANY guide on the session (not just themselves). RLS is what
  // actually enforces "session member" scope server-side; the writes below are unrestricted here.
  const [balancingSessionId, setBalancingSessionId] = useState<string | null>(null);

  // "Transfer to another guide" — hands one of this guide's OWN sessions off to a teammate via
  // reassign_my_slot (see lib/guideTransfer.ts). Same flow GuideHome.tsx offers on every upcoming
  // tour; this is the today-only, check-in-page equivalent.
  const [otherGuides, setOtherGuides] = useState<CompanyGuide[]>([]);
  const [transferSessionId, setTransferSessionId] = useState<string | null>(null);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Guards every setState below against firing after this page has unmounted.
  const mountedRef = useRef(true);

  // Actions currently queued/retrying — used both to render sync status and to stop refreshes
  // (manual, or realtime-triggered) from clobbering an optimistic card back to its pre-tap state
  // while its write is still in flight.
  const queueItems = useRetryQueueItems();
  const pendingBookingRefs = useMemo(() => new Set(queueItems.map(i => i.key)), [queueItems]);
  const stuckBookingRefs = useMemo(() => new Set(queueItems.filter(i => i.stuck).map(i => i.key)), [queueItems]);

  // Same queue, arrival-keyed slice of it (see arrivalRetryKey) — an arrival write still in
  // flight must not have its optimistic status reverted by a refresh landing mid-write.
  const queuedArrivalSessionIds = useMemo(() => toArrivalSessionIds(queueItems), [queueItems]);
  const stuckArrivalSessionIds = useMemo(() => toArrivalSessionIds(queueItems.filter(i => i.stuck)), [queueItems]);

  const today = localDateStr();
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // `silent` skips the setLoading toggle — used by the realtime effect below so an incoming
  // session_guides change (this guide gaining/losing a session, or a teammate's roster changing
  // on a shared one) quietly re-derives state instead of flashing the full-page spinner. The
  // initial mount load and the manual refresh button both want the spinner, so they leave it false.
  const loadData = async (silent = false) => {
    if (!guideId || !guideUserId) return;
    if (!silent) setLoading(true);

    // Only sessions this guide has actually ACCEPTED show up for check-in — offered-but-unanswered
    // and declined/reassigned sessions must never appear here.
    const [sgRes, otherGuidesData, sessionTeamRes, unsessionedRes] = await Promise.all([
      supabase.from('session_guides').select('session_id')
        .eq('user_id', guideUserId).eq('guide_id', guideId).eq('status', 'accepted'),
      // Transfer picker only — deliberately excludes self and is fine being case-sensitive on
      // status, since it's just "everyone else at the company".
      fetchCompanyGuides(supabase, guideId),
      // Allocation board's name lookup — every guide on any session this guide belongs to
      // (including themself), not status-case-sensitive. my_company_guides() is wrong here: it
      // excludes the caller and filters status = 'Active' against rows stored as 'active'.
      supabase.rpc('my_session_team'),
      // "Unassigned — last-minute" candidates — see the my_company_unsessioned_bookings() SQL
      // handed over separately; RLS otherwise never lets a guide see a booking with no session at
      // all. A missing RPC just yields an error here (data: null), so this degrades to an empty
      // list rather than breaking the page.
      supabase.rpc('my_company_unsessioned_bookings', { p_date: today }),
    ]);
    if (!mountedRef.current) return;
    setOtherGuides(otherGuidesData);
    setSessionTeamRows(sessionTeamRes.data || []);
    setUnsessionedBookings((unsessionedRes.data as unknown as Booking[]) || []);

    const acceptedSessionIds = (sgRes.data || []).map(sg => sg.session_id);
    if (acceptedSessionIds.length === 0) {
      setSessions([]);
      setSessionBookings([]);
      setMyPay([]);
      setBookings([]);
      setCheckins([]);
      setArrivals([]);
      if (!silent) setLoading(false);
      return;
    }

    const { data: sessionsData } = await supabase
      .from('tour_sessions')
      .select('id, label, start_time, tour_date')
      .eq('user_id', guideUserId)
      .eq('tour_date', today)
      .in('id', acceptedSessionIds)
      .order('start_time', { ascending: true });
    if (!mountedRef.current) return;

    const mySessions = sessionsData || [];
    setSessions(mySessions);

    const sessionIds = mySessions.map(s => s.id);
    if (sessionIds.length === 0) {
      setSessionBookings([]);
      setMyPay([]);
      setBookings([]);
      setCheckins([]);
      setArrivals([]);
      if (!silent) setLoading(false);
      return;
    }

    const [sbRes, payRes, arrRes] = await Promise.all([
      supabase.from('session_bookings').select('session_id, booking_ref, allotted_guide_id')
        .eq('user_id', guideUserId).in('session_id', sessionIds),
      // This guide's OWN pay + check-in time only — RLS permits a guide to SELECT their own
      // session_guides row; co-guides' base_pay/bonus/checkin_time are never fetched here (or
      // anywhere on this page — see sessionIdToTeam below, sourced entirely from
      // my_session_team() instead).
      supabase.from('session_guides').select('session_id, base_pay, bonus, checkin_time')
        .eq('user_id', guideUserId).eq('guide_id', guideId).eq('status', 'accepted').in('session_id', sessionIds),
      // This guide's OWN arrivals only (RLS allows nothing else) — so a reload shows the
      // recorded status instead of offering the button a second time.
      supabase.from('guide_arrivals').select(ARRIVAL_COLUMNS)
        .eq('user_id', guideUserId).eq('guide_id', guideId).in('session_id', sessionIds),
    ]);
    if (!mountedRef.current) return;

    const mySessionBookings = sbRes.data || [];
    setMyPay(payRes.data || []);
    setArrivals(prev => mergeArrivalsGuardingPending(arrRes.data || [], prev, queuedArrivalSessionIds));

    // Best-effort auto-population against THIS guide's own built sessions, using the company-wide
    // unsessioned candidates fetched above. Owner-side (TodayToursPage) is the reliable path for a
    // brand-new booking (their `bookings` read is never RLS-restricted); this is defense-in-depth
    // for whenever a guide's own INSERT on session_bookings is permitted too — see the SQL handed
    // over separately. Never touches allotted_guide_id, never runs Balance either way.
    let finalLinks = mySessionBookings;
    const autoMatches = matchBookingsToSessions(mySessions, mySessionBookings, unsessionedRes.data as unknown as Booking[] || []);
    if (autoMatches.length > 0) {
      await autoPopulateSessionBookings(supabase, guideUserId, autoMatches);
      const { data: freshLinks } = await supabase.from('session_bookings')
        .select('session_id, booking_ref, allotted_guide_id').eq('user_id', guideUserId).in('session_id', sessionIds);
      if (!mountedRef.current) return;
      finalLinks = freshLinks || mySessionBookings;
    }
    setSessionBookings(finalLinks);

    const refs = Array.from(new Set(finalLinks.map(sb => sb.booking_ref)));

    if (refs.length === 0) {
      setBookings([]);
      setCheckins([]);
      if (!silent) setLoading(false);
      return;
    }

    const [bRes, cRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', guideUserId).in('booking_ref', refs),
      supabase.from('checkins').select('booking_ref, status, checked_in_at, display_name_override, ticket_photo')
        .eq('user_id', guideUserId).eq('travel_date', today).in('booking_ref', refs),
    ]);
    if (!mountedRef.current) return;

    setBookings(bRes.data || []);
    setCheckins(prev => mergeGuardingPending(cRes.data || [], prev, pendingBookingRefs));
    if (!silent) setLoading(false);
  };

  // Lightweight, silent refreshes of just one table's worth of state — used both after this
  // guide's own writes and as the target of the realtime subscriptions below. Neither touches
  // `loading`, so neither triggers the full-page spinner; only the very first mount does. Both
  // guard any booking_ref with a write still in flight (queued/retrying) — a realtime event or a
  // manual refresh landing mid-retry must never revert an optimistic card back to its pre-tap
  // state.
  const refreshCheckins = async () => {
    if (!guideUserId) return;
    const refs = Array.from(new Set(sessionBookings.map(sb => sb.booking_ref)));
    if (refs.length === 0) {
      setCheckins([]);
      return;
    }
    const { data } = await supabase.from('checkins').select('booking_ref, status, checked_in_at, display_name_override, ticket_photo')
      .eq('user_id', guideUserId).eq('travel_date', today).in('booking_ref', refs);
    if (!mountedRef.current) return;
    setCheckins(prev => mergeGuardingPending(data || [], prev, pendingBookingRefs));
  };

  const refreshSessionBookings = async () => {
    if (!guideUserId) return;
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) {
      setSessionBookings([]);
      return;
    }
    const { data } = await supabase.from('session_bookings').select('session_id, booking_ref, allotted_guide_id')
      .eq('user_id', guideUserId).in('session_id', sessionIds);
    if (!mountedRef.current) return;
    setSessionBookings(prev => mergeGuardingPending(data || [], prev, pendingBookingRefs));
  };

  const refreshArrivals = async () => {
    if (!guideUserId || !guideId) return;
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) return;
    const { data } = await supabase.from('guide_arrivals').select(ARRIVAL_COLUMNS)
      .eq('user_id', guideUserId).eq('guide_id', guideId).in('session_id', sessionIds);
    if (!mountedRef.current) return;
    setArrivals(prev => mergeArrivalsGuardingPending(data || [], prev, queuedArrivalSessionIds));
  };

  // Targeted refetch of just the team roster (incl. shuffle_locked, via my_session_team() — a
  // guide's raw SELECT on session_guides only ever returns their own row now, so this RPC is the
  // only source for co-guide state). Used right after this guide's own lock toggle so the actor
  // sees it land immediately rather than waiting on the broader session_guides realtime round-trip
  // below.
  const refreshSessionTeam = async () => {
    if (!guideUserId) return;
    const { data } = await supabase.rpc('my_session_team');
    if (!mountedRef.current) return;
    setSessionTeamRows(data || []);
  };

  // Keeps the long-lived realtime subscription (set up once per guide, below) always calling the
  // LATEST version of these refreshers — they close over `sessions`/`sessionBookings`, which
  // change far more often than the subscription itself needs to re-establish.
  const refreshCheckinsRef = useRef(refreshCheckins);
  refreshCheckinsRef.current = refreshCheckins;
  const refreshSessionBookingsRef = useRef(refreshSessionBookings);
  refreshSessionBookingsRef.current = refreshSessionBookings;
  const refreshArrivalsRef = useRef(refreshArrivals);
  refreshArrivalsRef.current = refreshArrivals;
  // loadData itself closes over queuedArrivalSessionIds/pendingBookingRefs (both recomputed from
  // the retry queue on every render), so it needs the same "always latest" ref treatment as the
  // lighter refreshers above — the session_guides listener below can fire long after this effect
  // last ran.
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

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
  }, [guideId, guideUserId]);

  // Realtime replaces the old 30s interval poll: instead of reloading the whole page on a timer
  // (which visibly refreshed the screen and could interrupt a check-in in progress), quietly
  // refresh just the affected slice of state whenever a checkins or session_bookings row actually
  // changes — whether that change came from this guide, the owner, or another guide on the team.
  // The filter below is broad (scoped to the owner's user_id, not this guide specifically) because
  // RLS (my_session_booking_refs()) is what actually restricts which events this guide receives —
  // Realtime enforces RLS per-connection, so a guide never sees another session's events.
  //
  // session_guides also listens here (unlike checkins/session_bookings, it triggers a full
  // silent loadData() rather than a targeted refresher) — an assignment, reassignment or
  // guide-to-guide transfer can change WHICH sessions this guide even has, not just details on
  // sessions already known, so only re-deriving the whole accepted-session set is correct.
  useEffect(() => {
    if (!guideUserId) return;

    const channel = supabase
      .channel(`guide-checkin-${guideUserId}-${guideId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins', filter: `user_id=eq.${guideUserId}` },
        () => { refreshCheckinsRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_bookings', filter: `user_id=eq.${guideUserId}` },
        () => { refreshSessionBookingsRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_guides', filter: `user_id=eq.${guideUserId}` },
        () => { loadDataRef.current(true); })
      // A booking arriving/changing — re-derive the unsessioned list and re-run auto-population
      // against this guide's own sessions. Best-effort under today's RLS (see loadData's own
      // comment on my_company_unsessioned_bookings()); harmless either way, and the owner's page
      // performing the same write is the reliable path for a genuinely brand-new booking.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `user_id=eq.${guideUserId}` },
        () => { loadDataRef.current(true); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [guideUserId, guideId]);

  // booking_ref -> Booking, reused below both to build sessionBookingsMap and to resolve a full
  // Booking for the Allocation tab's "send back" control (which needs booking.id/status, not just
  // the trimmed-down fields AllocationGuest carries).
  const bookingByRef = useMemo(() => new Map(bookings.map(b => [b.booking_ref, b])), [bookings]);

  // Bookings grouped strictly by the session they belong to — a guide only ever sees the
  // sessions RLS returned for them, so two un-merged tours can never leak into each other.
  const sessionBookingsMap = useMemo(() => {
    const map = new Map<string, Booking[]>();
    sessionBookings.forEach(sb => {
      const b = bookingByRef.get(sb.booking_ref);
      if (!b) return;
      const arr = map.get(sb.session_id) || [];
      arr.push(b);
      map.set(sb.session_id, arr);
    });
    return map;
  }, [sessionBookings, bookingByRef]);

  // Every booking_ref already linked to one of THIS guide's own sessions — used to tell a normal
  // check-in from a last-minute one in handleConfirmCheckin below.
  const linkedBookingRefs = useMemo(() => new Set(sessionBookings.map(sb => sb.booking_ref)), [sessionBookings]);

  // Every guide on any of this guide's sessions today, sourced ENTIRELY from my_session_team() —
  // name, session_id AND shuffle_locked all come from that one RPC now, so there's no longer a
  // separate raw session_guides join here at all (co-guide pay privacy: a raw session_guides
  // SELECT would only return this guide's own row anyway, and even if it didn't, it must never be
  // the source for co-guide info — see the SessionTeamRow comment above).
  const sessionIdToTeam = useMemo(() => {
    const m = new Map<string, AllocationGuide[]>();
    sessionTeamRows.forEach(r => {
      const arr = m.get(r.session_id) || [];
      arr.push({ id: r.id, name: r.name, locked: r.shuffle_locked });
      m.set(r.session_id, arr);
    });
    return m;
  }, [sessionTeamRows]);

  // This guide's OWN base_pay/bonus, keyed by session — never any other guide's.
  const sessionIdToMyPay = useMemo(() => new Map(myPay.map(p => [p.session_id, p])), [myPay]);

  const getDisplayName = (b: Booking) => {
    const cRecord = checkins.find(c => c.booking_ref === b.booking_ref);
    const override = cRecord?.display_name_override;
    return override && String(override).trim() ? override : b.customer_name;
  };

  // EVERY guest in the session — checked-in AND not (auto-populated / pre-allotted guests
  // included, now that a session can hold not-yet-arrived guests too) — grouped by their CURRENT
  // session_bookings.allotted_guide_id, never the frozen checkins.checked_in_by, so a guest's
  // shown guide always reflects live allotment. Feeds both the Allocation board (so the
  // not-yet-arrived pool is visible/balanceable) and computeBalance, which needs isCheckedIn to
  // lock checked-in guests to their guide (safety rule: check-in = ownership — Balance must never
  // move them).
  const sessionIdToBalanceGuests = useMemo(() => {
    const m = new Map<string, AllocationGuest[]>();
    sessionBookings.forEach(sb => {
      const b = bookings.find(bk => bk.booking_ref === sb.booking_ref);
      if (!b || isCancelled(b.status)) return;
      const cRecord = checkins.find(c => c.booking_ref === sb.booking_ref);
      const arr = m.get(sb.session_id) || [];
      arr.push({
        bookingRef: sb.booking_ref,
        displayName: getDisplayName(b),
        pax: paxTotal(b),
        allottedGuideId: sb.allotted_guide_id,
        isCheckedIn: cRecord?.status === 'checked_in',
      });
      m.set(sb.session_id, arr);
    });
    return m;
  }, [sessionBookings, checkins, bookings]);

  // Allocation tab's own render data — same guests as above, just with option_name added for
  // display. Kept separate from sessionIdToBalanceGuests (which feeds computeBalance and must keep
  // AllocationGuest's exact shape) so this presentational addition can never affect the balance
  // algorithm's input.
  const sessionIdToAllocationGuests = useMemo(() => {
    const m = new Map<string, GuideAllocationGuest[]>();
    sessionIdToBalanceGuests.forEach((list, sessionId) => {
      m.set(sessionId, list.map(g => ({
        ...g,
        optionName: bookingByRef.get(g.bookingRef)?.option_name || '',
      })));
    });
    return m;
  }, [sessionIdToBalanceGuests, bookingByRef]);

  // Records a check-in or no-show. Only a checked-in confirmation also flips the booking to
  // DONE (matching the owner page's existing side effect) — nothing else ever touches bookings,
  // and the Google Sheet is never written to from here.
  //
  // Resilience: the card updates immediately (optimistic), then the actual write is handed to the
  // retry queue rather than awaited directly — a network drop mid-write never blocks the UI or
  // reverts the card, it just keeps retrying with backoff until it lands (see src/lib/retryQueue).
  // writeCheckin() re-derives insert-vs-update from a fresh read on every attempt (no DB unique
  // constraint on booking_ref+travel_date exists to upsert against), so a retry of a write that
  // actually succeeded but lost its response to the drop finds the row already in a terminal
  // status and no-ops instead of inserting a duplicate.
  //
  // The photo (if any) is a SEPARATE retry-queue item, enqueued under the same booking_ref key
  // right after the check-in one — the queue chains same-key items in order (see
  // lib/retryQueue.ts), so the photo upload only starts once the check-in write has actually
  // succeeded, and never blocks or is bundled with it. A photo stuck retrying on bad signal never
  // loses or delays the check-in itself; the check-in is already durably saved by then.
  const recordCheckin = (b: Booking, status: 'checked_in' | 'no_show', photo: Blob | null = null) => {
    if (!guideUserId) return;
    if (isCancelled(b.status)) return;

    const already = checkins.find(c => c.booking_ref === b.booking_ref);
    if (already?.status === 'checked_in' || already?.status === 'no_show') return;

    const nowIso = new Date().toISOString();
    const existingOverride = already?.display_name_override ?? null;

    setCheckins(prev => [
      ...prev.filter(c => c.booking_ref !== b.booking_ref),
      { booking_ref: b.booking_ref, status, checked_in_at: nowIso, display_name_override: existingOverride, ticket_photo: null },
    ]);

    // Auto-allot decided once, at tap time, and baked into the retried write — a delayed retry
    // must apply the exact same outcome the guide already sees on screen, not a value recomputed
    // from whatever state happens to exist when the retry finally runs.
    const targetGuideId = status === 'checked_in' ? guideId : null;
    if (targetGuideId) {
      setSessionBookings(prev => prev.map(sb => (
        sb.booking_ref === b.booking_ref ? { ...sb, allotted_guide_id: targetGuideId } : sb
      )));
    }

    const totalPax = paxTotal(b);
    enqueueRetry(b.booking_ref, status === 'checked_in' ? 'Check-in' : 'No-show', async () => {
      await writeCheckin({
        userId: guideUserId,
        bookingRef: b.booking_ref,
        travelDate: today,
        status,
        checkedInBy: guideName || 'Guide',
        pax: totalPax,
        ticketPhoto: null,
      });

      if (status === 'checked_in') {
        const { error } = await supabase.from('bookings').update({ status: 'DONE' }).eq('id', b.id);
        if (error) throw error;

        if (targetGuideId) {
          const { error: allotError } = await supabase.from('session_bookings')
            .update({ allotted_guide_id: targetGuideId })
            .eq('user_id', guideUserId)
            .eq('booking_ref', b.booking_ref);
          if (allotError) throw allotError;
        }
      }

      // Refs, not the closed-over functions directly — a retry can fire minutes after the
      // original tap, and must use whichever refresher version is current at that moment (the
      // same "always latest" pattern the realtime subscription below relies on), not one frozen
      // with whatever sessions/sessionBookings existed back when the guide first tapped.
      await refreshCheckinsRef.current();
      await refreshSessionBookingsRef.current();
    });

    if (photo) {
      enqueueRetry(b.booking_ref, 'Ticket photo', async () => {
        const path = await uploadCheckinPhoto({ userId: guideUserId, travelDate: today, bookingRef: b.booking_ref, photo });
        await attachCheckinPhoto(guideUserId, b.booking_ref, today, path);
        await refreshCheckinsRef.current();
      });
    }
  };

  // Records that the guide reached the meeting point, for the punctuality metric. Two rules
  // shape this: GPS is optional (a denial/failure/slow fix records the arrival without
  // coordinates rather than blocking it), and the arrival timestamp is the moment of the TAP —
  // never the moment the write eventually lands, which the retry queue may defer on bad signal.
  const handleArrive = async (session: TourSession) => {
    if (!guideUserId || !guideId) return;
    if (arrivingSessionIds.has(session.id)) return;

    const arrivedAt = new Date();
    setArrivingSessionIds(prev => new Set(prev).add(session.id));

    const coords = await getArrivalCoords();

    const payload = buildArrivalPayload({
      ownerUserId: guideUserId,
      sessionId: session.id,
      guideId,
      tourDate: session.tour_date,
      startTime: session.start_time,
      arrivedAt,
      coords,
    });

    if (mountedRef.current) {
      // Optimistic — the status replaces the button straight away; the write below is what
      // catches up, retrying through bad signal at the meeting point.
      setArrivals(prev => [...prev.filter(a => a.session_id !== session.id), payload]);
      setArrivingSessionIds(prev => {
        const next = new Set(prev);
        next.delete(session.id);
        return next;
      });
    }

    // Enqueued unconditionally, even if this page unmounted during the location fix — the queue
    // lives at module scope, so navigating away mid-tap still lands the arrival.
    enqueueRetry(arrivalRetryKey(session.id), 'Arrival', async () => {
      await saveArrival(payload);
      await refreshArrivalsRef.current();
    });
  };

  // Last-minute check-in: this booking (from the "Unassigned — last-minute" list) matches no
  // session at all yet. Attaches it to whichever of THIS GUIDE'S OWN sessions today BEST matches
  // (same option+window ranking as auto-population — see pickBestSessionForBooking), e.g. a guide
  // running a 9:00 Cathedral and an 11:00 Louvre must not have a last-minute Louvre guest dumped
  // on the earlier Cathedral session just because it's earliest.
  //
  // Unlike the owner (who has Dispatch to fix this properly and so just blocks when nothing
  // matches — see TodayToursPage), a guide in the field always needs somewhere to put a guest
  // right now: when NOTHING matches, this falls back to their earliest session today. Either way
  // the guest is correctable afterward via the existing manual move controls.
  //
  // Attaches as a normal, unallotted session_bookings row (same shape auto-population writes),
  // then hands off to the ordinary recordCheckin, which already just allots straight to `guideId`
  // on check-in (no session-scoped lookup needed there, unlike the owner's least-loaded-team
  // logic). The link insert is retry-queued under the SAME booking_ref key as the check-in itself,
  // so it's guaranteed to land first (same-key retry items run strictly in order).
  const handleCheckInLastMinute = (b: Booking, photo: Blob | null = null) => {
    if (!guideUserId) return;
    if (sessions.length === 0) {
      toast.error("You don't have a session today to attach this check-in to.");
      return;
    }
    const bestSessionId = pickBestSessionForBooking(sessions, sessionBookings, bookings, b);
    const targetSessionId = bestSessionId
      ?? [...sessions].sort((a, b2) => (a.start_time || '').localeCompare(b2.start_time || ''))[0].id;

    setSessionBookings(prev => [...prev, { session_id: targetSessionId, booking_ref: b.booking_ref, allotted_guide_id: null }]);

    enqueueRetry(b.booking_ref, 'Link session', async () => {
      const { error } = await supabase.from('session_bookings').insert({
        user_id: guideUserId, session_id: targetSessionId, booking_ref: b.booking_ref, allotted_guide_id: null,
      });
      // A duplicate-key error just means this booking is already linked (auto-population may have
      // beaten this to it, or a retry of this very step already landed) — nothing left to do.
      if (error && error.code !== '23505') throw error;
    });

    recordCheckin(b, 'checked_in', photo);
  };

  const handleConfirmCheckin = (photo: Blob | null) => {
    if (!showConfirm) return;
    const b = showConfirm;
    setShowConfirm(null);
    if (linkedBookingRefs.has(b.booking_ref)) {
      recordCheckin(b, 'checked_in', photo);
    } else {
      handleCheckInLastMinute(b, photo);
    }
  };

  // Reverts a wrongly checked-in guest: deletes their checkins row for today, puts the booking
  // back to UPCOMING, and clears their allotment. RLS already scopes every one of these writes to
  // this guide's own sessions (via my_session_booking_refs()), so a guide can never reset a guest
  // outside their own tours — this is a deliberate manual override, so moving status away from
  // DONE here is intentional, not a bug.
  const handleResetCheckin = (b: Booking) => {
    if (!guideUserId) return;
    if (!confirm(`Reset check-in for ${getDisplayName(b)}? They'll return to not-checked-in.`)) return;

    setCheckins(prev => prev.filter(c => c.booking_ref !== b.booking_ref));
    setSessionBookings(prev => prev.map(sb => (
      sb.booking_ref === b.booking_ref ? { ...sb, allotted_guide_id: null } : sb
    )));

    enqueueRetry(b.booking_ref, 'Reset', async () => {
      await deleteCheckin(guideUserId, b.booking_ref, today);

      const { error } = await supabase.from('bookings').update({ status: 'UPCOMING' }).eq('id', b.id);
      if (error) throw error;

      const { error: allotError } = await supabase.from('session_bookings')
        .update({ allotted_guide_id: null })
        .eq('user_id', guideUserId)
        .eq('booking_ref', b.booking_ref);
      if (allotError) throw allotError;

      await logChange(supabase, guideUserId, {
        tableName: 'bookings',
        recordId: b.booking_ref,
        fieldName: 'status',
        oldValue: 'DONE',
        newValue: 'UPCOMING',
        description: `${b.booking_ref} check-in reset by guide ${guideName || ''}`.trim()
      });

      await refreshCheckinsRef.current();
      await refreshSessionBookingsRef.current();
    });
  };

  // Allocation tab's "send back" control — same revert as the Check-in tab's Reset button, just
  // resolved from a bookingRef (all the Allocation view carries) back to the full Booking object
  // handleResetCheckin needs.
  const handleUndoCheckin = (bookingRef: string) => {
    const b = bookingByRef.get(bookingRef);
    if (b) handleResetCheckin(b);
  };

  // Allocation board — identical to TodayToursPage's owner handlers (same tables, same fields,
  // same retry/resilience pattern), just scoped through guideUserId instead of the owner's own
  // `user.id`. Any guide on the session can move/lock/balance every guide's column, not only
  // their own — RLS on session_bookings/session_guides is what actually authorizes that for a
  // session member; nothing here restricts it to "my own allotment".
  const handleMoveGuest = (bookingRef: string, newGuideId: string | null) => {
    if (!guideUserId) return;

    setSessionBookings(prev => prev.map(sb => (
      sb.booking_ref === bookingRef ? { ...sb, allotted_guide_id: newGuideId } : sb
    )));

    enqueueRetry(bookingRef, 'Move guide', async () => {
      const { error } = await supabase.from('session_bookings')
        .update({ allotted_guide_id: newGuideId })
        .eq('user_id', guideUserId)
        .eq('booking_ref', bookingRef);
      if (error) throw error;
      await refreshSessionBookingsRef.current();
    });
  };

  // Lock/unlock a guide on a session — locked guides and their guests are excluded from Balance
  // entirely. Not queued (same as the owner's version): small, single-row write, awaited directly
  // so the confirm state on the button itself is the only feedback needed.
  const handleToggleLock = async (sessionId: string, guideId: string, locked: boolean) => {
    if (!guideUserId) return;
    await supabase.from('session_guides')
      .update({ shuffle_locked: locked })
      .eq('user_id', guideUserId)
      .eq('session_id', sessionId)
      .eq('guide_id', guideId);
    await refreshSessionTeam();
  };

  // Runs the shared Balance algorithm (lib/allocationBalance.ts — same function TodayToursPage
  // calls, never forked) for one session and persists the resulting moves.
  const handleBalance = async (sessionId: string) => {
    if (!guideUserId) return;
    const teamGuides = sessionIdToTeam.get(sessionId) || [];
    const balanceGuests = sessionIdToBalanceGuests.get(sessionId) || [];

    const result = computeBalance(
      teamGuides.map(g => ({ id: g.id, locked: g.locked })),
      balanceGuests.map(g => ({ bookingRef: g.bookingRef, pax: g.pax, allottedGuideId: g.allottedGuideId, isCheckedIn: g.isCheckedIn }))
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
          .eq('user_id', guideUserId)
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

  const openTransfer = (sessionId: string) => {
    setTransferSessionId(sessionId);
    setTransferTargetId('');
  };

  const handleTransfer = async () => {
    if (!transferSessionId || !transferTargetId) return;
    setTransferring(true);
    try {
      const { error } = await transferTourToGuide(supabase, transferSessionId, transferTargetId);
      if (error) throw new Error(error);
      setTransferSessionId(null);
      // The realtime listener above will also pick this up, but an explicit reload here means
      // the tour is gone from this guide's list the instant the confirm button resolves, not
      // whenever the Postgres change notification happens to arrive.
      await loadData();
    } catch (e) {
      console.error('Failed to transfer tour:', e);
      alert('Failed to transfer. Please try again.');
    } finally {
      setTransferring(false);
    }
  };

  const sessionsWithBookings = sessions.filter(s => (sessionBookingsMap.get(s.id) || []).length > 0);
  const sessionById = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions]);

  const arrivalStatusBySession = useMemo(() => {
    const m = new Map<string, string>();
    arrivals.forEach(a => m.set(a.session_id, formatArrivalStatus(a.arrived_at, a.minutes_late)));
    return m;
  }, [arrivals]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-fade-in max-w-[480px] sm:max-w-2xl lg:max-w-5xl mx-auto">
        <div className="pt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight mb-1">Today's Check-in</h1>
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
              <CalendarIcon size={14} className="text-gold" />
              <span>{todayStr}</span>
            </div>
            <div className="mt-2"><SyncStatusIndicator /></div>
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Refresh"
            className="min-h-11 min-w-11 flex items-center justify-center bg-muted border border-border rounded-xl text-muted-foreground hover:text-gold hover:bg-muted/70 transition-all disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* UNASSIGNED — LAST-MINUTE: today's company bookings matching no session at all (see
            my_company_unsessioned_bookings() — the SQL handed over separately; empty until that's
            applied, never broken). Only shown once this guide has at least one session today —
            checking one in attaches it to whichever of this guide's own sessions BEST matches, or
            their earliest if none does (see handleCheckInLastMinute /
            pickBestSessionForBooking). */}
        {!loading && sessions.length > 0 && unsessionedBookings.length > 0 && (
          <div className="border border-amber-600/20 bg-amber-600/5 rounded-2xl overflow-hidden">
            <div className="flex items-start gap-3 text-sm text-amber-700 p-4 pb-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                <strong>{unsessionedBookings.length}</strong> booking{unsessionedBookings.length !== 1 ? 's' : ''} today {unsessionedBookings.length !== 1 ? "don't match" : "doesn't match"} a built session — check {unsessionedBookings.length !== 1 ? 'them' : 'it'} in below.
              </span>
            </div>
            <div className="px-4 pb-4 space-y-1.5">
              {unsessionedBookings.map(b => {
                const cRecord = checkins.find(c => c.booking_ref === b.booking_ref);
                const isDone = cRecord?.status === 'checked_in';
                const isNoShow = cRecord?.status === 'no_show';
                return (
                  <GuestCard
                    key={b.id}
                    booking={b}
                    displayName={getDisplayName(b)}
                    isCheckedIn={isDone}
                    isNoShow={isNoShow}
                    checkedInAt={cRecord?.checked_in_at}
                    onCheckIn={() => setShowConfirm(b)}
                    onNoShow={() => recordCheckin(b, 'no_show')}
                    onReset={isDone ? () => handleResetCheckin(b) : undefined}
                    syncStuck={stuckBookingRefs.has(b.booking_ref)}
                    isCancelled={isCancelled(b.status)}
                    ticketPhoto={cRecord?.ticket_photo}
                  />
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
            <div className="w-8 h-8 border-4 border-gold border-t-transparent animate-spin rounded-full" />
            <div className="text-[10px] font-bold uppercase tracking-[0.2em]">Synchronizing...</div>
          </div>
        ) : sessionsWithBookings.length === 0 ? (
          <div className="text-center py-20 opacity-30">
            <div className="text-6xl mb-4 text-center">📭</div>
            <p className="text-sm font-bold uppercase tracking-widest">No tours assigned today</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sessionsWithBookings.map(session => {
              const sessionBookingsList = sessionBookingsMap.get(session.id) || [];
              // A cancelled guest never counts toward the pax total used for allocation/balancing.
              const totalPax = sessionBookingsList.reduce((sum, b) => sum + (isCancelled(b.status) ? 0 : paxTotal(b)), 0);

              const teamGuides = sessionIdToTeam.get(session.id) || [];
              const allocationGuests = sessionIdToAllocationGuests.get(session.id) || [];
              const myPayForSession = sessionIdToMyPay.get(session.id) ?? null;

              return (
                <GuideSessionCard
                  key={session.id}
                  session={session}
                  guideId={guideId}
                  sessionBookingsList={sessionBookingsList}
                  totalPax={totalPax}
                  checkins={checkins}
                  teamGuides={teamGuides}
                  allocationGuests={allocationGuests}
                  myPay={myPayForSession}
                  arrivalStatus={arrivalStatusBySession.get(session.id) ?? null}
                  arriving={arrivingSessionIds.has(session.id)}
                  arrivalSyncStuck={stuckArrivalSessionIds.has(session.id)}
                  stuckBookingRefs={stuckBookingRefs}
                  getDisplayName={getDisplayName}
                  onArrive={() => handleArrive(session)}
                  onTransfer={() => openTransfer(session.id)}
                  onCheckInClick={(b) => setShowConfirm(b)}
                  onNoShow={(b) => recordCheckin(b, 'no_show')}
                  onReset={(b) => handleResetCheckin(b)}
                  balancing={balancingSessionId === session.id}
                  onMoveGuest={handleMoveGuest}
                  onToggleLock={(gId, locked) => handleToggleLock(session.id, gId, locked)}
                  onBalance={() => handleBalance(session.id)}
                  onUndoCheckin={handleUndoCheckin}
                />
              );
            })}
          </div>
        )}
      </div>

      {showConfirm && (
        <CheckinConfirmModal
          customerName={getDisplayName(showConfirm)}
          pax={{ adult: showConfirm.pax_adult, youth: showConfirm.pax_youth, child: showConfirm.pax_child, infant: showConfirm.pax_infant }}
          onConfirm={handleConfirmCheckin}
          onCancel={() => setShowConfirm(null)}
        />
      )}

      {transferSessionId && (
        <TransferTourModal
          sessionLabel={sessionById.get(transferSessionId)?.label || 'This tour'}
          guides={otherGuides}
          targetId={transferTargetId}
          onTargetChange={setTransferTargetId}
          onConfirm={handleTransfer}
          onCancel={() => setTransferSessionId(null)}
          submitting={transferring}
        />
      )}
    </div>
  );
}

// ────────── SESSION CARD (Check-in / Allocation tabs) — mirrors TodayToursPage's SessionBoard ──────────

function GuideSessionCard({
  session,
  guideId,
  sessionBookingsList,
  totalPax,
  checkins,
  teamGuides,
  allocationGuests,
  myPay,
  arrivalStatus,
  arriving,
  arrivalSyncStuck,
  stuckBookingRefs,
  getDisplayName,
  onArrive,
  onTransfer,
  onCheckInClick,
  onNoShow,
  onReset,
  balancing,
  onMoveGuest,
  onToggleLock,
  onBalance,
  onUndoCheckin,
}: {
  session: TourSession;
  guideId: string | null;
  sessionBookingsList: Booking[];
  totalPax: number;
  checkins: Checkin[];
  teamGuides: AllocationGuide[];
  allocationGuests: GuideAllocationGuest[];
  /** This guide's OWN base_pay/bonus/checkin_time for this session — never any other guide's.
      Null until the owner has set a pay figure or check-in override for this guide. */
  myPay: MyPayRow | null;
  arrivalStatus: string | null;
  arriving: boolean;
  arrivalSyncStuck: boolean;
  stuckBookingRefs: Set<string>;
  getDisplayName: (b: Booking) => string;
  onArrive: () => void;
  onTransfer: () => void;
  onCheckInClick: (b: Booking) => void;
  onNoShow: (b: Booking) => void;
  onReset: (b: Booking) => void;
  balancing: boolean;
  onMoveGuest: (bookingRef: string, newGuideId: string | null) => void;
  onToggleLock: (guideId: string, locked: boolean) => void;
  onBalance: () => void;
  onUndoCheckin: (bookingRef: string) => void;
}) {
  const [tab, setTab] = useState<'checkin' | 'allocation'>('checkin');
  // Pay is genuinely optional — a myPay row with both fields null means "not tracked", not "€0
  // confirmed", so the line is omitted entirely rather than showing a fabricated "Your pay: €0".
  const hasMyPay = !!myPay && (myPay.base_pay != null || myPay.bonus != null);
  const myPayTotal = hasMyPay ? (Number(myPay!.base_pay) || 0) + (Number(myPay!.bonus) || 0) : null;

  return (
    <div className="aurelia-card overflow-hidden border border-border">
      <div className="bg-muted border-b border-border px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-extrabold text-base sm:text-lg truncate">{session.label || 'Untitled Session'}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
            <Clock size={12} className="shrink-0" />
            {/* This guide's OWN check-in time — their session_guides.checkin_time when the owner
                has set one, otherwise falling back to the tour−15 default. Never a co-guide's. */}
            <span>Check-in {myPay?.checkin_time || checkinTime(session.start_time) || '—'}</span>
            <span className="text-muted-foreground/50">&middot;</span>
            <span>Tour {session.start_time || '—'}</span>
          </p>
          {myPayTotal !== null && (
            <p className="text-xs font-bold text-gold mt-0.5">Your pay: €{myPayTotal.toLocaleString()}</p>
          )}
        </div>
        <button
          onClick={onTransfer}
          className="min-h-11 text-[11px] font-bold uppercase text-muted-foreground hover:text-gold border border-border hover:border-gold/30 rounded-lg px-3 shrink-0 transition-colors"
        >
          Transfer to another guide
        </button>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        <GuideArrivalCard
          status={arrivalStatus}
          pending={arriving}
          syncStuck={arrivalSyncStuck}
          onArrive={onArrive}
        />

        {/* TABS — same pattern as the owner's Today's Tours board (pill buttons, gold = active),
            sized min-h-11 (44px) so they're comfortably tappable on a 375px phone. */}
        <div className="flex bg-background p-1 rounded-xl">
          <button
            onClick={() => setTab('checkin')}
            className={`flex-1 min-h-11 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'checkin' ? 'bg-gold text-black' : 'text-muted-foreground'}`}
          >
            Check-in
          </button>
          <button
            onClick={() => setTab('allocation')}
            className={`flex-1 min-h-11 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${tab === 'allocation' ? 'bg-gold text-black' : 'text-muted-foreground'}`}
          >
            Allocation
          </button>
        </div>

        {tab === 'checkin' ? (
          <TourGroup
            time={session.start_time || ''}
            code={session.label || 'Session'}
            bookingsCount={sessionBookingsList.length}
            totalPax={totalPax}
          >
            {sessionBookingsList.map(b => {
              const cRecord = checkins.find(c => c.booking_ref === b.booking_ref);
              const isDone = cRecord?.status === 'checked_in';
              const isNoShow = cRecord?.status === 'no_show';

              return (
                <GuestCard
                  key={b.id}
                  booking={b}
                  displayName={getDisplayName(b)}
                  isCheckedIn={isDone}
                  isNoShow={isNoShow}
                  checkedInAt={cRecord?.checked_in_at}
                  onCheckIn={() => onCheckInClick(b)}
                  onNoShow={() => onNoShow(b)}
                  onReset={isDone ? () => onReset(b) : undefined}
                  syncStuck={stuckBookingRefs.has(b.booking_ref)}
                  isCancelled={isCancelled(b.status)}
                  ticketPhoto={cRecord?.ticket_photo}
                />
              );
            })}
          </TourGroup>
        ) : (
          <GuideAllocationBoard
            guides={teamGuides}
            guests={allocationGuests}
            highlightGuideId={guideId || undefined}
            onMoveGuest={onMoveGuest}
            onToggleLock={onToggleLock}
            onBalance={onBalance}
            balancing={balancing}
            onUndoCheckin={onUndoCheckin}
          />
        )}
      </div>
    </div>
  );
}
