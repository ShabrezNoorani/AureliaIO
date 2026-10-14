import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { localDateStr } from '@/lib/utils';
import { Calendar as CalendarIcon, Users } from 'lucide-react';

// Never shown in this page's own copy — just the floor on which past tours are fetched (mirrors
// the owner-side past-date browser's own HISTORY_FLOOR in TodayToursPage.tsx).
const HISTORY_FLOOR = '2026-10-01';

interface PastSessionRow {
  id: string;
  label: string | null;
  start_time: string | null;
  tour_date: string;
}

const formatDate = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/**
 * This guide's own past tours — read-only, own rows only (RLS scopes session_guides/
 * session_bookings/checkins to this guide's company; the allocation/checked-in count below is
 * further narrowed client-side to bookings actually allotted to THIS guide). Never shows the
 * literal history floor date to the guide — just "History".
 */
export default function GuideHistory() {
  const { guideId, guideUserId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<PastSessionRow[]>([]);
  const [sessionBookings, setSessionBookings] = useState<{ session_id: string; booking_ref: string; allotted_guide_id: string | null }[]>([]);
  const [checkins, setCheckins] = useState<{ booking_ref: string; status: string | null }[]>([]);

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
        setSessions([]); setSessionBookings([]); setCheckins([]); setLoading(false);
        return;
      }

      const { data: sessData } = await supabase.from('tour_sessions')
        .select('id, label, start_time, tour_date').eq('user_id', guideUserId).in('id', sessionIds)
        .gte('tour_date', HISTORY_FLOOR).lt('tour_date', today)
        .order('tour_date', { ascending: false }).order('start_time', { ascending: false });
      if (!mounted) return;
      const pastSessions = sessData || [];
      setSessions(pastSessions);

      const pastIds = pastSessions.map((s: PastSessionRow) => s.id);
      if (pastIds.length === 0) {
        setSessionBookings([]); setCheckins([]); setLoading(false);
        return;
      }

      const { data: sbData } = await supabase.from('session_bookings')
        .select('session_id, booking_ref, allotted_guide_id').eq('user_id', guideUserId).in('session_id', pastIds);
      if (!mounted) return;
      const links = sbData || [];
      setSessionBookings(links);

      const refs = Array.from(new Set(links.map((r: { booking_ref: string }) => r.booking_ref)));
      if (refs.length === 0) {
        setCheckins([]); setLoading(false);
        return;
      }
      const { data: cData } = await supabase.from('checkins')
        .select('booking_ref, status').eq('user_id', guideUserId).in('booking_ref', refs);
      if (!mounted) return;
      setCheckins(cData || []);
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, [guideId, guideUserId]);

  const rows = useMemo(() => {
    const checkinStatusByRef = new Map(checkins.map(c => [c.booking_ref, c.status]));
    const bySession = new Map<string, { allocated: number; checkedIn: number }>();
    sessionBookings.forEach(sb => {
      if (sb.allotted_guide_id !== guideId) return;
      const entry = bySession.get(sb.session_id) || { allocated: 0, checkedIn: 0 };
      entry.allocated += 1;
      if (checkinStatusByRef.get(sb.booking_ref) === 'checked_in') entry.checkedIn += 1;
      bySession.set(sb.session_id, entry);
    });
    return sessions.map(s => ({
      session: s,
      allocated: bySession.get(s.id)?.allocated ?? 0,
      checkedIn: bySession.get(s.id)?.checkedIn ?? 0,
    }));
  }, [sessions, sessionBookings, checkins, guideId]);

  return (
    <div className="p-4 md:p-8 pb-32 max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">History</h1>
        <p className="text-muted-foreground text-sm">Your past tours and allocations.</p>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="aurelia-card p-12 text-center flex flex-col items-center">
          <CalendarIcon size={48} className="text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-bold mb-2">No past tours yet</h3>
          <p className="text-muted-foreground">Completed tours will show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ session, allocated, checkedIn }) => (
            <div key={session.id} className="aurelia-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-sm truncate">{session.label || 'Untitled Session'}</h3>
                <div className="flex items-center gap-x-3 flex-wrap text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1"><CalendarIcon size={11} />{formatDate(session.tour_date)}</span>
                  <span>&middot;</span>
                  <span>{session.start_time || '—'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground shrink-0">
                <Users size={13} className="text-gold" />
                {checkedIn}/{allocated} checked in
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
