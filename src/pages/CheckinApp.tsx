import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  LogOut, ChevronLeft, ChevronRight, CheckCircle2, 
  XCircle, Users, Clock, Camera, Check, X, 
  Phone, Calendar, Tag, UserPlus, Info
} from 'lucide-react';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Local storage state
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(localStorage.getItem('checkin_guide_id'));
  const [companyUserId, setCompanyUserId] = useState<string | null>(localStorage.getItem('checkin_user_id'));
  const [guideName, setGuideName] = useState<string | null>(localStorage.getItem('checkin_guide_name'));

  const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];

  // Capture Modal State
  const [showConfirm, setShowConfirm] = useState<Booking | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchGuides();
  }, []);

  useEffect(() => {
    if (companyUserId) {
      fetchData();
      const interval = setInterval(fetchData, 30000); // 30s refresh
      return () => clearInterval(interval);
    }
  }, [companyUserId, dateParam]);

  const fetchGuides = async () => {
    // 1. COMPANY ISOLATION: Fetch all guides first to populate select
    const { data } = await supabase.from('guides')
      .select('id, name, guide_number, user_id')
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
    setCompanyUserId(guide.user_id);
    setGuideName(guide.name);
    localStorage.setItem('checkin_guide_id', guide.id);
    localStorage.setItem('checkin_guide_name', guide.name);
    localStorage.setItem('checkin_user_id', guide.user_id);
  };

  const handleCheckInAttempt = (booking: Booking) => {
    setShowConfirm(booking);
    setPhotoBase64(null);
  };

  const handleCapturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const confirmCheckIn = async (status: 'checked_in' | 'no_show') => {
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
    setPhotoBase64(null);
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
    setSearchParams({ date: d.toISOString().split('T')[0] });
  };

  const logout = () => {
    localStorage.removeItem('checkin_guide_id');
    localStorage.removeItem('checkin_guide_name');
    localStorage.removeItem('checkin_user_id');
    window.location.reload();
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

  if (!selectedGuideId) {
    return (
      <div className="min-h-screen bg-[#060608] text-white p-6 flex flex-col items-center justify-center max-w-[480px] mx-auto font-sans">
        <div className="text-center mb-12 animate-fade-in">
          <div className="text-4xl font-black text-gold mb-3 tracking-tighter italic">AURELIA</div>
          <h1 className="text-xl font-bold text-gray-400">Select your name to start</h1>
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
        <div className="text-2xl font-black text-gold tracking-tighter italic">AUR.</div>
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
              <div key={key} className="space-y-4">
                <div className="sticky top-16 z-40 bg-[#060608]/80 backdrop-blur-md py-2 px-3 rounded-2xl border border-white/5 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-gray-400">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-gold" />
                    <span className="text-white">{time}</span>
                    <span className="text-gray-600">·</span>
                    <span>{code}</span>
                  </div>
                  <div>
                    {groupBookings.length} Bookings · {totalPax} Pax
                    {sharedGuideName && (
                      <span className="ml-2 text-gold">· {sharedGuideName}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {groupBookings.map(b => {
                    const cRecord = checkins.find(c => c.booking_ref === b.booking_ref);
                    const isDone = cRecord?.status === 'checked_in';
                    const isNoShow = cRecord?.status === 'no_show';
                    const assignment = assignments.find(a => a.booking_ref === b.booking_ref);
                    const assignedGuide = guides.find(g => g.id === assignment?.guide_id);

                    return (
                      <div key={b.id} className="bg-white/5 border border-white/10 rounded-[2.5rem] p-6 space-y-5 shadow-xl">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black bg-white/10 px-2 py-0.5 rounded text-gold uppercase">{b.channel || 'OTA'}</span>
                              <span className="text-[10px] font-mono text-gray-500 font-bold">{b.booking_ref}</span>
                            </div>
                            <h3 className="text-xl font-black leading-tight">{b.customer_name}</h3>
                          </div>
                          {isDone && <div className="bg-green-500/20 p-2 rounded-full"><CheckCircle2 className="text-green-500" size={24} /></div>}
                          {isNoShow && <div className="bg-red-500/20 p-2 rounded-full"><XCircle className="text-red-500" size={24} /></div>}
                        </div>

                        <div className="grid grid-cols-2 gap-y-4 text-[13px] font-bold">
                          <div className="flex items-center gap-3 text-gray-400">
                            <Phone size={16} />
                            <a href={`tel:${b.customer_phone}`} className="text-white">{b.customer_phone || 'No phone'}</a>
                          </div>
                          <div className="flex items-center gap-3 text-gray-400 justify-end">
                            <Calendar size={16} />
                            <span className="text-white">
                              {new Date(b.travel_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-gray-400">
                            <Tag size={16} />
                            <span className="text-white truncate max-w-[120px]">{b.product_name || b.product_code}</span>
                          </div>
                          <div className="flex items-center gap-3 text-gray-400 justify-end">
                            <Users size={16} />
                            <span className="text-white">A:{b.pax_adult || 0} Y:{b.pax_youth || 0} C:{b.pax_child || 0} I:{b.pax_infant || 0}</span>
                          </div>
                        </div>

                        <div className="pt-2">
                          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2 px-1">Lead Guide</label>
                          <select 
                            value={assignment?.guide_id || ''} 
                            onChange={(e) => handleAssignGuide(b, e.target.value)}
                            className="w-full bg-white/5 border border-white/10 p-3 rounded-2xl text-sm font-bold focus:border-gold/50 outline-none appearance-none"
                            disabled={isDone || isNoShow}
                          >
                            <option value="">-- No guide assigned --</option>
                            {guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </div>

                        {!(isDone || isNoShow) ? (
                          <div className="grid grid-cols-2 gap-4 pt-2">
                            <button 
                              onClick={() => handleCheckInAttempt(b)}
                              className="bg-gold text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-gold/20 active:scale-95"
                            >
                              Check In
                            </button>
                            <button 
                              onClick={() => confirmCheckIn('no_show')} // direct for no-show or add modal? user said Confirm screen for check-in
                              className="bg-red-500/10 border border-red-500/20 text-red-500 py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95"
                            >
                              No Show
                            </button>
                          </div>
                        ) : (
                          <div className="text-center py-3 bg-white/[0.02] rounded-2xl border border-white/5">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                              {isDone ? 'Checked In' : 'No Show Entry'} · {new Date(cRecord.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
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

      {/* CONFIRMATION / PHOTO MODAL */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-fade-in">
          <div className="bg-[#0f0f12] border border-white/10 rounded-[3rem] w-full max-w-sm shadow-2xl p-8 space-y-8 animate-slide-up">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black">Confirm Check-in</h2>
              <p className="text-xs text-gray-500 uppercase tracking-widest">Customer: {showConfirm.customer_name}</p>
              <div className="flex flex-col items-center gap-1 pt-2">
                <div className="flex items-center gap-2 text-white font-bold">
                  <span className="text-lg">👥</span>
                  <span>A:{showConfirm.pax_adult || 0} Y:{showConfirm.pax_youth || 0} C:{showConfirm.pax_child || 0} I:{showConfirm.pax_infant || 0}</span>
                </div>
                <p className="text-[10px] font-black uppercase text-gold">({(showConfirm.pax_adult || 0) + (showConfirm.pax_youth || 0) + (showConfirm.pax_child || 0) + (showConfirm.pax_infant || 0)} total)</p>
              </div>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square bg-white/5 border-2 border-dashed border-white/10 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 cursor-pointer overflow-hidden relative group"
            >
              {photoBase64 ? (
                <img src={photoBase64} className="w-full h-full object-cover" />
              ) : (
                <>
                  <Camera size={32} className="text-gray-600 group-hover:text-gold transition-colors" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Ticket Photo (Optional)</span>
                </>
              )}
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={fileInputRef}
                className="hidden"
                onChange={handleCapturePhoto}
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => confirmCheckIn('checked_in')}
                className="w-full py-5 bg-gold text-black rounded-2xl font-black text-sm uppercase tracking-[0.1em] shadow-xl shadow-gold/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Check size={20} /> Confirm Check-in
              </button>
              <button 
                onClick={() => setShowConfirm(null)}
                className="w-full py-5 bg-white/5 border border-white/10 rounded-2xl font-bold text-xs uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
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
