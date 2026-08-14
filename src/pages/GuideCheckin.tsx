import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Calendar as CalendarIcon } from 'lucide-react';
import GuestCard from '@/components/checkin/GuestCard';
import CheckinConfirmModal from '@/components/checkin/CheckinConfirmModal';
import TourGroup from '@/components/checkin/TourGroup';

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
}

const paxTotal = (b: Booking) =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);

export default function GuideCheckin() {
  const { guideName, guideUserId } = useAuth();

  // RLS (via my_session_booking_refs()) already limits tour_sessions/session_bookings/bookings/
  // checkins reads to this guide's own sessions — no client-side guide_id filtering needed here.
  const [sessions, setSessions] = useState<TourSession[]>([]);
  const [sessionBookings, setSessionBookings] = useState<SessionBookingRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState<Booking | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const loadData = async () => {
    if (!guideUserId) return;
    setLoading(true);

    const { data: sessionsData } = await supabase
      .from('tour_sessions')
      .select('id, label, start_time, tour_date')
      .eq('user_id', guideUserId)
      .eq('tour_date', today)
      .order('start_time', { ascending: true });

    const mySessions = sessionsData || [];
    setSessions(mySessions);

    const sessionIds = mySessions.map(s => s.id);
    if (sessionIds.length === 0) {
      setSessionBookings([]);
      setBookings([]);
      setCheckins([]);
      setLoading(false);
      return;
    }

    const { data: sbData } = await supabase
      .from('session_bookings')
      .select('session_id, booking_ref')
      .eq('user_id', guideUserId)
      .in('session_id', sessionIds);

    const mySessionBookings = sbData || [];
    setSessionBookings(mySessionBookings);

    const refs = Array.from(new Set(mySessionBookings.map(sb => sb.booking_ref)));
    if (refs.length === 0) {
      setBookings([]);
      setCheckins([]);
      setLoading(false);
      return;
    }

    const [bRes, cRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', guideUserId).in('booking_ref', refs),
      supabase.from('checkins').select('booking_ref, status, checked_in_at, display_name_override')
        .eq('user_id', guideUserId).eq('travel_date', today).in('booking_ref', refs),
    ]);

    setBookings(bRes.data || []);
    setCheckins(cRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [guideUserId]);

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

  // Records a check-in or no-show. Only a checked-in confirmation also flips the booking to
  // DONE (matching the owner page's existing side effect) — nothing else ever touches bookings,
  // and the Google Sheet is never written to from here.
  const recordCheckin = async (b: Booking, status: 'checked_in' | 'no_show', photoBase64: string | null = null) => {
    if (!guideUserId) return;

    const existing = await findCheckinRow(b.booking_ref);
    if (existing?.status === 'checked_in' || existing?.status === 'no_show') {
      loadData();
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
    }

    loadData();
  };

  const handleConfirmCheckin = (photoBase64: string | null) => {
    if (!showConfirm) return;
    const b = showConfirm;
    setShowConfirm(null);
    recordCheckin(b, 'checked_in', photoBase64);
  };

  // Saves a display-only name correction to checkins.display_name_override.
  // Never touches bookings — the master sheet sync is untouched by this.
  const handleSaveName = async (b: Booking, newName: string) => {
    if (!guideUserId) return;
    const trimmed = newName.trim();

    const existing = await findCheckinRow(b.booking_ref);

    if (existing) {
      await supabase.from('checkins').update({ display_name_override: trimmed || null }).eq('id', existing.id);
    } else {
      await supabase.from('checkins').insert({
        user_id: guideUserId,
        booking_ref: b.booking_ref,
        travel_date: today,
        display_name_override: trimmed || null,
      });
    }

    loadData();
  };

  const sessionsWithBookings = sessions.filter(s => (sessionBookingsMap.get(s.id) || []).length > 0);

  return (
    <div className="min-h-screen bg-[#060608] text-white">
      <div className="p-4 space-y-8 animate-fade-in max-w-[480px] mx-auto">
        <div className="pt-2">
          <h1 className="text-2xl font-black tracking-tight mb-1">Today's Check-in</h1>
          <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
            <CalendarIcon size={14} className="text-gold" />
            <span>{todayStr}</span>
          </div>
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

            return (
              <TourGroup
                key={session.id}
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
                      editableName
                      onSaveName={(newName) => handleSaveName(b, newName)}
                    />
                  );
                })}
              </TourGroup>
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
