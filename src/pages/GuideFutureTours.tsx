import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { localDateStr, isCancelled } from '@/lib/utils';
import { Calendar as CalendarIcon, Clock, Users } from 'lucide-react';

interface FutureSessionRow {
  id: string;
  label: string | null;
  start_time: string | null;
  tour_date: string;
}

// Deliberately NO customer_phone / contact fields — this select is the privacy boundary for the
// whole tab. Contact details stay on the Today check-in tab only.
const FUTURE_BOOKING_COLUMNS = 'booking_ref, customer_name, option_name, pax_adult, pax_youth, pax_child, pax_infant, status';

interface FutureBookingRow {
  booking_ref: string | null;
  customer_name: string | null;
  option_name: string | null;
  pax_adult: number | null;
  pax_youth: number | null;
  pax_child: number | null;
  pax_infant: number | null;
  status: string | null;
}

const paxTotal = (b: FutureBookingRow) =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);

const formatDate = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Read-only look ahead: every session dated AFTER today that this guide is accepted on (via their
 * own session_guides rows), grouped by date then session. Each booking shows customer name,
 * option and total pax only. Today's sessions are not shown here; they belong to the Today tab,
 * which is unchanged. Cancelled bookings are left out.
 */
export default function GuideFutureTours() {
  const { guideId, guideUserId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<FutureSessionRow[]>([]);
  const [links, setLinks] = useState<{ session_id: string; booking_ref: string }[]>([]);
  const [bookings, setBookings] = useState<FutureBookingRow[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!guideId || !guideUserId) { setLoading(false); return; }
      setLoading(true);
      const today = localDateStr();

      const { data: sgData } = await supabase.from('session_guides')
        .select('session_id').eq('user_id', guideUserId).eq('guide_id', guideId).eq('status', 'accepted');
      const sessionIds = Array.from(new Set((sgData || []).map((r: { session_id: string }) => r.session_id)));
      if (!mounted) return;
      if (sessionIds.length === 0) {
        setSessions([]); setLinks([]); setBookings([]); setLoading(false);
        return;
      }

      const { data: sessData } = await supabase.from('tour_sessions')
        .select('id, label, start_time, tour_date').eq('user_id', guideUserId).in('id', sessionIds)
        .gt('tour_date', today)
        .order('tour_date', { ascending: true }).order('start_time', { ascending: true });
      if (!mounted) return;
      const future = sessData || [];
      setSessions(future);

      const futureIds = future.map(s => s.id);
      if (futureIds.length === 0) {
        setLinks([]); setBookings([]); setLoading(false);
        return;
      }

      const { data: sbData } = await supabase.from('session_bookings')
        .select('session_id, booking_ref').eq('user_id', guideUserId).in('session_id', futureIds);
      if (!mounted) return;
      const sessionLinks = sbData || [];
      setLinks(sessionLinks);

      const refs = Array.from(new Set(sessionLinks.map(l => l.booking_ref)));
      if (refs.length === 0) {
        setBookings([]); setLoading(false);
        return;
      }
      const { data: bData } = await supabase.from('bookings')
        .select(FUTURE_BOOKING_COLUMNS).eq('user_id', guideUserId).in('booking_ref', refs);
      if (!mounted) return;
      setBookings((bData || []) as FutureBookingRow[]);
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, [guideId, guideUserId]);

  // date -> sessions (already date/time ordered) -> bookings
  const byDate = useMemo(() => {
    const bookingByRef = new Map(bookings.map(b => [b.booking_ref, b]));
    const bookingsBySession = new Map<string, FutureBookingRow[]>();
    links.forEach(l => {
      const b = bookingByRef.get(l.booking_ref);
      if (!b || isCancelled(b.status)) return;
      const arr = bookingsBySession.get(l.session_id) || [];
      arr.push(b);
      bookingsBySession.set(l.session_id, arr);
    });
    const out: { date: string; sessions: { session: FutureSessionRow; bookings: FutureBookingRow[]; pax: number }[] }[] = [];
    sessions.forEach(session => {
      const sessionBookings = (bookingsBySession.get(session.id) || [])
        .slice()
        .sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''));
      const entry = { session, bookings: sessionBookings, pax: sessionBookings.reduce((sum, b) => sum + paxTotal(b), 0) };
      const last = out[out.length - 1];
      if (last && last.date === session.tour_date) last.sessions.push(entry);
      else out.push({ date: session.tour_date, sessions: [entry] });
    });
    return out;
  }, [sessions, links, bookings]);

  return (
    <div className="p-4 md:p-8 pb-32 max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Future Tours</h1>
        <p className="text-muted-foreground text-sm">Your upcoming tours after today.</p>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>
      ) : byDate.length === 0 ? (
        <div className="aurelia-card p-12 text-center flex flex-col items-center">
          <CalendarIcon size={48} className="text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-bold mb-2">No upcoming tours</h3>
          <p className="text-muted-foreground">Tours assigned to you after today will show up here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {byDate.map(({ date, sessions: daySessions }) => (
            <section key={date} className="space-y-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-gold flex items-center gap-2">
                <CalendarIcon size={14} /> {formatDate(date)}
              </h2>
              {daySessions.map(({ session, bookings: sessionBookings, pax }) => (
                <div key={session.id} className="aurelia-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base leading-snug break-words">{session.label || 'Untitled Session'}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Clock size={12} /> {session.start_time || '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-bold shrink-0">
                      <Users size={14} className="text-gold" /> {pax} pax
                    </div>
                  </div>

                  {sessionBookings.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No bookings yet.</p>
                  ) : (
                    <ul className="divide-y divide-border/60 border-t border-border/60">
                      {sessionBookings.map((b, i) => (
                        <li key={b.booking_ref || i} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold break-words">{b.customer_name || 'Guest'}</p>
                            {b.option_name && <p className="text-xs text-muted-foreground break-words">{b.option_name}</p>}
                          </div>
                          <span className="text-sm font-bold tabular-nums shrink-0">{paxTotal(b)} pax</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
