import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Filter, Calendar, TrendingUp, AlertTriangle } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f5a623', '#8b5cf6', '#64748b', '#f43f5e', '#06b6d4'];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);

  // Filters state
  const [dateMode, setDateMode] = useState<'travel' | 'booking'>('travel');
  const [yearFilter, setYearFilter] = useState('2025');
  const [monthFilter, setMonthFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('All');
  const [channelFilter, setChannelFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Load data
  useEffect(() => {
    if (!user) return;
    supabase.from('bookings').select('*').eq('user_id', user.id)
      .then(({ data }) => {
        setBookings(data || []);
        setLoading(false);
      });
  }, [user]);

  // Derived filter options
  const uniqueProducts = useMemo(() => Array.from(new Set(bookings.map(b => b.product_name).filter(Boolean))), [bookings]);
  const uniqueChannels = useMemo(() => Array.from(new Set(bookings.map(b => b.channel).filter(Boolean))), [bookings]);
  const uniqueStatuses = useMemo(() => Array.from(new Set(bookings.map(b => b.status).filter(Boolean))), [bookings]);

  const handleReset = () => {
    setDateMode('travel');
    setYearFilter('All');
    setMonthFilter('All');
    setProductFilter('All');
    setChannelFilter('All');
    setStatusFilter('All');
    setProductDrilldown(null);
  };

  // Filter Data
  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const dStr = dateMode === 'travel' ? b.travel_date : b.booking_date;
      if (!dStr) return false;
      const d = new Date(dStr);

      if (yearFilter !== 'All' && d.getFullYear().toString() !== yearFilter) return false;
      if (monthFilter !== 'All') {
        const mIdx = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(monthFilter);
        if (d.getMonth() !== mIdx) return false;
      }
      if (productFilter !== 'All' && b.product_name !== productFilter) return false;
      if (channelFilter !== 'All' && b.channel !== channelFilter) return false;
      if (statusFilter !== 'All' && b.status !== statusFilter) return false;
      
      return true;
    });
  }, [bookings, dateMode, yearFilter, monthFilter, productFilter, channelFilter, statusFilter]);

  // 1. KPI STRIP
  const kpi = useMemo(() => {
    let totBk = 0;
    let totPax = 0;
    let gross = 0;
    let net = 0;
    filteredBookings.forEach(b => {
      if (['CANCELLED_EARLY', 'CANCELLED_LATE', 'NO_SHOW'].includes(b.status)) return;
      totBk++;
      totPax += (b.pax_adult||0) + (b.pax_youth||0) + (b.pax_child||0) + (b.pax_infant||0);
      gross += (b.gross_revenue||0);
      net += (b.net_profit||0); // Approximation assuming costs are per booking
    });
    return { totBk, totPax, gross, net, margin: gross > 0 ? net / gross : 0 };
  }, [filteredBookings]);

  // 2. REVENUE TREND
  const [trendMode, setTrendMode] = useState<'Monthly' | 'By Product' | 'By Channel'>('Monthly');
  
  const trendData = useMemo(() => {
    const map: Record<string, any> = {};
    filteredBookings.forEach(b => {
      if (['CANCELLED_EARLY', 'CANCELLED_LATE', 'NO_SHOW'].includes(b.status)) return;
      const dStr = dateMode === 'travel' ? b.travel_date : b.booking_date;
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return;
      
      const monStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!map[monStr]) map[monStr] = { month: monStr, sort: d.getTime(), Gross: 0, Net: 0 };
      
      if (trendMode === 'Monthly') {
        map[monStr].Gross += (b.gross_revenue||0);
        map[monStr].Net += (b.net_profit||0);
      } else if (trendMode === 'By Product') {
        const p = b.product_name || 'Unknown';
        map[monStr][p] = (map[monStr][p] || 0) + (b.gross_revenue||0);
      } else if (trendMode === 'By Channel') {
        const c = b.channel || 'Unknown';
        map[monStr][c] = (map[monStr][c] || 0) + (b.gross_revenue||0);
      }
    });
    return Object.values(map).sort((a,b) => a.sort - b.sort);
  }, [filteredBookings, trendMode, dateMode]);

  const trendKeys = useMemo(() => {
    if (trendMode === 'Monthly') return [];
    const keys = new Set<string>();
    trendData.forEach(d => Object.keys(d).forEach(k => { if (k !== 'month' && k !== 'sort') keys.add(k); }));
    return Array.from(keys);
  }, [trendData, trendMode]);

  // 3. CHARTS SIDE BY SIDE
  const donutData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredBookings.forEach(b => {
      const s = b.status || 'UNKNOWN';
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [filteredBookings]);

  const channelBarData = useMemo(() => {
    const map: Record<string, {Gross: number, Net: number}> = {};
    filteredBookings.forEach(b => {
      if (['CANCELLED_EARLY', 'CANCELLED_LATE', 'NO_SHOW'].includes(b.status)) return;
      const c = b.channel || 'Unknown';
      if (!map[c]) map[c] = {Gross:0, Net:0};
      map[c].Gross += (b.gross_revenue||0);
      map[c].Net += (b.net_profit||0);
    });
    return Object.entries(map).map(([name, vals]) => ({ name, ...vals })).sort((a,b) => b.Gross - a.Gross);
  }, [filteredBookings]);

  // 4. MONTHLY BREAKDOWN TABLE
  const monthlyTable = useMemo(() => {
    const map: Record<string, any> = {};
    filteredBookings.forEach(b => {
      const dStr = dateMode === 'travel' ? b.travel_date : b.booking_date;
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return;
      const monStr = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
      
      if (!map[monStr]) map[monStr] = { month: monStr, sort: d.getTime(), bk: 0, pax: 0, gross: 0, comm: 0, netr: 0, costs: 0, netp: 0, cancLoss: 0 };
      
      const isCanc = ['CANCELLED_EARLY', 'CANCELLED_LATE', 'NO_SHOW'].includes(b.status);
      if (isCanc) {
        map[monStr].cancLoss += (b.ticket_cost||0);
      } else {
        map[monStr].bk++;
        map[monStr].pax += (b.pax_adult||0) + (b.pax_youth||0) + (b.pax_child||0) + (b.pax_infant||0);
        map[monStr].gross += (b.gross_revenue||0);
        map[monStr].comm += (b.marketplace_fee||0);
        map[monStr].netr += (b.net_revenue||0);
        map[monStr].costs += (b.ticket_cost||0) + (b.guide_cost||0) + (b.extra_cost||0);
        map[monStr].netp += (b.net_profit||0);
      }
    });

    const arr = Object.values(map).sort((a,b) => b.sort - a.sort).map(m => ({
      ...m,
      margin: m.gross > 0 ? m.netp / m.gross : 0
    }));

    // Add total row
    if (arr.length > 0) {
      const tot = arr.reduce((s, row) => {
        s.bk += row.bk; s.pax += row.pax; s.gross += row.gross; 
        s.comm += row.comm; s.netr += row.netr; s.costs += row.costs; 
        s.netp += row.netp; s.cancLoss += row.cancLoss;
        return s;
      }, { month: 'TOTAL', sort: -1, bk: 0, pax: 0, gross: 0, comm: 0, netr: 0, costs: 0, netp: 0, cancLoss: 0 } as any);
      tot.margin = tot.gross > 0 ? tot.netp / tot.gross : 0;
      arr.push(tot);
    }
    return arr;
  }, [filteredBookings, dateMode]);

  // 5. PRODUCT DEEP DIVE
  const [productDrilldown, setProductDrilldown] = useState<string | null>(null);

  const productList = useMemo(() => {
    const map: Record<string, {bk: number, gross: number, net: number}> = {};
    filteredBookings.forEach(b => {
      if (['CANCELLED_EARLY', 'CANCELLED_LATE', 'NO_SHOW'].includes(b.status)) return;
      const p = b.product_name || 'Unknown';
      if (!map[p]) map[p] = {bk: 0, gross: 0, net: 0};
      map[p].bk++;
      map[p].gross += (b.gross_revenue||0);
      map[p].net += (b.net_profit||0);
    });
    return Object.entries(map).map(([name, vals]) => ({
      name, ...vals, margin: vals.gross > 0 ? vals.net / vals.gross : 0
    })).sort((a,b) => b.gross - a.gross);
  }, [filteredBookings]);

  const activeProductData = useMemo(() => {
    if (!productDrilldown) return null;
    const prodBks = filteredBookings.filter(b => b.product_name === productDrilldown && !['CANCELLED_EARLY', 'CANCELLED_LATE', 'NO_SHOW'].includes(b.status));
    
    // Bar chart
    const monMap: Record<string, number> = {};
    const optMap: Record<string, any> = {};
    const chanMap: Record<string, number> = {};

    prodBks.forEach(b => {
      const d = new Date(dateMode === 'travel' ? b.travel_date : b.booking_date);
      if (!isNaN(d.getTime())) {
        const m = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
        monMap[m] = (monMap[m] || 0) + (b.gross_revenue||0);
      }
      
      const opt = b.option_name || 'Default';
      if (!optMap[opt]) optMap[opt] = { opt, bk: 0, gross: 0, net: 0 };
      optMap[opt].bk++; optMap[opt].gross += (b.gross_revenue||0); optMap[opt].net += (b.net_profit||0);
      
      const c = b.channel || 'Unknown';
      chanMap[c] = (chanMap[c] || 0) + (b.gross_revenue||0);
    });

    const monthBars = Object.entries(monMap).map(([m,v]) => ({ month: m, rev: v }));
    const options = Object.values(optMap).map(o => ({ ...o, margin: o.gross > 0 ? o.net / o.gross : 0 })).sort((a,b) => b.gross - a.gross);
    
    let topChan = { name: 'None', v: 0 };
    Object.entries(chanMap).forEach(([n,v]) => { if (v > topChan.v) topChan = {name: n, v}; });
    
    let bestMon = { name: 'None', v: 0 };
    monthBars.forEach(mb => { if (mb.rev > bestMon.v) bestMon = {name: mb.month, v: mb.rev}; });

    return { monthBars, options, topChan: topChan.name, bestMon: bestMon.name };
  }, [filteredBookings, productDrilldown, dateMode]);

  // 6. PIPELINE SCATTER PLOT
  const scatterData = useMemo(() => {
    const arr: any[] = [];
    filteredBookings.forEach(b => {
      if (['CANCELLED_EARLY', 'CANCELLED_LATE', 'NO_SHOW'].includes(b.status)) return;
      if (!b.booking_date || !b.travel_date) return;
      const bd = new Date(b.booking_date).getTime();
      const td = new Date(b.travel_date).getTime();
      const leadMs = td - bd;
      if (leadMs < 0) return;
      const leadDays = Math.floor(leadMs / (1000*60*60*24));
      
      arr.push({
        x: bd,
        y: td,
        z: (b.gross_revenue||0), // size
        channel: b.channel || 'Other',
        leadDays,
        bookingRef: b.booking_ref,
        travelDate: b.travel_date
      });
    });
    return arr;
  }, [filteredBookings]);

  const pipelineStats = useMemo(() => {
    if (scatterData.length === 0) return null;
    let sum = 0, max = 0;
    const freq: Record<number, number> = {};
    scatterData.forEach(d => {
      sum += d.leadDays;
      if (d.leadDays > max) max = d.leadDays;
      freq[d.leadDays] = (freq[d.leadDays] || 0) + 1;
    });
    let mostFreq = { days: 0, count: 0 };
    Object.entries(freq).forEach(([d, c]) => { if (c > mostFreq.count) mostFreq = {days: Number(d), count: c}; });
    
    return { avg: Math.round(sum / scatterData.length), max, mostCommon: mostFreq.days };
  }, [scatterData]);

  // 7. CANCELLATION ANALYSIS
  const cancelData = useMemo(() => {
    const cancs = bookings.filter(b => ['CANCELLED_EARLY', 'CANCELLED_LATE', 'NO_SHOW'].includes(b.status));
    const totBk = bookings.length;
    
    let revLost = 0;
    let tickLost = 0;
    const monMap: Record<string, {c: number, t: number}> = {};
    
    cancs.forEach(b => {
      revLost += (b.gross_revenue||0);
      tickLost += (b.ticket_cost||0);
      
      const d = new Date(b.travel_date);
      if (!isNaN(d.getTime())) {
        const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (!monMap[m]) monMap[m] = {c:0, t:0};
        monMap[m].c++;
      }
    });

    bookings.forEach(b => {
       const d = new Date(b.travel_date);
       if (!isNaN(d.getTime())) {
        const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (monMap[m]) monMap[m].t++;
       }
    });

    const chart = Object.entries(monMap).sort((a,b) => a[0].localeCompare(b[0])).map(([m,v]) => ({
      month: m, cancels: v.c, rate: v.t > 0 ? (v.c / v.t)*100 : 0
    }));

    const table = [...cancs].sort((a,b) => (b.ticket_cost||0) - (a.ticket_cost||0)).slice(0, 50);

    return { 
      rate: totBk > 0 ? (cancs.length / totBk)*100 : 0, 
      revLost, 
      tickLost, 
      chart, 
      table 
    };
  }, [bookings]);

  const fmtE = (v: number) => `€${v.toLocaleString(undefined, {maximumFractionDigits:0})}`;
  const fmtP = (v: number) => `${(v*100).toFixed(1)}%`;

  if (loading) return <div className="p-16 flex justify-center"><div className="animate-spin w-8 h-8 rounded-full border-t-2 border-gold" /></div>;

  return (
    <div className="p-8 pb-32 max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <Filter className="text-gold" size={24} />
        <h1 className="text-2xl font-bold">Analytics Explorer</h1>
      </div>

      {/* FILTERS */}
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-md pt-2 pb-4 mb-6 border-b border-border space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <select className="aurelia-input w-auto py-1.5" value={dateMode} onChange={e => setDateMode(e.target.value as any)}>
            <option value="travel">Travel Date Mode</option>
            <option value="booking">Booking Date Mode</option>
          </select>
          <div className="h-6 w-px bg-border mx-1" />
          <select className="aurelia-input w-auto py-1.5" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
            <option value="All">All Years</option>
            {['2023','2024','2025','2026'].map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="aurelia-input w-auto py-1.5" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
            <option value="All">All Months</option>
            {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m => <option key={m}>{m}</option>)}
          </select>
          <select className="aurelia-input w-40 py-1.5" value={productFilter} onChange={e => setProductFilter(e.target.value)}>
            <option value="All">All Products</option>
            {uniqueProducts.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="aurelia-input w-32 py-1.5" value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
            <option value="All">All Channels</option>
            {uniqueChannels.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="aurelia-input w-36 py-1.5" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          
          <div className="flex-1" />
          <button onClick={handleReset} className="aurelia-ghost-btn px-4 py-1.5">Reset Filters</button>
        </div>
      </div>

      {/* ROW 1: KPI STRIP */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="aurelia-card p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Total Bookings</div>
          <div className="text-2xl font-black tabular-nums">{kpi.totBk}</div>
        </div>
        <div className="aurelia-card p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Total Pax</div>
          <div className="text-2xl font-black tabular-nums">{kpi.totPax}</div>
        </div>
        <div className="aurelia-card p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Gross Revenue</div>
          <div className="text-2xl font-black tabular-nums">{fmtE(kpi.gross)}</div>
        </div>
        <div className="aurelia-card p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Net Profit</div>
          <div className={`text-2xl font-black tabular-nums ${kpi.net >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>{fmtE(kpi.net)}</div>
        </div>
        <div className="aurelia-card p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Avg Margin %</div>
          <div className="text-2xl font-black tabular-nums">{fmtP(kpi.margin)}</div>
        </div>
      </div>

      {/* ROW 2: REVENUE TREND */}
      <div className="aurelia-card p-5 mb-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Revenue Trend</h2>
          <div className="flex bg-white/5 p-1 rounded-lg">
            {['Monthly', 'By Product', 'By Channel'].map(m => (
              <button key={m} onClick={() => setTrendMode(m as any)} 
                className={`px-3 py-1 text-xs rounded-md transition-all ${trendMode === m ? 'bg-background font-bold shadow-sm border border-border/50 text-foreground' : 'text-muted-foreground'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--tw-border-opacity) / 0.1)" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickMargin={12} />
              <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `€${v/1000}k`} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v: number) => fmtE(v)}
                itemSorter={(item) => -(item.value as number)}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              
              {trendMode === 'Monthly' ? (
                <>
                  <Line yAxisId="left" type="monotone" dataKey="Gross" stroke="hsl(var(--theme-accent))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line yAxisId="left" type="monotone" dataKey="Net" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                </>
              ) : (
                trendKeys.map((k, i) => (
                  <Line key={k} yAxisId="left" type="monotone" dataKey={k} name={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                ))
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ROW 3: TWO CHARTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="aurelia-card p-5">
          <h2 className="text-sm font-bold tracking-widest text-muted-foreground uppercase mb-4">Bookings by Status</h2>
          <div className="h-[260px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={2} dataKey="value" stroke="transparent">
                  {donutData.map((e, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
              <span className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase mb-1">Total</span>
              <span className="text-xl font-black">{kpi.totBk + (bookings.length - kpi.totBk)}</span>
            </div>
          </div>
        </div>

        <div className="aurelia-card p-5">
          <h2 className="text-sm font-bold tracking-widest text-muted-foreground uppercase mb-4">Revenue by Channel</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelBarData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--tw-border-opacity) / 0.1)" />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={80} />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `€${v/1000}k`} />
                <Tooltip cursor={{ fill: 'hsl(var(--hover))' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} formatter={(v: number) => fmtE(v)} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Gross" fill="hsl(var(--theme-accent))" radius={[0,4,4,0]} />
                <Bar dataKey="Net" fill="#10b981" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ROW 4: MONTHLY TABLE */}
      <div className="aurelia-card overflow-hidden mb-6">
        <div className="p-4 bg-muted/20 border-b border-border">
          <h2 className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Month by Month Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#13131a] border-b border-border text-[10px] uppercase text-muted-foreground tracking-wider">
                <th className="py-3 px-4 font-bold">Month</th>
                <th className="py-3 px-3 font-bold text-center">Bookings</th>
                <th className="py-3 px-3 font-bold text-center">Pax</th>
                <th className="py-3 px-3 font-bold text-right">Gross Rev</th>
                <th className="py-3 px-3 font-bold text-right">Commission</th>
                <th className="py-3 px-3 font-bold text-right">Net Rev</th>
                <th className="py-3 px-3 font-bold text-right">Costs</th>
                <th className="py-3 px-4 font-bold text-right">Net Profit</th>
                <th className="py-3 px-4 font-bold text-right">Margin %</th>
                <th className="py-3 px-4 font-bold text-right text-red-400">Cancel Loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {monthlyTable.map(m => (
                <tr key={m.month} className={`hover:bg-white/5 transition-colors cursor-pointer ${m.sort === -1 ? 'bg-primary/5 font-bold' : ''}`}
                    onClick={() => m.sort !== -1 && setMonthFilter(m.month.split(' ')[0])}>
                  <td className="py-3 px-4 font-semibold">{m.month}</td>
                  <td className="py-3 px-3 text-center tabular-nums">{m.bk}</td>
                  <td className="py-3 px-3 text-center tabular-nums">{m.pax}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{fmtE(m.gross)}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">{fmtE(m.comm)}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{fmtE(m.netr)}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">{fmtE(m.costs)}</td>
                  <td className="py-3 px-4 text-right tabular-nums">{fmtE(m.netp)}</td>
                  <td className={`py-3 px-4 text-right tabular-nums font-bold ${
                    m.margin > 0.4 ? 'text-profit-positive' : m.margin >= 0.2 ? 'text-gold' : 'text-profit-negative'
                  }`}>{fmtP(m.margin)}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-red-400 font-medium">{m.cancLoss > 0 ? fmtE(m.cancLoss) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROW 5: PRODUCT DEEP DIVE */}
      <h2 className="text-sm font-bold tracking-widest text-muted-foreground uppercase mb-4 mt-12 flex items-center gap-2">
        <Package size={16} /> Product Performance
      </h2>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <div className="aurelia-card flex flex-col h-[500px]">
          <div className="p-4 border-b border-border bg-muted/20">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select Product</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 aurelia-scrollbar">
            {productList.map(p => (
              <button key={p.name} onClick={() => setProductDrilldown(p.name)}
                className={`w-full text-left p-3 rounded-lg flex items-center justify-between border transition-all ${
                  productDrilldown === p.name ? 'border-primary bg-primary/10 pl-4' : 'border-transparent hover:bg-white/5 bg-white-[0.02]'
                }`}>
                <div className="overflow-hidden flex-1 pr-2">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{p.bk} bookings</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold tabular-nums text-sm">{fmtE(p.gross)}</div>
                  <div className={`text-[10px] tabular-nums font-bold ${p.margin > 0.4 ? 'text-profit-positive' : p.margin >= 0.2 ? 'text-gold' : 'text-profit-negative'}`}>
                    {fmtP(p.margin)} margin
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="xl:col-span-2 flex flex-col gap-6">
          {!activeProductData ? (
            <div className="aurelia-card flex-1 flex flex-col items-center justify-center p-8 text-center bg-muted/5 border-dashed">
              <TrendingUp size={48} className="text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground font-medium">Select a product from the list to view its deep dive analytics.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="aurelia-card p-5 border-l-[3px] border-l-blue-500">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Top Channel</div>
                  <div className="text-lg font-black">{activeProductData.topChan}</div>
                </div>
                <div className="aurelia-card p-5 border-l-[3px] border-l-emerald-500">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Best Month</div>
                  <div className="text-lg font-black">{activeProductData.bestMon}</div>
                </div>
              </div>

              <div className="aurelia-card p-5 h-[240px]">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Revenue History</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeProductData.monthBars} margin={{ left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--tw-border-opacity) / 0.1)" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `€${v/1000}k`} />
                    <Tooltip cursor={{ fill: 'hsl(var(--hover))' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} formatter={(v: number) => fmtE(v)} />
                    <Bar dataKey="rev" fill="hsl(var(--theme-accent))" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="aurelia-card overflow-hidden">
                <div className="p-4 bg-muted/20 border-b border-border">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Option Performance</h3>
                </div>
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-[#13131a] border-b border-border text-[10px] uppercase text-muted-foreground tracking-wider">
                      <th className="py-2.5 px-4 font-bold">Option Name</th>
                      <th className="py-2.5 px-3 font-bold text-center">Bookings</th>
                      <th className="py-2.5 px-4 font-bold text-right">Gross Rev</th>
                      <th className="py-2.5 px-4 font-bold text-right">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {activeProductData.options.map(o => (
                      <tr key={o.opt} className="hover:bg-white/5 transition-colors">
                        <td className="py-2.5 px-4 font-medium">{o.opt}</td>
                        <td className="py-2.5 px-3 text-center tabular-nums">{o.bk}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{fmtE(o.gross)}</td>
                        <td className={`py-2.5 px-4 text-right tabular-nums font-bold ${o.margin > 0.4 ? 'text-profit-positive' : o.margin >= 0.2 ? 'text-gold' : 'text-profit-negative'}`}>{fmtP(o.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ROW 6: PIPELINE SCATTER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        <div className="lg:col-span-2 aurelia-card p-5">
           <h2 className="text-sm font-bold tracking-widest text-muted-foreground uppercase mb-6 flex items-center gap-2">
            <Calendar size={16} /> Booking Pipeline Analysis
          </h2>
          <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
               <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--tw-border-opacity) / 0.1)" />
                  <XAxis type="number" dataKey="x" domain={['auto', 'auto']} name="Booking Date" stroke="hsl(var(--muted-foreground))" fontSize={11} 
                    tickFormatter={(unix) => new Date(unix).toLocaleDateString(undefined, {month:'short', year:'2-digit'})} />
                  <YAxis type="number" dataKey="y" domain={['auto', 'auto']} name="Travel Date" stroke="hsl(var(--muted-foreground))" fontSize={11}
                    tickFormatter={(unix) => new Date(unix).toLocaleDateString(undefined, {month:'short'})} />
                  <ZAxis type="number" dataKey="z" range={[20, 400]} name="Revenue" />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(v: any, name: string) => {
                      if (name === 'Booking Date' || name === 'Travel Date') return new Date(v).toLocaleDateString();
                      if (name === 'Revenue') return fmtE(v as number);
                      return v;
                    }}
                  />
                  {uniqueChannels.map((c, i) => (
                    <Scatter key={c} name={c} data={scatterData.filter(d => d.channel === c)} fill={COLORS[i % COLORS.length]} fillOpacity={0.6} />
                  ))}
               </ScatterChart>
             </ResponsiveContainer>
          </div>
        </div>
        
        <div className="aurelia-card p-5 flex flex-col justify-center">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-6">Lead Time Patterns</h3>
          {pipelineStats ? (
            <div className="space-y-6">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Average Lead Time</div>
                <div className="text-3xl font-black">{pipelineStats.avg} <span className="text-sm font-medium text-muted-foreground">days</span></div>
              </div>
              <div className="h-px w-full bg-border" />
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Longest Lead Time</div>
                <div className="text-2xl font-bold">{pipelineStats.max} <span className="text-sm font-medium text-muted-foreground">days</span></div>
              </div>
              <div className="h-px w-full bg-border" />
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Most Common</div>
                <div className="text-lg font-semibold">{pipelineStats.mostCommon} <span className="text-sm font-medium text-muted-foreground">days before travel</span></div>
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No valid data</span>
          )}
        </div>
      </div>

      {/* ROW 7: CANCELLATIONS */}
      <h2 className="text-sm font-bold tracking-widest text-muted-foreground uppercase mb-4 flex items-center gap-2">
        <AlertTriangle size={16} className="text-red-400" /> Cancellation Intelligence
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="aurelia-card p-5 border-l-[3px] border-l-red-500/50 bg-red-500/5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1 group flex items-center gap-1.5 text-red-400">Cancellation Rate</div>
          <div className="text-2xl font-black text-red-50">{cancelData.rate.toFixed(1)}%</div>
        </div>
        <div className="aurelia-card p-5 border-l-[3px] border-l-orange-500/50">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Revenue Lost</div>
          <div className="text-2xl font-black tabular-nums">{fmtE(cancelData.revLost)}</div>
        </div>
        <div className="aurelia-card p-5 border-l-[3px] border-l-red-500 bg-red-500/10">
          <div className="text-[10px] text-red-400 uppercase tracking-wider font-bold mb-1">Ticket Cost Lost (Non-refundable)</div>
          <div className="text-2xl font-black tabular-nums text-red-100">{fmtE(cancelData.tickLost)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="aurelia-card p-5">
           <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Cancellations by Month</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cancelData.chart} margin={{ left: -10, bottom: 0, top: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--tw-border-opacity) / 0.1)" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis yAxisId="right" orientation="right" stroke="#ef4444" fontSize={11} tickFormatter={v => `${v}%`} />
                  <Tooltip cursor={{ fill: 'hsl(var(--hover))' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', zIndex: 100 }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar yAxisId="left" dataKey="cancels" name="Cancel Count" fill="hsl(var(--muted-foreground)/0.5)" radius={[4,4,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="rate" name="Cancel Rate %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
        </div>

        <div className="lg:col-span-2 aurelia-card overflow-hidden">
          <div className="p-4 bg-muted/20 border-b border-border flex justify-between items-center">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Top Losses</h3>
            <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-bold">TOTAL NON-REFUNDABLE: {fmtE(cancelData.tickLost)}</span>
          </div>
          <div className="overflow-x-auto h-[250px] aurelia-scrollbar">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-[#13131a] z-10">
                <tr className="border-b border-border text-[10px] uppercase text-muted-foreground tracking-wider">
                  <th className="py-2 px-4 font-bold">Ref</th>
                  <th className="py-2 px-3 font-bold">Product</th>
                  <th className="py-2 px-3 font-bold">Travel</th>
                  <th className="py-2 px-3 font-bold text-right">Rev. Lost</th>
                  <th className="py-2 px-4 font-bold text-right text-red-400">Ticket Cost Lost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {cancelData.table.map(b => (
                  <tr key={b.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-2 px-4 font-semibold">{b.booking_ref || '—'}</td>
                    <td className="py-2 px-3 text-muted-foreground truncate max-w-[120px]">{b.product_name}</td>
                    <td className="py-2 px-3 tabular-nums">{b.travel_date}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{fmtE(b.gross_revenue)}</td>
                    <td className="py-2 px-4 text-right tabular-nums text-red-400 font-bold">{b.ticket_cost > 0 ? fmtE(b.ticket_cost) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
