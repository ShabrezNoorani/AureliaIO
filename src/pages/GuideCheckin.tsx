import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Calendar as CalendarIcon, RefreshCw } from 'lucide-react';
import GuestCard from '@/components/checkin/GuestCard';
import CheckinConfirmModal from '@/components/checkin/CheckinConfirmModal';
import TourGroup from '@/components/checkin/TourGroup';
import AllocationBoard, { AllocationGuide, AllocationGuest } from '@/components/checkin/AllocationBoard';
import { localDateStr } from '@/lib/utils';
import { logChange } from '@/lib/changeLog';

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

interface SessionGuideRow {
  session_id: string;
  guide_id: string;
  shuffle_locked: boolean;
}

interface GuideProfile {
  id: string;
  name: string;
}

const paxTotal = (b: Booking) =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);

export default function GuideCheckin() {
  const { guideId, guideName, guideUserId } = useAuth();

  // RLS (via my_session_booking_refs()) already limits tour_sessions/session_bookings/bookings/
  // checkins reads to this guide's own sessions — no client-side guide_id filtering needed here.
  const [sessions, setSessions] = useState<TourSession[]>([]);
  const [sessionBookings, setSessionBookings] = useState<SessionBookingRow[]>([]);
  const [teamSessionGuides, setTeamSessionGuides] = useState<SessionGuideRow[]>([]);
  const [guideProfiles, setGuideProfiles] = useState<GuideProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState<Booking | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Guards every setState below against firing after this page has unmounted.
  const mountedRef = useRef(true);

  const today = localDateStr();
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const loadData = async () => {
    if (!guideId || !guideUserId) return;
    setLoading(true);

    // Only sessions this guide has actually ACCEPTED show up for check-in — offered-but-unanswered
    // and declined/reassigned sessions must never appear here.
    const { data: sgData } = await supabase
      .from('session_guides')
      .select('session_id')
      .eq('user_id', guideUserId)
      .eq('guide_id', guideId)
      .eq('status', 'accepted');
    if (!mountedRef.current) return;

    const acceptedSessionIds = (sgData || []).map(sg => sg.session_id);
    if (acceptedSessionIds.length === 0) {
      setSessions([]);
      setSessionBookings([]);
      setTeamSessionGuides([]);
      setGuideProfiles([]);
      setBookings([]);
      setCheckins([]);
      setLoading(false);
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
      setTeamSessionGuides([]);
      setGuideProfiles([]);
      setBookings([]);
      setCheckins([]);
      setLoading(false);
      return;
    }

    const [sbRes, teamRes] = await Promise.all([
      supabase.from('session_bookings').select('session_id, booking_ref, allotted_guide_id')
        .eq('user_id', guideUserId).in('session_id', sessionIds),
      // The full accepted roster for these sessions (not just this guide) — the allocation
      // board is a team view so a guide can see where everyone stands, read-only.
      supabase.from('session_guides').select('session_id, guide_id, shuffle_locked')
        .eq('user_id', guideUserId).eq('status', 'accepted').in('session_id', sessionIds),
    ]);
    if (!mountedRef.current) return;

    const mySessionBookings = sbRes.data || [];
    setSessionBookings(mySessionBookings);
    const teamGuides = teamRes.data || [];
    setTeamSessionGuides(teamGuides);

    const refs = Array.from(new Set(mySessionBookings.map(sb => sb.booking_ref)));
    const teamGuideIds = Array.from(new Set(teamGuides.map(tg => tg.guide_id)));

    if (refs.length === 0) {
      setBookings([]);
      setCheckins([]);
      setGuideProfiles([]);
      setLoading(false);
      return;
    }

    const [bRes, cRes, gRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', guideUserId).in('booking_ref', refs),
      supabase.from('checkins').select('booking_ref, status, checked_in_at, display_name_override')
        .eq('user_id', guideUserId).eq('travel_date', today).in('booking_ref', refs),
      teamGuideIds.length > 0
        ? supabase.from('guides').select('id, name').eq('user_id', guideUserId).in('id', teamGuideIds)
        : Promise.resolve({ data: [] as GuideProfile[] }),
    ]);
    if (!mountedRef.current) return;

    setBookings(bRes.data || []);
    setCheckins(cRes.data || []);
    setGuideProfiles((gRes.data as GuideProfile[]) || []);
    setLoading(false);
  };

  // Lightweight, silent refreshes of just one table's worth of state — used both after this
  // guide's own writes and as the target of the realtime subscriptions below. Neither touches
  // `loading`, so neither triggers the full-page spinner; only the very first mount does.
  const refreshCheckins = async () => {
    if (!guideUserId) return;
    const refs = Array.from(new Set(sessionBookings.map(sb => sb.booking_ref)));
    if (refs.length === 0) {
      setCheckins([]);
      return;
    }
    const { data } = await supabase.from('checkins').select('booking_ref, status, checked_in_at, display_name_override')
      .eq('user_id', guideUserId).eq('travel_date', today).in('booking_ref', refs);
    if (!mountedRef.current) return;
    setCheckins(data || []);
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
    setSessionBookings(data || []);
  };

  // Keeps the long-lived realtime subscription (set up once per guide, below) always calling the
  // LATEST version of these refreshers — they close over `sessions`/`sessionBookings`, which
  // change far more often than the subscription itself needs to re-establish.
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
  }, [guideId, guideUserId]);

  // Realtime replaces the old 30s interval poll: instead of reloading the whole page on a timer
  // (which visibly refreshed the screen and could interrupt a check-in in progress), quietly
  // refresh just the affected slice of state whenever a checkins or session_bookings row actually
  // changes — whether that change came from this guide, the owner, or another guide on the team.
  // The filter below is broad (scoped to the owner's user_id, not this guide specifically) because
  // RLS (my_session_booking_refs()) is what actually restricts which events this guide receives —
  // Realtime enforces RLS per-connection, so a guide never sees another session's events.
  useEffect(() => {
    if (!guideUserId) return;

    const channel = supabase
      .channel(`guide-checkin-${guideUserId}-${guideId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins', filter: `user_id=eq.${guideUserId}` },
        () => { refreshCheckinsRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_bookings', filter: `user_id=eq.${guideUserId}` },
        () => { refreshSessionBookingsRef.current(); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [guideUserId, guideId]);

  // Bookings grouped strictly by the session they belong to — a guide only ever sees the
  // sessions RLS returned for them, so two un-merged tours can never leak into each other.
  const sessionBookingsMap = useMemo(() => {
    const bookingByRef = new Map(bookings.map(b => [b.booking_ref, b]));
    const map = new Map<string, Booking[]>();
    sessionBookings.forEach(sb => {
      const b = bookingByRef.get(sb.booking_ref);
      if (!b) return;
      const arr = map.get(sb.session_id) || [];
      arr.push(b);
      map.set(sb.session_id, arr);
    });
    return map;
  }, [sessionBookings, bookings]);

  const sessionIdToTeam = useMemo(() => {
    const m = new Map<string, AllocationGuide[]>();
    teamSessionGuides.forEach(tg => {
      const profile = guideProfiles.find(g => g.id === tg.guide_id);
      if (!profile) return;
      const arr = m.get(tg.session_id) || [];
      arr.push({ id: tg.guide_id, name: profile.name, locked: tg.shuffle_locked });
      m.set(tg.session_id, arr);
    });
    return m;
  }, [teamSessionGuides, guideProfiles]);

  const findCheckinRow = async (bookingRef: string) => {
    if (!guideUserId) return null;
    const { data } = await supabase
      .from('checkins')
      .select('*')
      .eq('user_id', guideUserId)
      .eq('booking_ref', bookingRef)
      .eq('travel_date', today)
      .maybeSingle();
    return data;
  };

  const getDisplayName = (b: Booking) => {
    const cRecord = checkins.find(c => c.booking_ref === b.booking_ref);
    const override = cRecord?.display_name_override;
    return override && String(override).trim() ? override : b.customer_name;
  };

  // Checked-in guests only, grouped by their CURRENT session_bookings.allotted_guide_id — never
  // the frozen checkins.checked_in_by — so a guest's shown guide always reflects live allotment.
  const sessionIdToCheckedInGuests = useMemo(() => {
    const m = new Map<string, AllocationGuest[]>();
    sessionBookings.forEach(sb => {
      const cRecord = checkins.find(c => c.booking_ref === sb.booking_ref);
      if (cRecord?.status !== 'checked_in') return;
      const b = bookings.find(bk => bk.booking_ref === sb.booking_ref);
      if (!b) return;
      const arr = m.get(sb.session_id) || [];
      arr.push({
        bookingRef: sb.booking_ref,
        displayName: getDisplayName(b),
        pax: paxTotal(b),
        allottedGuideId: sb.allotted_guide_id,
      });
      m.set(sb.session_id, arr);
    });
    return m;
  }, [sessionBookings, checkins, bookings]);

  // Records a check-in or no-show. Only a checked-in confirmation also flips the booking to
  // DONE (matching the owner page's existing side effect) — nothing else ever touches bookings,
  // and the Google Sheet is never written to from here.
  const recordCheckin = async (b: Booking, status: 'checked_in' | 'no_show', photoBase64: string | null = null) => {
    if (!guideUserId) return;

    const existing = await findCheckinRow(b.booking_ref);
    if (existing?.status === 'checked_in' || existing?.status === 'no_show') {
      await refreshCheckins();
      return;
    }

    const totalPax = paxTotal(b);
    const checkinFields = {
      checked_in_at: new Date().toISOString(),
      checked_in_by: guideName || 'Guide',
      pax_checked_in: status === 'checked_in' ? totalPax : 0,
      status,
      ticket_photo: photoBase64,
    };

    if (existing) {
      await supabase.from('checkins').update(checkinFields).eq('id', existing.id);
    } else {
      await supabase.from('checkins').insert({
        user_id: guideUserId,
        booking_ref: b.booking_ref,
        travel_date: today,
        ...checkinFields,
      });
    }

    if (status === 'checked_in') {
      await supabase.from('bookings').update({ status: 'DONE' }).eq('id', b.id);

      // Auto-allot: whichever guide performs the check-in gets this guest by default. The owner
      // can still move it from the Today's Tours allocation board.
      if (guideId) {
        await supabase.from('session_bookings')
          .update({ allotted_guide_id: guideId })
          .eq('user_id', guideUserId)
          .eq('booking_ref', b.booking_ref);
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

  // Reverts a wrongly checked-in guest: deletes their checkins row for today, puts the booking
  // back to UPCOMING, and clears their allotment. RLS already scopes every one of these writes to
  // this guide's own sessions (via my_session_booking_refs()), so a guide can never reset a guest
  // outside their own tours — this is a deliberate manual override, so moving status away from
  // DONE here is intentional, not a bug.
  const handleResetCheckin = async (b: Booking) => {
    if (!guideUserId) return;
    if (!confirm(`Reset check-in for ${getDisplayName(b)}? They'll return to not-checked-in.`)) return;

    const existing = await findCheckinRow(b.booking_ref);
    if (existing) {
      await supabase.from('checkins').delete().eq('id', existing.id);
    }

    await supabase.from('bookings').update({ status: 'UPCOMING' }).eq('id', b.id);

    await supabase.from('session_bookings')
      .update({ allotted_guide_id: null })
      .eq('user_id', guideUserId)
      .eq('booking_ref', b.booking_ref);

    await logChange(supabase, guideUserId, {
      tableName: 'bookings',
      recordId: b.booking_ref,
      fieldName: 'status',
      oldValue: 'DONE',
      newValue: 'UPCOMING',
      description: `${b.booking_ref} check-in reset by guide ${guideName || ''}`.trim()
    });

    await refreshCheckins();
    await refreshSessionBookings();
  };

  const sessionsWithBookings = sessions.filter(s => (sessionBookingsMap.get(s.id) || []).length > 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="p-4 space-y-8 animate-fade-in max-w-[480px] mx-auto">
        <div className="pt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight mb-1">Today's Check-in</h1>
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
              <CalendarIcon size={14} className="text-gold" />
              <span>{todayStr}</span>
            </div>
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Refresh"
            className="p-2.5 bg-muted border border-border rounded-xl text-muted-foreground hover:text-gold hover:bg-muted/70 transition-all disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

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
          sessionsWithBookings.map(session => {
            const sessionBookingsList = sessionBookingsMap.get(session.id) || [];
            const totalPax = sessionBookingsList.reduce((sum, b) => sum + paxTotal(b), 0);

            const teamGuides = sessionIdToTeam.get(session.id) || [];
            const checkedInGuests = sessionIdToCheckedInGuests.get(session.id) || [];

            return (
              <div key={session.id} className="space-y-4">
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
                        onCheckIn={() => setShowConfirm(b)}
                        onNoShow={() => recordCheckin(b, 'no_show')}
                        onReset={isDone ? () => handleResetCheckin(b) : undefined}
                      />
                    );
                  })}
                </TourGroup>

                {teamGuides.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-purple-700 mb-2 px-1">
                      Team Allocation
                    </p>
                    <AllocationBoard
                      guides={teamGuides}
                      guests={checkedInGuests}
                      highlightGuideId={guideId || undefined}
                    />
                  </div>
                )}
              </div>
            );
          })
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
    </div>
  );
}
