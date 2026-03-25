import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'react-router-dom';
import { Check, X, Clock, User, ArrowLeft, ArrowRight, Sun, UserCheck } from 'lucide-react';

export default function CheckinApp() {
  const [params, setParams] = useSearchParams();
  const urlDate = params.get('date');
  const [currentDate, setCurrentDate] = useState<string>(
    urlDate || new Date().toISOString().split('T')[0]
  );
  
  const [guides, setGuides] = useState<any[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(
    localStorage.getItem('checkin_guide_id')
  );
  
  const [bookings, setBookings] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [products, setProducts] = useState<any[]>([]);

  // Init & Data Fetch
  useEffect(() => {
    // Load config
    const storedProds = localStorage.getItem('aurelia_products');
    if (storedProds) {
      try { setProducts(JSON.parse(storedProds)); } catch(e){}
    }
    
    // Fetch guides
    supabase.from('guides').select('id, name, base_rate, status').eq('status', 'active').then(({ data }) => {
      if (data) setGuides(data);
    });
  }, []);

  const fetchData = async () => {
    try {
      const bRes = await supabase.from('bookings').select('*')
        .eq('travel_date', currentDate)
        .neq('status', 'CANCELLED_EARLY');
      if (bRes.data) setBookings(bRes.data);

      const cRes = await supabase.from('checkins').select('*').eq('travel_date', currentDate);
      if (cRes.data) setCheckins(cRes.data);

      const aRes = await supabase.from('guide_assignments').select('*').eq('travel_date', currentDate);
      if (aRes.data) setAssignments(aRes.data);

      setLastRefreshed(new Date());
    } catch(e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [currentDate]);

  const selectGuide = (id: string) => {
    setSelectedGuideId(id);
    localStorage.setItem('checkin_guide_id', id);
  };

  const activeGuide = guides.find(g => g.id === selectedGuideId);

  // Data processing
  const groups = useMemo(() => {
    const grp: Record<string, any[]> = {};
    for (const b of bookings) {
      const key = `${b.travel_time}|${b.product_code}|${b.option_name}`;
      if (!grp[key]) grp[key] = [];
      grp[key].push(b);
    }
    // Convert to sorted array
    return Object.entries(grp).map(([key, bks]) => {
      const [time, code, opt] = key.split('|');
      const timeParsed = parseInt(time.replace(':', ''));
      return { key, time, code, opt, bookings: bks, timeParsed, totalPax: bks.reduce((s, x) => s + x.total_pax, 0) };
    }).sort((a, b) => a.timeParsed - b.timeParsed);
  }, [bookings]);

  // Actions
  const handleCheckIn = async (b: any) => {
    if (!activeGuide) return alert("Select a guide first!");
    try {
      // Create checkin
      const rec = {
        booking_ref: b.booking_ref,
        travel_date: b.travel_date,
        checked_in_at: new Date().toISOString(),
        checked_in_by: activeGuide.name,
        pax_checked_in: b.total_pax,
        status: 'DONE'
      };
      await supabase.from('checkins').insert(rec);
      // Update booking
      await supabase.from('bookings').update({ status: 'DONE' }).eq('id', b.id);
      fetchData(); // re-sync
    } catch(e) {
      console.error(e);
      alert("Failed to check in");
    }
  };

  const handleNoShow = async (b: any) => {
    if (!activeGuide) return alert("Select a guide first!");
    const c = window.confirm(`Mark ${b.customer_name} as No Show?`);
    if (!c) return;
    try {
      await supabase.from('bookings').update({ status: 'NO_SHOW' }).eq('id', b.id);
      fetchData();
    } catch(e) {
      alert("Failed to mark no show");
    }
  };

  const handleAssignSelf = async (grp: any) => {
    if (!activeGuide) return alert("Select a guide first!");
    
    // attempt to calculate pay based on base_rate or local product mappings
    let pay = activeGuide.base_rate || 0;
    // Look up product to see if tiered
    const prd = products.find((p:any) => p.name === grp.code || p.id === grp.code || p.code === grp.code);
    if (prd?.guidePayOptions?.length > 0) {
       // simplistic match
       const tierDef = prd.guidePayOptions.find((x:any) => x.type === 'tiered');
       if (tierDef?.tiers) {
         const t = tierDef.tiers.find((x:any) => grp.totalPax >= x.min && grp.totalPax <= x.max) || tierDef.tiers[tierDef.tiers.length-1];
         if (t) pay = t.rate;
       }
    }

    try {
      const a = {
        guide_id: activeGuide.id,
        travel_date: currentDate,
        travel_time: grp.time,
        product_code: grp.code,
        option_name: grp.opt,
        pax_count: grp.totalPax,
        calculated_pay: pay,
        rate_type: 'calculated'
      };
      await supabase.from('guide_assignments').insert(a);
      fetchData();
    } catch(e) {
      console.error(e);
      alert("Failed to assign.");
    }
  };

  // Totals
  const assignedGrpTags = assignments.filter(a => a.guide_id === selectedGuideId).map(a => `${a.travel_time}|${a.product_code}|${a.option_name}`);
  const assignedTours = assignedGrpTags.length;
  const myAssignments = assignments.filter(a => a.guide_id === selectedGuideId);
  const estEarnings = myAssignments.reduce((sum, a) => sum + (Number(a.calculated_pay) || 0), 0);
  
  let totalAssignedPax = 0;
  let totalCheckedInPax = 0;
  
  groups.forEach(g => {
    if (assignedGrpTags.includes(g.key)) {
      totalAssignedPax += g.totalPax;
      // sum checked in
      g.bookings.forEach(b => {
        if (b.status === 'DONE') totalCheckedInPax += b.total_pax;
      });
    }
  });

  const changeDate = (offset: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + offset);
    const s = d.toISOString().split('T')[0];
    setCurrentDate(s);
    setParams({ date: s });
  };
  
  const setToday = () => {
    const s = new Date().toISOString().split('T')[0];
    setCurrentDate(s);
    setParams({ date: s });
  };

  const secondsAgo = Math.floor((new Date().getTime() - lastRefreshed.getTime()) / 1000);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans overflow-x-hidden w-full flex justify-center pb-24 touch-manipulation">
      <div className="w-full max-w-[480px] bg-[#0a0a0f] min-h-screen relative shadow-2xl flex flex-col">
        
        {/* HEADER */}
        <header className="sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur border-b border-white/10 px-4 py-4 flex flex-col items-center gap-3">
          <div className="flex items-center justify-between w-full">
            <h1 className="text-xl font-extrabold text-[#f5a623] tracking-widest uppercase">Aurelia</h1>
            <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">
              Updated {secondsAgo}s ago
            </span>
          </div>
          
          <div className="flex items-center justify-between w-full mt-2">
            <button onClick={() => changeDate(-1)} className="p-2 -ml-2 text-gray-400 hover:text-white flex items-center justify-center min-w-[48px] min-h-[48px]">
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col items-center">
              <button onClick={setToday} className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full text-xs font-bold uppercase tracking-widest mb-1 min-h-[36px]">
                <Sun size={14} /> Today
              </button>
              <span className="text-sm font-bold tracking-tight">
                {new Date(currentDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
              </span>
            </div>
            <button onClick={() => changeDate(1)} className="p-2 -mr-2 text-gray-400 hover:text-white flex items-center justify-center min-w-[48px] min-h-[48px]">
              <ArrowRight size={20} />
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 p-4 flex flex-col gap-6">
          
          {/* GUIDE IDENTIFICATION */}
          {!selectedGuideId || !activeGuide ? (
            <div className="bg-[#13131a] rounded-xl border border-white/5 p-6 shadow-xl flex flex-col items-center justify-center gap-4 animate-fade-in mt-6">
              <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center text-gold mb-2">
                <UserCheck size={32} />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight">Who are you?</h2>
              <p className="text-gray-400 text-sm text-center mb-4">Select your profile to manage your assigned tours and daily check-ins.</p>
              
              <div className="w-full flex justify-center gap-3 flex-wrap">
                {guides.map(g => (
                  <button 
                    key={g.id} 
                    onClick={() => selectGuide(g.id)}
                    className="min-h-[56px] w-[45%] bg-white/5 border border-white/10 rounded-xl font-bold flex items-center justify-center text-[15px] active:scale-95 transition-all text-white hover:bg-white/10"
                  >
                    {g.name}
                  </button>
                ))}
                {guides.length === 0 && <p className="text-gray-500 text-sm">No active guides found in system.</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-gold/10 border border-gold/20 rounded-xl p-4 shadow-lg animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold/20 text-gold flex items-center justify-center"><User size={20}/></div>
                <div>
                  <p className="text-sm tracking-tight text-gray-300 font-medium">Checking in as</p>
                  <p className="font-extrabold text-[16px] text-white">👤 {activeGuide.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedGuideId(null)}
                className="text-[11px] uppercase tracking-wider font-bold text-gold/80 hover:text-gold min-h-[44px] px-3 flex items-center"
              >
                Change
              </button>
            </div>
          )}

          {/* TOURS LIST */}
          {selectedGuideId && activeGuide && (
            <div className="space-y-6 mt-2">
              {groups.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Sun size={40} className="mx-auto mb-4 opacity-20" />
                  <p className="font-bold text-lg">No tours found.</p>
                  <p className="text-sm mt-1">There are no operational tours on this date.</p>
                </div>
              ) : (
                groups.map(grp => {
                  const amIAssigned = assignments.some(a => a.guide_id === activeGuide.id && a.travel_time === grp.time && a.product_code === grp.code);
                  const assignmentData = assignments.find(a => a.guide_id === activeGuide.id && a.travel_time === grp.time && a.product_code === grp.code);
                  
                  return (
                    <div key={grp.key} className="bg-[#13131a] rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex flex-col animate-fade-in">
                      {/* Group Header */}
                      <div className="p-4 bg-white/5 border-b border-white/5">
                        <div className="flex items-center gap-2 mb-2 text-[#f5a623] font-bold text-sm tracking-widest uppercase">
                          <Clock size={16} /> {grp.time}
                        </div>
                        <h3 className="font-extrabold text-[17px] leading-tight mb-1">{grp.code}</h3>
                        <p className="text-sm font-medium text-gray-400">
                          {grp.opt && `${grp.opt} · `}{grp.bookings.length} bookings · {grp.totalPax} pax
                        </p>
                        
                        {!amIAssigned ? (
                          <button 
                            onClick={() => handleAssignSelf(grp)}
                            className="mt-4 w-full min-h-[48px] bg-[#f5a623]/10 text-[#f5a623] font-bold text-sm uppercase tracking-wider rounded-xl border border-[#f5a623]/20 flex items-center justify-center active:bg-[#f5a623] active:text-black transition-all"
                          >
                            + Assign myself to this tour
                          </button>
                        ) : (
                          <div className="mt-4 flex items-center justify-between text-xs font-bold text-green-400 bg-green-500/10 px-3 py-2 rounded-lg border border-green-500/20">
                            <span>✅ You are assigned</span>
                            <span>Pay: €{Number(assignmentData?.calculated_pay || 0).toFixed(2)}</span>
                          </div>
                        )}
                      </div>

                      {/* Group Bookings list */}
                      <div className="divide-y divide-white/5">
                        {grp.bookings.map((b: any) => {
                          const isDone = b.status === 'DONE';
                          const isNoShow = b.status === 'NO_SHOW';
                          const checkinRec = checkins.find(c => c.booking_ref === b.booking_ref);
                          
                          return (
                            <div key={b.id} className="p-4 flex flex-col gap-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold text-[15px] mb-1">{b.booking_ref} <span className="text-gray-500 mx-1">|</span> {b.customer_name}</p>
                                  <p className="text-[13px] text-gray-400 font-mono flex gap-2">
                                    <span>{b.pax_adult > 0 && `A:${b.pax_adult} `}{b.pax_child > 0 && `C:${b.pax_child}`}</span>
                                    <span>· €{b.gross_revenue}</span>
                                  </p>
                                </div>
                                {isDone && (
                                  <span className="text-xs font-bold uppercase tracking-widest text-green-400 flex items-center gap-1 mt-1">
                                    <Check size={12}/> Checked
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex flex-row gap-2 mt-1">
                                <button 
                                  onClick={() => handleCheckIn(b)}
                                  disabled={isDone}
                                  className={`flex-1 min-h-[48px] rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                    isDone 
                                      ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                                      : 'bg-white/5 text-white border border-white/10 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30 active:scale-95'
                                  }`}
                                >
                                  {isDone ? (
                                    <>
                                      <Check size={18} /> 
                                      {checkinRec ? `Checked in ${new Date(checkinRec.checked_in_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}` : 'Checked In'}
                                    </>
                                  ) : '✓ Check In'}
                                </button>
                                
                                <button 
                                  onClick={() => handleNoShow(b)}
                                  disabled={isNoShow || isDone}
                                  className={`w-[60px] min-h-[48px] rounded-xl flex items-center justify-center transition-all ${
                                    isNoShow
                                      ? 'bg-red-500/20 text-red-500 border border-red-500/30'
                                      : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-red-500/10 hover:text-red-500 active:scale-95'
                                  }`}
                                >
                                  {isNoShow ? <X size={20}/> : <X size={20}/>}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* BOTTOM FIXED SUMMARY BAR */}
        {selectedGuideId && activeGuide && (
          <div className="fixed bottom-0 left-0 right-0 w-full flex justify-center pointer-events-none z-50">
            <div className="w-full max-w-[480px] bg-[#0a0a0f]/95 backdrop-blur-md border-t border-white/10 p-4 pointer-events-auto shadow-[0_-10px_40px_rgba(0,0,0,0.8)] px-5 pb-8 sm:pb-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-gray-400 font-medium">Tours</span>
                  <span className="font-extrabold text-white">{assignedTours}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-gray-400 font-medium">Earned</span>
                  <span className="font-extrabold text-gold">€{estEarnings.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-gray-400 font-medium">Assigned Pax</span>
                  <span className="font-extrabold text-white">{totalAssignedPax}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-gray-400 font-medium">Checked In</span>
                  <span className="font-extrabold text-green-400">{totalCheckedInPax} <span className="text-gray-600 font-normal">/ {totalAssignedPax}</span></span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
