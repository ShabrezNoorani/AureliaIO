import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import AureliaSidebar from '@/components/AureliaSidebar';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Calendar as CalendarIcon, FileDown, ArrowLeft, Euro, Users, Activity, BarChart2 } from 'lucide-react';
import { generateGuideInvoice } from '@/lib/generateInvoice';

export default function GuideDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [dateMode, setDateMode] = useState<'today' | 'yesterday' | 'month' | 'mtd' | 'ytd' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [guides, setGuides] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>('ALL');

  // Fetch guides
  useEffect(() => {
    supabase.from('guides').select('*').order('name').then(({ data }) => {
      if (data) setGuides(data);
    });
  }, []);

  // Fetch assignments on date change
  useEffect(() => {
    if (!user) return;
    const loadAssignments = async () => {
      const today = new Date();
      let s = '', e = '';

      if (dateMode === 'today') {
        s = e = today.toISOString().split('T')[0];
      } else if (dateMode === 'yesterday') {
        const y = new Date(); y.setDate(y.getDate() - 1);
        s = e = y.toISOString().split('T')[0];
      } else if (dateMode === 'month') {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        s = first.toISOString().split('T')[0];
        e = last.toISOString().split('T')[0];
      } else if (dateMode === 'mtd') {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        s = first.toISOString().split('T')[0];
        e = today.toISOString().split('T')[0];
      } else if (dateMode === 'ytd') {
        const first = new Date(today.getFullYear(), 0, 1);
        s = first.toISOString().split('T')[0];
        e = today.toISOString().split('T')[0];
      } else if (dateMode === 'custom') {
        if (!customStart || !customEnd) return;
        s = customStart;
        e = customEnd;
      }

      const { data } = await supabase
        .from('guide_assignments')
        .select(`
          id, travel_date, travel_time, product_code, option_name, pax_count, calculated_pay, rate_type,
          guide:guides (id, name, guide_number)
        `)
        .eq('user_id', user.id)
        .gte('travel_date', s)
        .lte('travel_date', e)
        .order('travel_date', { ascending: false });

      if (data) setAssignments(data);
    };
    loadAssignments();
  }, [user, dateMode, customStart, customEnd]);

  // Selected Guide logic
  const singleGuide = guides.find(g => g.id === selectedGuideId);
  const filteredAssignments = selectedGuideId === 'ALL' 
    ? assignments 
    : assignments.filter(a => a.guide?.id === selectedGuideId);

  // Summaries
  const totalGuidesActive = new Set(filteredAssignments.map(a => a.guide?.id)).size;
  const totalTours = filteredAssignments.length;
  const totalPax = filteredAssignments.reduce((sum, a) => sum + (a.pax_count || 0), 0);
  const totalCost = filteredAssignments.reduce((sum, a) => sum + Number(a.calculated_pay || 0), 0);

  // Group by guide
  const guideStats = useMemo(() => {
    const stats: Record<string, { g: any, tours: number, pax: number, pay: number }> = {};
    for (const g of guides) {
      stats[g.id] = { g, tours: 0, pax: 0, pay: 0 };
    }
    for (const a of assignments) {
      if (a.guide?.id) {
        if (!stats[a.guide.id]) stats[a.guide.id] = { g: a.guide, tours:0, pax:0, pay:0 };
        stats[a.guide.id].tours++;
        stats[a.guide.id].pax += (a.pax_count || 0);
        stats[a.guide.id].pay += Number(a.calculated_pay || 0);
      }
    }
    return Object.values(stats).filter(s => s.tours > 0 || s.g.status === 'active').sort((a,b) => b.pay - a.pay);
  }, [guides, assignments]);

  // Chart Data (last 6 months for selected guide or all)
  const chartData = useMemo(() => {
    const data: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const k = d.toLocaleDateString('default', { month: 'short', year: 'numeric' });
      data[k] = 0;
    }

    filteredAssignments.forEach(a => {
      if (!a.travel_date) return;
      const d = new Date(a.travel_date);
      const k = d.toLocaleDateString('default', { month: 'short', year: 'numeric' });
      if (data[k] !== undefined) {
        data[k] += Number(a.calculated_pay || 0);
      }
    });

    return Object.entries(data).map(([month, val]) => ({ month, earnings: val }));
  }, [filteredAssignments]);

  const downloadInvoice = (g?: any) => {
    // Collect stats from current bounds
    const tgt = g ? assignments.filter(a => a.guide?.id === g.id) : filteredAssignments;
    if (tgt.length === 0) return alert("No assignments to invoice.");
    generateGuideInvoice(g || tgt[0].guide, tgt, `${dateMode.toUpperCase()}`, "AURELIA");
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      <AureliaSidebar activeView="guides" companyName="AURELIA" onNavigate={(v) => navigate('/app')} onNewProduct={() => {}} />
      <main className="flex-1 ml-[240px]">
        <div className="p-8 pb-32 max-w-7xl mx-auto space-y-8 animate-fade-in text-white">
          
          {/* HEADER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/10">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">Guide Dashboard</h1>
              <p className="text-gray-400 text-sm font-medium">Performance intelligence and invoice generation center</p>
            </div>
          </div>

          {/* TIME FILTERS */}
          <div className="flex flex-col md:flex-row gap-4 items-center p-2 bg-black/40 rounded-xl border border-white/5 shadow-inner">
            <div className="flex bg-[#0f0f17] rounded-lg p-1 border border-white/10">
              {['today', 'yesterday', 'mtd', 'month', 'ytd', 'custom'].map(m => (
                <button
                  key={m}
                  onClick={() => setDateMode(m as any)}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                    dateMode === m ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {m === 'month' ? 'This Month' : m.replace('-', ' ')}
                </button>
              ))}
            </div>
            {dateMode === 'custom' && (
              <div className="flex items-center gap-2 text-sm bg-[#0f0f17] border border-white/10 p-1.5 rounded-lg">
                <input type="date" className="bg-transparent border-none text-gray-300 px-2 outline-none" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                <span className="text-gray-600">to</span>
                <input type="date" className="bg-transparent border-none text-gray-300 px-2 outline-none" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            )}
          </div>

          {/* GUIDE PILLS */}
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setSelectedGuideId('ALL')}
              className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
                selectedGuideId === 'ALL' 
                  ? 'bg-gold text-black border-gold shadow-[0_0_15px_rgba(245,166,35,0.3)]' 
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              All Guides
            </button>
            {guides.map(g => (
              <button 
                key={g.id}
                onClick={() => setSelectedGuideId(g.id)}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
                  selectedGuideId === g.id 
                    ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>

          {/* ALL GUIDES VIEW */}
          {selectedGuideId === 'ALL' ? (
            <div className="space-y-8 animate-fade-in">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="aurelia-card p-5 border-l-[3px] border-l-blue-500">
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <Users size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Active Guides</span>
                  </div>
                  <p className="text-3xl font-extrabold text-white">{totalGuidesActive}</p>
                </div>
                <div className="aurelia-card p-5 border-l-[3px] border-l-green-500">
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <Activity size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Total Tours</span>
                  </div>
                  <p className="text-3xl font-extrabold text-green-400">{totalTours}</p>
                </div>
                <div className="aurelia-card p-5 border-l-[3px] border-l-purple-500">
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <Users size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Pax Served</span>
                  </div>
                  <p className="text-3xl font-extrabold text-purple-400">{totalPax}</p>
                </div>
                <div className="aurelia-card p-5 border-l-[3px] border-l-[#f5a623]">
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <Euro size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Total Guide Costs</span>
                  </div>
                  <p className="text-3xl font-extrabold text-[#f5a623]">€{totalCost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {guideStats.map(({ g, tours, pax, pay }) => (
                  <div key={g.id} className="bg-[#13131a] border border-white/5 p-6 rounded-2xl hover:border-gold/30 transition-all flex flex-col group cursor-pointer shadow-xl relative" onClick={() => setSelectedGuideId(g.id)}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gold/10 text-gold flex items-center justify-center font-bold text-lg border border-gold/20">
                          {g.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-extrabold text-lg text-white group-hover:text-gold transition-colors">{g.name}</p>
                          <p className="text-xs font-mono text-gray-500">{g.guide_number || '---'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm flex-1">
                      <div>
                        <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Tours</p>
                        <p className="font-bold text-white text-lg">{tours}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Pax</p>
                        <p className="font-bold text-white text-lg">{pax}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Earnings</p>
                        <p className="font-bold text-gold text-lg">€{pay.toLocaleString(undefined, {minimumFractionDigits:2})}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Avg per Tour</p>
                        <p className="font-bold text-blue-400 text-lg">€{tours > 0 ? (pay / tours).toLocaleString(undefined, {maximumFractionDigits:2}) : '0'}</p>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-white/5 flex gap-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setSelectedGuideId(g.id)} className="flex-1 aurelia-ghost-btn text-xs py-2">View Details</button>
                      <button onClick={() => downloadInvoice(g)} className="flex-1 aurelia-ghost-btn text-gold border-gold/20 hover:bg-gold/10 text-xs py-2 flex items-center justify-center gap-2"><FileDown size={14}/> Invoice</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            
            /* SINGLE GUIDE VIEW */
            <div className="space-y-6 animate-fade-in">
              {singleGuide && (
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 rounded-full bg-gold/10 text-gold flex items-center justify-center font-extrabold text-2xl border border-gold/20 shadow-[0_0_20px_rgba(245,166,35,0.2)]">
                    {singleGuide.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-3xl font-extrabold text-white">{singleGuide.name}</h2>
                    <p className="text-gray-400 font-mono text-sm">{singleGuide.guide_number}</p>
                  </div>
                  <div className="ml-auto">
                    <button onClick={() => downloadInvoice(singleGuide)} className="aurelia-gold-btn flex items-center gap-2 font-bold px-5 py-2.5 shadow-[0_0_20px_rgba(245,166,35,0.2)]"><FileDown size={16}/> Generate Invoice</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="aurelia-card p-5 border-l-[3px] border-l-green-500 bg-[#13131a]">
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <Activity size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Assigned Tours</span>
                  </div>
                  <p className="text-3xl font-extrabold text-green-400">{totalTours}</p>
                </div>
                <div className="aurelia-card p-5 border-l-[3px] border-l-purple-500 bg-[#13131a]">
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <Users size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Total Pax</span>
                  </div>
                  <p className="text-3xl font-extrabold text-purple-400">{totalPax}</p>
                </div>
                <div className="aurelia-card p-5 border-l-[3px] border-l-[#f5a623] bg-[#13131a]">
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <Euro size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Total Earnings</span>
                  </div>
                  <p className="text-3xl font-extrabold text-[#f5a623]">€{totalCost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
                </div>
                <div className="aurelia-card p-5 border-l-[3px] border-l-blue-500 bg-[#13131a]">
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <BarChart2 size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Avg per Tour</span>
                  </div>
                  <p className="text-3xl font-extrabold text-blue-400">€{totalTours > 0 ? (totalCost/totalTours).toLocaleString(undefined, {maximumFractionDigits:2}) : '0'}</p>
                </div>
              </div>

              {/* CHART & TABLE */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 aurelia-card border border-white/5 bg-[#0f0f17] overflow-hidden rounded-xl shadow-2xl">
                  <div className="px-6 py-4 border-b border-white/5 bg-[#0a0a0f]">
                    <h3 className="font-bold text-white text-sm uppercase tracking-widest">Tour Manifest</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="bg-[#13131a] text-xs text-gray-400 uppercase tracking-widest font-bold">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3">Pax</th>
                          <th className="px-4 py-3 text-right">Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssignments.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-8 text-gray-500">No tours assigned.</td></tr>
                        ) : (
                          filteredAssignments.map(a => (
                            <tr key={a.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                              <td className="px-4 py-3 text-gray-300">{a.travel_date}</td>
                              <td className="px-4 py-3 font-mono">{a.travel_time}</td>
                              <td className="px-4 py-3 font-bold text-white truncate max-w-[200px]" title={`${a.product_code} - ${a.option_name}`}>{a.product_code}<br/><span className="text-gray-500 font-normal text-xs">{a.option_name}</span></td>
                              <td className="px-4 py-3 font-bold">{a.pax_count}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-gold">€{Number(a.calculated_pay||0).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                        <tr className="bg-[#13131a] font-extrabold">
                          <td colSpan={3} className="px-4 py-3 text-right text-white">TOTALS</td>
                          <td className="px-4 py-3 text-white">{totalPax}</td>
                          <td className="px-4 py-3 text-right text-white">€{totalCost.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="aurelia-card p-6 border border-white/5 bg-[#0f0f17] rounded-xl shadow-2xl flex flex-col">
                  <h3 className="font-bold text-white text-sm uppercase tracking-widest mb-6">Earnings History</h3>
                  <div className="flex-1 w-full min-h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis dataKey="month" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `€${value}`} />
                        <RechartsTooltip cursor={{fill: '#ffffff05'}} contentStyle={{backgroundColor: '#0a0a0f', borderColor: '#ffffff20', color: '#fff'}} itemStyle={{color: '#f5a623'}} />
                        <Bar dataKey="earnings" fill="#f5a623" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
