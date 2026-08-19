import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams, useParams } from 'react-router-dom';
import GuestCard from '@/components/checkin/GuestCard';
import CheckinConfirmModal from '@/components/checkin/CheckinConfirmModal';
import TourGroup from '@/components/checkin/TourGroup';
import { localDateStr } from '@/lib/utils';

interface Guide {
  id: string;
  name: string;
  guide_number: string;
  user_id: string;
}

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
  user_id: string;
}

interface Checkin {
  booking_ref: string;
  status: string;
  checked_in_at: string;
  ticket_photo?: string;
}

interface Assignment {
  id: string;
  booking_ref?: string;
  travel_time: string;
  product_code: string;
  option_name: string;
  guide_id: string;
}

export default function CheckinApp() {
  const { token } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

  // Local storage state for Guide Selection
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(localStorage.getItem('checkin_guide_id'));
  const [guideName, setGuideName] = useState<string | null>(localStorage.getItem('checkin_guide_name'));

  // Company state from token
  const [companyUserId, setCompanyUserId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const dateParam = searchParams.get('date') || localDateStr();

  // Capture Modal State
  const [showConfirm, setShowConfirm] = useState<Booking | null>(null);

  useEffect(() => {
    validateToken();
  }, [token]);

  useEffect(() => {
    if (companyUserId) {
      fetchData();
      const interval = setInterval(fetchData, 30000); // 30s refresh
      return () => clearInterval(interval);
    }
  }, [companyUserId, dateParam]);

  const validateToken = async () => {
    if (!token) {
      setIsValidToken(false);
      setLoading(false);
      return;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, company_name')
      .eq('checkin_token', token)
      .single();

    if (error || !profile) {
      setIsValidToken(false);
      setLoading(false);
    } else {
      setCompanyUserId(profile.id);
      setCompanyName(profile.company_name);
      setIsValidToken(true);
      fetchGuides(profile.id);
    }
  };

  const fetchGuides = async (userId: string) => {
    const { data } = await supabase.from('guides')
      .select('id, name, guide_number, user_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('name');
    if (data) setGuides(data);
  };

  const fetchData = async () => {
    if (!companyUserId) return;
    setLoading(true);

    const [bRes, cRes, aRes] = await Promise.all([
      supabase.from('bookings').select('*')
        .eq('user_id', companyUserId)
        .eq('travel_date', dateParam)
        .not('status', 'in', '("CANCELLED_EARLY")')
        .order('travel_time', { ascending: true }),
      supabase.from('checkins').select('booking_ref, status, checked_in_at, ticket_photo')
        .eq('user_id', companyUserId)
        .eq('travel_date', dateParam),
      supabase.from('guide_assignments').select('*')
        .eq('user_id', companyUserId)
        .eq('travel_date', dateParam)
    ]);

    if (bRes.data) setBookings(bRes.data);
    if (cRes.data) setCheckins(cRes.data);
    if (aRes.data) setAssignments(aRes.data);
    setLoading(false);
  };

  const handleSelectSelf = (guide: Guide) => {
    setSelectedGuideId(guide.id);
    setGuideName(guide.name);
    localStorage.setItem('checkin_guide_id', guide.id);
    localStorage.setItem('checkin_guide_name', guide.name);
  };

  const handleCheckInAttempt = (booking: Booking) => {
    setShowConfirm(booking);
  };

  const confirmCheckIn = async (status: 'checked_in' | 'no_show', photoBase64: string | null = null) => {
    if (!showConfirm || !companyUserId) return;
    const b = showConfirm;
    const totalPax = (b.pax_adult || 0) + (b.pax_youth || 0) + (b.pax_child || 0) + (b.pax_infant || 0);

    // 1. Update Booking Status
    await supabase.from('bookings')
      .update({ status: status === 'checked_in' ? 'DONE' : 'NO_SHOW' })
      .eq('id', b.id);

    // 2. Insert Check-in Record
    await supabase.from('checkins').insert({
      user_id: companyUserId,
      booking_ref: b.booking_ref,
      travel_date: b.travel_date,
      checked_in_by: guideName || 'Guide',
      pax_checked_in: status === 'checked_in' ? totalPax : 0,
      status: status,
      ticket_photo: photoBase64
    });

    setShowConfirm(null);
    fetchData();
  };

  const handleAssignGuide = async (booking: Booking, targetGuideId: string) => {
    if (!companyUserId) return;

    // Check if assignment exists
    const existing = assignments.find(a =>
      a.booking_ref === booking.booking_ref ||
      (a.travel_time === booking.travel_time && a.product_code === booking.product_code && a.option_name === booking.option_name)
    );

    if (existing) {
      await supabase.from('guide_assignments').update({ guide_id: targetGuideId }).eq('id', existing.id);
    } else {
      await supabase.from('guide_assignments').insert({
        user_id: companyUserId,
        guide_id: targetGuideId,
        travel_date: dateParam,
        travel_time: booking.travel_time,
        product_code: booking.product_code,
        option_name: booking.option_name,
        booking_ref: booking.booking_ref,
        pax_count: (booking.pax_adult || 0) + (booking.pax_youth || 0) + (booking.pax_child || 0) + (booking.pax_infant || 0),
        calculated_pay: 0
      });
    }
    fetchData();
  };

  const changeDate = (days: number) => {
    const d = new Date(dateParam);
    d.setDate(d.getDate() + days);
    setSearchParams({ date: localDateStr(d) });
  };

  const logout = () => {
    localStorage.removeItem('checkin_guide_id');
    localStorage.removeItem('checkin_guide_name');
    setSelectedGuideId(null);
    setGuideName(null);
  };

  const grouped = useMemo(() => {
    const groups: Record<string, Booking[]> = {};
    bookings.forEach(b => {
      const key = `${b.travel_time} | ${b.product_code}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    });
    return groups;
  }, [bookings]);

  const stats = useMemo(() => {
    const done = checkins.filter(c => c.status === 'checked_in').length;
    const noShow = checkins.filter(c => c.status === 'no_show').length;
    const pending = bookings.length - (done + noShow);
    return { done, noShow, pending };
  }, [bookings, checkins]);

  if (isValidToken === false) {
    return (
      <div className="min-h-screen bg-[#060608] text-white p-6 flex flex-col items-center justify-center max-w-[480px] mx-auto font-sans text-center">
        <div className="text-4xl font-black text-red-500 mb-6 italic tracking-tighter">AURELIA</div>
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center text-3xl mb-8">❌</div>
        <h1 className="text-2xl font-black mb-4">Invalid Link</h1>
        <p className="text-gray-400 text-sm leading-relaxed max-w-[280px]">
          This check-in link is invalid or has expired. Please contact your tour coordinator for a new link.
        </p>
      </div>
    );
  }

  if (loading && isValidToken === null) {
    return (
      <div className="min-h-screen bg-[#060608] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gold border-t-transparent animate-spin rounded-full" />
      </div>
    );
  }

  if (!selectedGuideId) {
    return (
      <div className="min-h-screen bg-[#060608] text-white p-6 flex flex-col items-center justify-center max-w-[480px] mx-auto font-sans">
        <div className="text-center mb-12 animate-fade-in">
          <div className="text-4xl font-black text-gold mb-1 tracking-tighter italic">AURELIA</div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-8 flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            {companyName}
          </div>
          <h1 className="text-xl font-bold text-gray-300">Select your name</h1>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full">
          {guides.map(g => (
            <button
              key={g.id}
              onClick={() => handleSelectSelf(g)}
              className="bg-white/5 border border-white/10 p-6 rounded-[2rem] text-center hover:border-gold/50 transition-all active:scale-95 touch-manipulation min-h-[140px] flex flex-col items-center justify-center group"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-xl mb-3 group-hover:bg-gold/20 group-hover:text-gold transition-colors">👤</div>
              <div className="text-lg font-black">{g.name}</div>
              <div className="text-[10px] font-mono text-gray-500 uppercase mt-1 tracking-widest">{g.guide_number}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060608] text-white max-w-[480px] mx-auto flex flex-col pb-44 font-sans antialiased">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[#060608]/90 backdrop-blur-2xl border-b border-white/5 p-4 flex items-center justify-between">
        <div className="flex flex-col">
          <div className="text-2xl font-black text-gold tracking-tighter italic leading-none">AUR.</div>
          <div className="text-[8px] font-black uppercase text-gray-500 tracking-widest mt-1 opacity-60">✦ {companyName}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(-1)} className="p-2.5 bg-white/5 rounded-xl"><ChevronLeft size={20} /></button>
          <div className="text-sm font-bold bg-white/5 px-4 py-2 rounded-xl border border-white/5">
            {new Date(dateParam).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          <button onClick={() => changeDate(1)} className="p-2.5 bg-white/5 rounded-xl"><ChevronRight size={20} /></button>
        </div>
        <button onClick={logout} className="p-2.5 text-gray-500 bg-white/5 rounded-xl"><LogOut size={18} /></button>
      </header>

      {/* CONTENT */}
      <div className="p-4 space-y-8 animate-fade-in">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
            <div className="w-8 h-8 border-4 border-gold border-t-transparent animate-spin rounded-full" />
            <div className="text-[10px] font-bold uppercase tracking-[0.2em]">Synchronizing...</div>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-20 opacity-30">
            <div className="text-6xl mb-4 text-center">📭</div>
            <p className="text-sm font-bold uppercase tracking-widest">No tours today</p>
          </div>
        ) : (
          Object.entries(grouped).map(([key, groupBookings]) => {
            const [time, code] = key.split(' | ');
            const totalPax = groupBookings.reduce((sum, b) => sum + (b.pax_adult+b.pax_youth+b.pax_child+b.pax_infant), 0);

            // Shared guide check
            const assignedGuides = assignments.filter(a => a.travel_time === time && a.product_code === code);
            const uniqueGuides = Array.from(new Set(assignedGuides.map(a => a.guide_id)));
            const sharedGuideName = uniqueGuides.length === 1 ? guides.find(g => g.id === uniqueGuides[0])?.name : null;

            return (
              <TourGroup key={key} time={time} code={code} bookingsCount={groupBookings.length} totalPax={totalPax} sharedGuideName={sharedGuideName}>
                {groupBookings.map(b => {
                  const cRecord = checkins.find(c => c.booking_ref === b.booking_ref);
                  const isDone = cRecord?.status === 'checked_in';
                  const isNoShow = cRecord?.status === 'no_show';
                  const assignment = assignments.find(a => a.booking_ref === b.booking_ref);

                  return (
                    <GuestCard
                      key={b.id}
                      booking={b}
                      isCheckedIn={isDone}
                      isNoShow={isNoShow}
                      checkedInAt={cRecord?.checked_in_at}
                      onCheckIn={() => handleCheckInAttempt(b)}
                      onNoShow={() => confirmCheckIn('no_show')}
                      guides={guides}
                      selectedGuideId={assignment?.guide_id || ''}
                      onSelectGuide={(guideId) => handleAssignGuide(b, guideId)}
                    />
                  );
                })}
              </TourGroup>
            );
          })
        )}
      </div>

      {/* CONFIRMATION / PHOTO MODAL */}
      {showConfirm && (
        <CheckinConfirmModal
          customerName={showConfirm.customer_name}
          pax={{ adult: showConfirm.pax_adult, youth: showConfirm.pax_youth, child: showConfirm.pax_child, infant: showConfirm.pax_infant }}
          onConfirm={(photoBase64) => confirmCheckIn('checked_in', photoBase64)}
          onCancel={() => setShowConfirm(null)}
        />
      )}

      {/* STICKY FOOTER */}
      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-[440px] bg-[#1a1a1f]/80 backdrop-blur-3xl border border-white/10 p-4 rounded-[40px] shadow-2xl z-50">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center border border-gold/20 text-gold font-black">
              {guideName?.[0]}
            </div>
            <div className="hidden min-[380px]:block">
              <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Guide</div>
              <div className="text-xs font-black truncate max-w-[80px]">{guideName}</div>
            </div>
          </div>

          <div className="flex flex-1 justify-end gap-3">
            <div className="text-center px-3 py-1 bg-green-500/10 rounded-xl border border-green-500/10">
              <div className="text-[8px] font-black text-green-500 uppercase tracking-widest">In</div>
              <div className="text-sm font-black text-white">{stats.done}</div>
            </div>
            <div className="text-center px-3 py-1 bg-red-500/10 rounded-xl border border-red-500/10">
              <div className="text-[8px] font-black text-red-500 uppercase tracking-widest">Loss</div>
              <div className="text-sm font-black text-white">{stats.noShow}</div>
            </div>
            <div className="text-center px-3 py-1 bg-white/5 rounded-xl border border-white/5">
              <div className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Wait</div>
              <div className="text-sm font-black text-white">{stats.pending}</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
