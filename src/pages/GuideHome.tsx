import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Calendar as CalendarIcon, Compass, Users, X } from 'lucide-react';
import { localDateStr } from '@/lib/utils';

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

interface Guide {
  id: string;
  name: string;
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
  const [otherGuides, setOtherGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [reassignSessionId, setReassignSessionId] = useState<string | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState('');
  const [reassigning, setReassigning] = useState(false);

  const today = localDateStr();
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const loadData = async () => {
    if (!guideId || !guideUserId) return;
    setLoading(true);

    const { data: sgData } = await supabase
      .from('session_guides')
      .select('session_id, guide_id, status, offered_at, responded_at, reassigned_from')
      .eq('user_id', guideUserId)
      .eq('guide_id', guideId);

    const mine = sgData || [];
    setSessionGuides(mine);

    const sessionIds = Array.from(new Set(mine.map(sg => sg.session_id)));
    if (sessionIds.length === 0) {
      setSessions([]);
      setSessionBookings([]);
      setBookings([]);
      setOtherGuides([]);
      setLoading(false);
      return;
    }

    const [sessRes, sbRes, guidesRes] = await Promise.all([
      supabase.from('tour_sessions').select('id, label, start_time, tour_date')
        .eq('user_id', guideUserId).in('id', sessionIds).gte('tour_date', today)
        .order('tour_date', { ascending: true }).order('start_time', { ascending: true }),
      supabase.from('session_bookings').select('session_id, booking_ref')
        .eq('user_id', guideUserId).in('session_id', sessionIds),
      supabase.from('guides').select('id, name')
        .eq('user_id', guideUserId).eq('status', 'active').order('name'),
    ]);

    setSessions(sessRes.data || []);
    const mySessionBookings = sbRes.data || [];
    setSessionBookings(mySessionBookings);
    setOtherGuides((guidesRes.data || []).filter(g => g.id !== guideId));

    const refs = Array.from(new Set(mySessionBookings.map(sb => sb.booking_ref)));
    if (refs.length === 0) {
      setBookings([]);
      setLoading(false);
      return;
    }

    const { data: bData } = await supabase
      .from('bookings')
      .select('booking_ref, pax_adult, pax_youth, pax_child, pax_infant')
      .eq('user_id', guideUserId).in('booking_ref', refs);

    setBookings(bData || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [guideId, guideUserId]);

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

  const pendingOffers = useMemo(() => sessionGuides
    .filter(sg => sg.status === 'offered')
    .map(sg => ({ sg, session: sessionById.get(sg.session_id) }))
    .filter((x): x is { sg: SessionGuideRow; session: TourSession } => !!x.session)
    .sort(sortByWhen), [sessionGuides, sessionById]);

  const myTours = useMemo(() => sessionGuides
    .filter(sg => sg.status === 'accepted')
    .map(sg => ({ sg, session: sessionById.get(sg.session_id) }))
    .filter((x): x is { sg: SessionGuideRow; session: TourSession } => !!x.session)
    .sort(sortByWhen), [sessionGuides, sessionById]);

  const todaysTours = myTours.filter(x => x.session.tour_date === today);
  const totalTours = todaysTours.length;
  const totalPax = todaysTours.reduce((sum, x) => sum + (sessionPax.get(x.sg.session_id) || 0), 0);

  const handleRespond = async (sessionId: string, accept: boolean) => {
    setRespondingId(sessionId);
    try {
      const { error } = await supabase.rpc('respond_to_offer', { p_session_id: sessionId, p_accept: accept });
      if (error) throw error;
      await loadData();
    } catch (e) {
      console.error('Failed to respond to offer:', e);
      alert('Failed to respond. Please try again.');
    } finally {
      setRespondingId(null);
    }
  };

  const openReassign = (sessionId: string) => {
    setReassignSessionId(sessionId);
    setReassignTargetId('');
  };

  const handleReassign = async () => {
    if (!reassignSessionId || !reassignTargetId) return;
    setReassigning(true);
    try {
      const { error } = await supabase.rpc('reassign_my_slot', { p_session_id: reassignSessionId, p_to_guide: reassignTargetId });
      if (error) throw error;
      setReassignSessionId(null);
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
          <CalendarIcon size={16} className="text-[#f5a623]" />
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
            <div className="aurelia-card p-6 border-l-[3px] border-l-[#f5a623]">
              <div className="flex items-center gap-2 text-gray-400 mb-1">
                <Compass size={14} />
                <p className="text-[10px] font-bold uppercase tracking-widest">Tours Today</p>
              </div>
              <p className="text-3xl font-extrabold">{totalTours}</p>
            </div>
            <div className="aurelia-card p-6 border-l-[3px] border-l-blue-500">
              <div className="flex items-center gap-2 text-gray-400 mb-1">
                <Users size={14} />
                <p className="text-[10px] font-bold uppercase tracking-widest">Expected Pax</p>
              </div>
              <p className="text-3xl font-extrabold">{totalPax}</p>
            </div>
          </div>

          {pendingOffers.length === 0 && myTours.length === 0 ? (
            <div className="aurelia-card p-12 text-center flex flex-col items-center">
              <CalendarIcon size={48} className="text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-bold mb-2">No tours assigned</h3>
              <p className="text-muted-foreground">Check back later or contact your coordinator.</p>
            </div>
          ) : (
            <>
              {pendingOffers.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-black uppercase tracking-widest text-amber-400">Pending Offers</h2>
                  <div className="space-y-3">
                    {pendingOffers.map(({ sg, session }) => (
                      <div key={sg.session_id} className="aurelia-card p-4 border-l-[3px] border-l-amber-500 space-y-3">
                        <div>
                          <h3 className="font-bold text-base">{session.label || 'Untitled Session'}</h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                            <span>{formatDate(session.tour_date)}</span>
                            <span>&middot;</span>
                            <span>{session.start_time || '—'}</span>
                            <span>&middot;</span>
                            <span className="text-gold font-bold">{sessionPax.get(sg.session_id) || 0} pax</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => handleRespond(sg.session_id, true)}
                            disabled={respondingId === sg.session_id}
                            className="bg-gold text-black py-2.5 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 active:scale-95 transition-all"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleRespond(sg.session_id, false)}
                            disabled={respondingId === sg.session_id}
                            className="bg-red-500/10 border border-red-500/20 text-red-400 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 active:scale-95 transition-all"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {myTours.length > 0 && (
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
                            className="text-[10px] font-bold uppercase text-muted-foreground hover:text-gold border border-white/10 hover:border-gold/30 rounded-lg px-2.5 py-1.5 shrink-0 transition-colors"
                          >
                            Give to another guide
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {reassignSessionId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f0f12] border border-white/10 rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0f]">
              <h2 className="font-black text-lg text-white">Give to another guide</h2>
              <button onClick={() => setReassignSessionId(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {sessionById.get(reassignSessionId)?.label || 'This tour'} will be offered to the guide you pick.
              </p>
              <select
                value={reassignTargetId}
                onChange={e => setReassignTargetId(e.target.value)}
                className="aurelia-input w-full bg-[#13131a]"
              >
                <option value="">-- Choose a guide --</option>
                {otherGuides.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="p-6 border-t border-white/5 bg-[#0a0a0f] flex justify-end gap-3">
              <button onClick={() => setReassignSessionId(null)} className="aurelia-ghost-btn px-5 py-2 border border-white/20 text-gray-300">Cancel</button>
              <button
                onClick={handleReassign}
                disabled={!reassignTargetId || reassigning}
                className="bg-gold text-black px-5 py-2 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50"
              >
                {reassigning ? 'Reassigning…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
