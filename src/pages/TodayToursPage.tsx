import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Clock, Calendar as CalendarIcon, CheckCircle2, UserPlus, Users, X, Share2, Copy, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logChange } from '@/lib/changeLog';

export default function TodayToursPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [bookings, setBookings] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [optionRates, setOptionRates] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  
  const [todayStrDate, setTodayStrDate] = useState(new Date().toISOString().split('T')[0]);

  // Modal states
  const [assignModal, setAssignModal] = useState<any | null>(null);
  const [checkinModal, setCheckinModal] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    setTodayStrDate(today);

    const [bRes, gRes, aRes, cRes, rRes] = await Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user.id).eq('travel_date', today).order('travel_time', { ascending: true }),
      supabase.from('guides').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('guide_assignments').select('*').eq('user_id', user.id).eq('travel_date', today),
      supabase.from('checkins').select('*').eq('user_id', user.id).eq('travel_date', today),
      supabase.from('guide_option_rates').select('*').eq('user_id', user.id)
    ]);

    if (bRes.data) setBookings(bRes.data);
    if (gRes.data) setGuides(gRes.data);
    if (aRes.data) setAssignments(aRes.data);
    if (cRes.data) setCheckins(cRes.data);
    if (rRes.data) setOptionRates(rRes.data);
    
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(), 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [user]);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  // Calculate stats
  const totalTours = useMemo(() => {
    const s = new Set();
    bookings.forEach(b => s.add(`${b.travel_time}_${b.product_code}_${b.option_selected}`));
    return s.size;
  }, [bookings]);
  
  const totalPaxExp = bookings.reduce((sum, b) => sum + (Number(b.adult) || 0) + (Number(b.youth) || 0) + (Number(b.children) || 0), 0);
  const totalPaxChecked = checkins.reduce((sum, c) => sum + (Number(c.pax_checked_in) || 0), 0);
  const totalGuides = new Set(assignments.map(a => a.guide_id)).size;
  const totalGuideCosts = assignments.reduce((sum, a) => sum + Number(a.calculated_pay || 0), 0);

  // Group bookings
  const grouped: Record<string, Record<string, Record<string, any[]>>> = {};
  bookings.forEach(b => {
    const time = b.travel_time || 'No Time';
    const prod = b.product_name || b.product_code || 'Unknown Product';
    const opt = b.option_selected || b.option_name || 'Standard';

    if (!grouped[time]) grouped[time] = {};
    if (!grouped[time][prod]) grouped[time][prod] = {};
    if (!grouped[time][prod][opt]) grouped[time][prod][opt] = [];

    grouped[time][prod][opt].push(b);
  });
  const sortedTimes = Object.keys(grouped).sort((a,b) => {
    if(a === 'No Time') return 1; if(b === 'No Time') return -1;
    return a.localeCompare(b);
  });

  // Action handlers
  const handleRemoveAssignment = async (id: string) => {
    if (!confirm('Remove this assigned guide?')) return;
    setAssignments(prev => prev.filter(x => x.id !== id));
    await supabase.from('guide_assignments').delete().eq('id', id);
  };

  const handleConfirmCheckin = async (pax: number, checkedInBy: string) => {
    if (!user || !checkinModal) return;
    const b = checkinModal;
    
    // Optimistic bookings UI update
    setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'DONE' } : x));
    
    // Create checkin
    const cPayload = {
      user_id: user.id,
      booking_ref: b.booking_ref,
      travel_date: todayStrDate,
      checked_in_at: new Date().toISOString(),
      checked_in_by: checkedInBy,
      pax_checked_in: pax,
      status: 'checked_in',
      notes: ''
    };
    
    setCheckinModal(null);
    await supabase.from('checkins').insert(cPayload);
    await supabase.from('bookings').update({ status: 'DONE' }).eq('id', b.id);
    
    // Log Booking Status Change
    await logChange(supabase, user.id, {
      tableName: 'bookings',
      recordId: b.booking_ref,
      fieldName: 'status',
      oldValue: b.status || 'CONFIRMED',
      newValue: 'DONE',
      description: `${b.booking_ref} status changed to DONE (Checked In)`
    });

    loadData();
  };

  const handleSaveAssignment = async (payload: any) => {
    if (!user) return;
    await supabase.from('guide_assignments').insert({
      user_id: user.id,
      ...payload
    });
    setAssignModal(null);
    loadData();
  };

  const copyCheckinLink = () => {
    if (!profile?.checkin_token) return alert('No check-in token found. Please visit Settings to generate one.');
    const url = `${window.location.origin}/checkin/${profile.checkin_token}?date=${todayStrDate}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <div className="p-8 pb-32 max-w-5xl mx-auto space-y-8 animate-fade-in">
          
          {/* HEADER */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border/50">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">Today's Tours</h1>
              <div className="flex items-center gap-2 text-muted-foreground font-medium">
                <CalendarIcon size={16} className="text-[#f5a623]" />
                <span>{todayStr}</span>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-3">
              <div className="flex items-center justify-end gap-2 text-2xl font-mono font-bold text-[#f5a623] drop-shadow-md mb-2">
                <Clock size={20} />
                <span>{timeStr}</span>
              </div>
              <button 
                onClick={copyCheckinLink}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all text-gray-400 hover:text-gold"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Share2 size={14} />}
                {copied ? 'Link Copied!' : 'Copy Check-in Link'}
              </button>
            </div>
          </div>

          {/* SUMMARY BAR */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="aurelia-card p-4 border-l-[3px] border-l-[#f5a623]">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Tours</p>
              <p className="text-2xl font-extrabold">{totalTours}</p>
            </div>
            <div className="aurelia-card p-4 border-l-[3px] border-l-blue-500">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Pax Expected</p>
              <p className="text-2xl font-extrabold">{totalPaxExp}</p>
            </div>
            <div className="aurelia-card p-4 border-l-[3px] border-l-green-500">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Pax Checked In</p>
              <p className="text-2xl font-extrabold text-green-400">{totalPaxChecked}</p>
            </div>
            <div className="aurelia-card p-4 border-l-[3px] border-l-purple-500">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Guides Assigned</p>
              <p className="text-2xl font-extrabold text-purple-400">{totalGuides}</p>
            </div>
            <div className="aurelia-card p-4 border-l-[3px] border-l-red-500">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Guide Costs</p>
              <p className="text-2xl font-extrabold text-red-400 font-mono">€{totalGuideCosts.toFixed(2)}</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center p-12"><div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>
          ) : bookings.length === 0 ? (
            <div className="aurelia-card p-12 text-center flex flex-col items-center max-w-md mx-auto mt-12">
              <CalendarIcon size={48} className="text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-bold mb-2">No tours scheduled for today</h3>
              <p className="text-muted-foreground mb-6">Check your ledger or sync from Google Sheets.</p>
            </div>
          ) : (
            <div className="space-y-12">
              {sortedTimes.map(time => (
                <div key={time} className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-[#f5a623] font-bold text-lg bg-[#f5a623]/10 px-4 py-1.5 rounded-full border border-[#f5a623]/20">
                      <Clock size={18} />
                      <span>{time}</span>
                    </div>
                    <div className="h-[1px] flex-1 bg-border/50" />
                  </div>

                  {Object.keys(grouped[time]).map(prod => (
                    <div key={prod} className="pl-6 md:pl-10 space-y-6">
                      {Object.keys(grouped[time][prod]).map(opt => {
                        const rowBookings = grouped[time][prod][opt];
                        const groupExpectedPax = rowBookings.reduce((sum, b) => sum + (Number(b.adult)||0) + (Number(b.youth)||0) + (Number(b.children)||0), 0);
                        
                        // Filter assignments for THIS tour group
                        const grpAssigns = assignments.filter(a => a.travel_time === time && (a.product_code === prod || a.product_name === prod) && a.option_name === opt);

                        return (
                          <div key={opt} className="aurelia-card overflow-hidden border border-[#f5a623]/10 shadow-lg" style={{ borderColor: 'hsl(var(--theme-border))' }}>
                            {/* Group Header */}
                            <div className="bg-[#0f0f17] border-b border-white/5 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                              <div>
                                <h3 className="font-extrabold text-lg flex items-center gap-2">
                                  {prod} <span className="text-gray-500 font-normal">—</span> <span className="text-[#f5a623]">{opt}</span>
                                </h3>
                                <p className="text-xs text-gray-400 mt-1 font-medium">{rowBookings.length} bookings &middot; {groupExpectedPax} expected pax</p>
                              </div>
                              
                              {/* Guide Assignment Section header */}
                              <div className="flex flex-col items-end gap-2">
                                <button 
                                  onClick={() => setAssignModal({ time, prod, opt, totalPax: groupExpectedPax })}
                                  className="aurelia-gold-btn px-4 py-1.5 text-xs font-bold flex items-center gap-2"
                                >
                                  <UserPlus size={14} /> Assign Guide
                                </button>
                              </div>
                            </div>

                            {/* Assigned Guides List */}
                            {grpAssigns.length > 0 && (
                              <div className="bg-[#13131a] border-b border-white/5 px-6 py-3 divide-y divide-white/5">
                                {grpAssigns.map(a => {
                                    const guideInfo = guides.find(g => g.id === a.guide_id);
                                    
                                    const exactMatch = optionRates.find(r => 
                                      r.guide_id === a.guide_id && 
                                      r.product_code === (a.product_code || a.product_name) && 
                                      r.option_name?.toLowerCase() === a.option_name?.toLowerCase()
                                    );
                                    const productMatch = exactMatch ? null : optionRates.find(r => 
                                      r.guide_id === a.guide_id && 
                                      r.product_code === (a.product_code || a.product_name) && 
                                      (!r.option_name || r.option_name === '')
                                    );

                                    const source = a.rate_override ? '(manual)' : (exactMatch ? '(option rate)' : (productMatch ? '(product rate)' : '(base rate)'));
                                    const sourceColor = a.rate_override ? 'text-gold' : (exactMatch || productMatch ? 'text-blue-400' : 'text-gray-500');

                                    return (
                                      <div key={a.id} className="py-2.5 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className="p-1.5 bg-purple-500/10 text-purple-400 rounded-md"><Users size={16} /></div>
                                          <div>
                                            <p className="font-bold text-sm text-white">{guideInfo?.name || 'Unknown Guide'}</p>
                                            <p className="text-xs text-gray-400">Pax Assigned: {a.pax_count}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                          <div className="text-right">
                                            <p className="font-mono text-sm font-bold text-green-400">€{a.calculated_pay}</p>
                                            <p className={`text-[10px] font-bold uppercase tracking-tight ${sourceColor}`}>{source}</p>
                                          </div>
                                          <button onClick={() => handleRemoveAssignment(a.id)} className="text-xs text-red-400 hover:text-red-300 transition-colors bg-red-500/10 px-3 py-1.5 rounded font-bold">
                                            Remove
                                          </button>
                                        </div>
                                      </div>
                                    );
                                })}
                              </div>
                            )}

                            {/* Bookings & Checkin List */}
                            <div className="divide-y divide-white/5 pb-2">
                              {rowBookings.map(b => {
                                const isDone = b.status?.toUpperCase() === 'DONE';
                                const cRecord = checkins.find(c => c.booking_ref === b.booking_ref);
                                const isCheckedIn = !!cRecord || isDone;

                                return (
                                  <div key={b.id} className={`px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${isCheckedIn ? 'bg-green-500/[0.03]' : 'hover:bg-white/[0.02]'}`}>
                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                                      <div className="flex items-center gap-3">
                                        {isCheckedIn ? (
                                          <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                                        ) : (
                                          <div className="w-4 h-4 rounded-sm border-2 border-gray-600 shrink-0" />
                                        )}
                                        <div>
                                          <p className="font-bold text-sm text-white truncate">{b.customer_name}</p>
                                          <p className="font-mono text-[10px] text-gray-500">{b.booking_ref}</p>
                                        </div>
                                      </div>
                                      
                                      <div className="text-xs text-muted-foreground w-fit px-2 py-1 bg-black/20 rounded border border-white/5">
                                        <span className="font-bold text-white">A:{b.adult || 0}</span>
                                        {(b.youth > 0 || b.children > 0) && ' · '}
                                        {b.youth > 0 && `Y:${b.youth} `}
                                        {b.children > 0 && `C:${b.children}`}
                                      </div>
                                      
                                      <div>
                                        {isCheckedIn && cRecord && (
                                          <span className="text-[10px] text-green-400/80 font-medium bg-green-500/10 px-2 py-1 rounded">
                                            Checked in at {new Date(cRecord.checked_in_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex justify-end min-w-[120px]">
                                      {!isCheckedIn && (
                                        <button 
                                          onClick={() => setCheckinModal({ ...b, totalPax: (Number(b.adult)||0)+(Number(b.youth)||0)+(Number(b.children)||0) })}
                                          className="aurelia-ghost-btn border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10 px-4 py-1.5 text-xs font-bold rounded"
                                        >
                                          Check In
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- ASSIGNMENT MODAL --- */}
        {assignModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <AssignGuideModal 
              modalData={assignModal}
              guides={guides}
              optionRates={optionRates}
              onClose={() => setAssignModal(null)}
              onSave={handleSaveAssignment}
            />
          </div>
        )}

        {/* --- CHECKIN MODAL --- */}
        {checkinModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <CheckinModal 
              modalData={checkinModal}
              guides={guides}
              onClose={() => setCheckinModal(null)}
              onSave={(pax, by) => handleConfirmCheckin(pax, by)}
            />
          </div>
        )}
      </div>
  );
}

// ────────── SUB-COMPONENTS ──────────

function AssignGuideModal({ modalData, guides, optionRates, onClose, onSave }: any) {
  const [guideId, setGuideId] = useState('');
  const [pax, setPax] = useState(modalData.totalPax || 0);
  const [overridePay, setOverridePay] = useState<string>('');
  
  const calculateResult = useMemo(() => {
    if (!guideId) return { amount: 0, source: 'none' };
    
    if (overridePay && !isNaN(parseFloat(overridePay))) {
      return { amount: parseFloat(overridePay), source: 'manual' };
    }

    const guide = guides.find((x: any) => x.id === guideId);
    if (!guide) return { amount: 0, source: 'none' };

    // Level 2: exact product + option match
    const exactMatch = optionRates.find((r: any) => 
      r.guide_id === guideId &&
      r.product_code === modalData.prod &&
      r.option_name?.toLowerCase() === modalData.opt?.toLowerCase()
    );
    if (exactMatch) return { amount: exactMatch.rate, source: 'option' };

    // Level 3: product code only
    const productMatch = optionRates.find((r: any) =>
      r.guide_id === guideId &&
      r.product_code === modalData.prod &&
      (!r.option_name || r.option_name === '')
    );
    if (productMatch) return { amount: productMatch.rate, source: 'product' };

    // Level 4: base rate fallback
    return { amount: guide.base_rate || 0, source: 'base' };
  }, [guideId, overridePay, guides, optionRates, modalData.prod, modalData.opt]);

  const handleSave = () => {
    if (!guideId) return alert('Select a guide');
    
    onSave({
      guide_id: guideId,
      travel_date: new Date().toISOString().split('T')[0],
      travel_time: modalData.time,
      product_code: modalData.prod,
      option_name: modalData.opt,
      pax_count: pax,
      rate_override: overridePay ? parseFloat(overridePay) : null,
      calculated_pay: calculateResult.amount
    });
  };

  return (
    <div className="bg-[#0f0f17] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0f]">
        <h2 className="font-bold text-lg text-white">Assign Guide</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
      </div>
      
      <div className="p-6 space-y-6">
        <div className="bg-white/5 p-3 rounded-lg border border-white/5 text-sm">
          <p className="text-gray-400">Tour Group</p>
          <p className="font-bold text-white mt-1">{modalData.prod} <span className="text-[#f5a623]">{modalData.opt}</span></p>
          <p className="text-gray-400 mt-0.5">{modalData.time} &middot; {pax} pax assigned</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Select Guide</label>
          <select value={guideId} onChange={e => setGuideId(e.target.value)} className="aurelia-input bg-[#13131a]">
            <option value="">-- Choose Active Guide --</option>
            {guides.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Pax Assigned</label>
            <input type="number" min="0" value={pax} onChange={e => setPax(Number(e.target.value))} className="aurelia-input" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Override €</label>
            <input 
              type="number" 
              placeholder="Manual €"
              value={overridePay} 
              onChange={e => setOverridePay(e.target.value)} 
              className="aurelia-input text-gold font-bold" 
            />
          </div>
        </div>

        {guideId && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Calculated Pay</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-black text-white">€{calculateResult.amount}</p>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  calculateResult.source === 'manual' ? 'bg-gold/20 text-gold' : 
                  calculateResult.source === 'option' ? 'bg-purple-500/20 text-purple-400' : 
                  calculateResult.source === 'product' ? 'bg-blue-500/20 text-blue-400' : 
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {calculateResult.source} rate
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 border-t border-white/5 bg-[#0a0a0f] flex justify-end gap-3">
        <button onClick={onClose} className="aurelia-ghost-btn px-6 py-2 border border-white/20 text-gray-300">Cancel</button>
        <button onClick={handleSave} className="aurelia-gold-btn px-6 py-2 font-bold focus:scale-95 transition-all">Save Assignment</button>
      </div>
    </div>
  );
}

function CheckinModal({ modalData, guides, onClose, onSave }: any) {
  const [pax, setPax] = useState(modalData.totalPax || 0);
  const [by, setBy] = useState('');

  return (
    <div className="bg-[#0f0f17] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0f]">
        <h2 className="font-bold text-lg text-white">Check In Booking</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
      </div>
      
      <div className="p-6 space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold text-white mb-1">{modalData.customer_name}</h3>
          <p className="font-mono text-xs text-[#f5a623]">{modalData.booking_ref}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Pax Checking In</label>
          <input type="number" min="0" value={pax} onChange={e => setPax(Number(e.target.value))} className="aurelia-input text-lg font-bold text-center" />
          <p className="text-xs text-gray-500 mt-1 text-center">Expected: {modalData.totalPax}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Checked In By</label>
          <select value={by} onChange={e => setBy(e.target.value)} className="aurelia-input bg-[#13131a]">
            <option value="">-- Select Person --</option>
            <option value="Coordinator">Coordinator</option>
            {guides.map((g: any) => <option key={g.id} value={g.name}>{g.name}</option>)}
          </select>
        </div>
      </div>

      <div className="p-6 border-t border-white/5 bg-[#0a0a0f] flex justify-end gap-3">
        <button onClick={onClose} className="aurelia-ghost-btn px-6 py-2 border border-white/20 text-gray-300">Cancel</button>
        <button onClick={() => onSave(pax, by || 'Unknown')} className="aurelia-gold-btn px-6 py-2 font-bold flex items-center gap-2">
          <CheckCircle2 size={16} /> Confirm
        </button>
      </div>
    </div>
  );
}
