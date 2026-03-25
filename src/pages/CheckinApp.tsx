import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { LogOut, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Users, Clock, LogIn } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

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
  travel_date: string;
  travel_time: string;
  product_code: string;
  option_name: string;
  status: string;
  total_pax: number;
  pax_adult: number;
  pax_youth: number;
  pax_child: number;
  pax_infant: number;
  gross_revenue: number;
  user_id: string;
}

export default function CheckinApp() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(localStorage.getItem('checkin_guide_id'));
  const [companyUserId, setCompanyUserId] = useState<string | null>(localStorage.getItem('checkin_company_user_id'));

  const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchGuides();
  }, []);

  useEffect(() => {
    if (selectedGuideId) {
      fetchData();
      const interval = setInterval(fetchData, 60000);
      return () => clearInterval(interval);
    }
  }, [selectedGuideId, dateParam]);

  const fetchGuides = async () => {
    const { data } = await supabase.from('guides').select('id, name, guide_number, user_id').order('name');
    if (data) setGuides(data);
  };

  const fetchData = async () => {
    if (!selectedGuideId) return;
    setLoading(true);
    
    // Fetch bookings for the date
    const { data: bData } = await supabase
      .from('bookings')
      .select('*')
      .eq('travel_date', dateParam)
      .neq('status', 'CANCELLED_EARLY')
      .order('travel_time', { ascending: true });

    if (bData) setBookings(bData);
    setLoading(false);
  };

  const handleSelectGuide = (guide: Guide) => {
    setSelectedGuideId(guide.id);
    setCompanyUserId(guide.user_id);
    localStorage.setItem('checkin_guide_id', guide.id);
    localStorage.setItem('checkin_company_user_id', guide.user_id);
  };

  const handleCheckIn = async (booking: Booking, status: 'checked_in' | 'no_show') => {
    if (!companyUserId) return;
    
    const guideName = guides.find(g => g.id === selectedGuideId)?.name || 'Unknown';
    
    // 1. Update Booking Status
    const { error: bError } = await supabase.from('bookings')
      .update({ status: status === 'checked_in' ? 'DONE' : 'NO_SHOW' })
      .eq('id', booking.id);

    if (bError) return console.error(bError);

    // 2. Insert Check-in Record
    const { error: cError } = await supabase.from('checkins').insert({
      booking_ref: booking.booking_ref,
      travel_date: booking.travel_date,
      checked_in_by: guideName,
      pax_checked_in: status === 'checked_in' ? booking.total_pax : 0,
      status: status,
      user_id: companyUserId
    });

    if (cError) console.error(cError);
    fetchData();
  };

  const changeDate = (days: number) => {
    const d = new Date(dateParam);
    d.setDate(d.getDate() + days);
    setSearchParams({ date: d.toISOString().split('T')[0] });
  };

  const groupedBookings = useMemo(() => {
    const groups: Record<string, Booking[]> = {};
    bookings.forEach(b => {
      const key = `${b.travel_time} - ${b.product_code}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    });
    return groups;
  }, [bookings]);

  const stats = useMemo(() => {
    const done = bookings.filter(b => b.status === 'DONE').length;
    const noShow = bookings.filter(b => b.status === 'NO_SHOW').length;
    const pending = bookings.filter(b => b.status === 'UPCOMING').length;
    const earnings = bookings.filter(b => b.status === 'DONE').reduce((sum, b) => sum + (Number(b.gross_revenue) || 0), 0);
    return { done, noShow, pending, earnings };
  }, [bookings]);

  if (!selectedGuideId) {
    return (
      <div className="min-h-screen bg-[#060608] text-white p-6 flex flex-col items-center justify-center max-w-[480px] mx-auto font-sans">
        <div className="text-center mb-12">
          <div className="text-4xl font-black text-gold mb-3 tracking-tighter italic">AURELIA</div>
          <h1 className="text-xl font-bold text-gray-400">Welcome back. Who's checking in?</h1>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full">
          {guides.map(g => (
            <button
              key={g.id}
              onClick={() => handleSelectGuide(g)}
              className="bg-white/5 border border-white/10 p-6 rounded-3xl text-center hover:border-gold/50 transition-all active:scale-95 touch-manipulation min-h-[140px] flex flex-col items-center justify-center group shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-xl mb-3 group-hover:bg-gold/20 group-hover:text-gold transition-colors">
                👤
              </div>
              <div className="text-lg font-extrabold">{g.name}</div>
              <div className="text-[10px] font-mono text-gray-500 uppercase mt-1 tracking-widest">{g.guide_number}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const currentGuide = guides.find(g => g.id === selectedGuideId);

  return (
    <div className="min-h-screen bg-[#060608] text-white max-w-[480px] mx-auto flex flex-col pb-44 font-sans antialiased">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[#060608]/90 backdrop-blur-2xl border-b border-white/5 p-4 flex items-center justify-between shadow-xl">
        <div className="text-2xl font-black text-gold tracking-tighter italic">AUR.</div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(-1)} className="p-2.5 bg-white/5 rounded-xl active:scale-90"><ChevronLeft size={20} /></button>
          <div className="text-sm font-bold w-28 text-center bg-white/5 py-2 rounded-xl border border-white/5">
            {new Date(dateParam).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          <button onClick={() => changeDate(1)} className="p-2.5 bg-white/5 rounded-xl active:scale-90"><ChevronRight size={20} /></button>
        </div>
        <button 
          onClick={() => { localStorage.clear(); window.location.reload(); }}
          className="p-2.5 text-gray-500 hover:text-white bg-white/5 rounded-xl"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* CONTENT */}
      <div className="p-5 space-y-8">
        <div className="flex items-center justify-between bg-white/[0.03] p-5 rounded-3xl border border-white/5 shadow-inner">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center text-gold font-bold border border-gold/20 shadow-lg shadow-gold/10">
              {currentGuide?.name[0]}
            </div>
            <div>
              <div className="text-lg font-black">{currentGuide?.name}</div>
              <div className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">{currentGuide?.guide_number}</div>
            </div>
          </div>
          <button 
            onClick={() => setSelectedGuideId(null)}
            className="text-[10px] font-black text-gold uppercase tracking-[0.2em] bg-gold/10 px-3 py-1.5 rounded-full border border-gold/20"
          >
            Switch
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 gap-4">
            <div className="w-10 h-10 border-4 border-gold border-t-transparent animate-spin rounded-full shadow-lg shadow-gold/20" />
            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Fetching Tours...</div>
          </div>
        ) : Object.keys(groupedBookings).length === 0 ? (
          <div className="text-center py-24 bg-white/[0.01] rounded-[40px] border border-dashed border-white/5 mx-2">
            <div className="text-6xl mb-6 grayscale opacity-50">🗓️</div>
            <div className="text-xl font-black mb-2">Clean Slate!</div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-widest leading-relaxed">No tours scheduled for this date</div>
          </div>
        ) : (
          Object.entries(groupedBookings).map(([key, groupBookings]) => {
            const [time, code] = key.split(' - ');
            const totalPax = groupBookings.reduce((sum, b) => sum + b.total_pax, 0);
            return (
              <div key={key} className="space-y-4">
                <div className="flex items-center justify-between px-3">
                  <div className="flex items-center gap-2.5">
                    <Clock size={16} className="text-gold" />
                    <div className="text-sm font-black text-white">{time}</div>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                    {code} · {totalPax} Pax
                  </div>
                </div>

                <div className="space-y-4">
                  {groupBookings.map(b => {
                    const isDone = b.status === 'DONE';
                    const isNoShow = b.status === 'NO_SHOW';

                    return (
                      <div 
                        key={b.id} 
                        className={`p-6 rounded-[32px] border-2 transition-all shadow-2xl ${
                          isDone ? 'border-green-500/40 bg-green-500/[0.04]' : 
                          isNoShow ? 'border-red-500/40 bg-red-500/[0.04]' : 
                          'border-white/5 bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex flex-col gap-1">
                            <div className="text-[10px] font-mono text-gray-500 tracking-wider font-bold">{b.booking_ref}</div>
                            <div className="text-lg font-black leading-tight tracking-tight">{b.customer_name}</div>
                          </div>
                          {isDone && <div className="bg-green-500/20 p-2 rounded-full border border-green-500/30"><CheckCircle2 className="text-green-500" size={20} /></div>}
                          {isNoShow && <div className="bg-red-500/20 p-2 rounded-full border border-red-500/30"><XCircle className="text-red-500" size={20} /></div>}
                        </div>

                        <div className="flex items-center gap-3 mb-6 bg-black/20 p-3 rounded-2xl border border-white/[0.03]">
                          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"><Users size={14} className="text-gray-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-xs font-black">{b.total_pax} Passengers</span>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">A:{b.pax_adult} | Y:{b.pax_youth} | C:{b.pax_child}</span>
                          </div>
                          <div className="ml-auto text-gold font-black bg-gold/10 px-3 py-1.5 rounded-xl border border-gold/10">€{b.gross_revenue}</div>
                        </div>

                        {!(isDone || isNoShow) ? (
                          <div className="grid grid-cols-2 gap-4 mt-6">
                            <button 
                              onClick={() => handleCheckIn(b, 'checked_in')}
                              className="bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-black text-xs shadow-lg shadow-green-900/20 active:scale-95 touch-manipulation flex items-center justify-center gap-2 border-b-4 border-green-800"
                            >
                              <CheckCircle2 size={18} /> CHECK IN
                            </button>
                            <button 
                              onClick={() => handleCheckIn(b, 'no_show')}
                              className="bg-red-600/10 hover:bg-red-600/20 text-red-500 py-4 rounded-2xl font-black text-xs active:scale-95 touch-manipulation border border-red-500/20"
                            >
                              <XCircle size={18} /> NO SHOW
                            </button>
                          </div>
                        ) : (
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 text-center py-2 bg-black/20 rounded-xl border border-white/5">
                             {isDone ? 'Verified: DONE' : 'Verified: NO SHOW'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FOOTER SUMMARY */}
      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[440px] bg-[#1a1a1f]/80 backdrop-blur-3xl border border-white/10 p-6 rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] z-50">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center bg-black/20 py-3 rounded-2xl border border-white/[0.03]">
            <div className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">DONE</div>
            <div className="text-xl font-black text-green-500">{stats.done}</div>
          </div>
          <div className="text-center bg-black/20 py-3 rounded-2xl border border-white/[0.03]">
            <div className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">WAIT</div>
            <div className="text-xl font-black text-white">{stats.pending}</div>
          </div>
          <div className="text-center bg-black/20 py-3 rounded-2xl border border-white/[0.03]">
            <div className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] mb-1">LOSS</div>
            <div className="text-xl font-black text-red-500">{stats.noShow}</div>
          </div>
        </div>
        <div className="bg-gold/10 border-2 border-gold/20 p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-gold/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold"><Euro size={16} /></div>
            <span className="text-xs font-black text-gold uppercase tracking-[0.1em]">Revenue Est.</span>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">€{stats.earnings.toLocaleString()}</div>
        </div>
      </footer>
    </div>
  );
}

const Euro = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12M4 14h9M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12a7.9 7.9 0 0 0 7.8 8 7.7 7.7 0 0 0 5.2-2"/></svg>
);
