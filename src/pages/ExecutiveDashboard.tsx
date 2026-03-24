import { useState, useMemo } from 'react';
import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useEffect } from 'react';
import { TrendingUp, TrendingDown, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';

const CHANNELS = ['All', 'Viator', 'GYG', 'Airbnb', 'Website', 'Other'];
const QUICK_RANGES = ['YTD', '6M', '3M', '1M', 'Custom'];

function fmtEuro(v: number) {
  if (!v) return '€0';
  if (v < 0) return `-€${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `€${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(v: number) {
  if (!v) return '0%';
  return `${(v * 100).toFixed(1)}%`;
}

export default function ExecutiveDashboard() {
  const { user } = useAuth();
  
  const [bookings, setBookings] = useState<any[]>([]);
  const [adminCosts, setAdminCosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateMode, setDateMode] = useState<'travel' | 'booking'>('travel');
  const [quickRange, setQuickRange] = useState('YTD');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('All');
  const [channelFilter, setChannelFilter] = useState('All');
  const [includeCancelled, setIncludeCancelled] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user.id),
      supabase.from('admin_costs').select('*').eq('user_id', user.id)
    ]).then(([resB, resC]) => {
      setBookings(resB.data || []);
      setAdminCosts(resC.data || []);
      setLoading(false);
    });
  }, [user]);

  // Derived unique products
  const uniqueProducts = useMemo(() => {
    const set = new Set(bookings.map(b => b.product_name).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [bookings]);

  // Set default dates if quick range changes
  useEffect(() => {
    const today = new Date();
    let dFrom = new Date();
    
    if (quickRange === 'YTD') {
      dFrom = new Date(today.getFullYear(), 0, 1);
    } else if (quickRange === '6M') {
      dFrom.setMonth(today.getMonth() - 6);
    } else if (quickRange === '3M') {
      dFrom.setMonth(today.getMonth() - 3);
    } else if (quickRange === '1M') {
      dFrom.setMonth(today.getMonth() - 1);
    }
    
    if (quickRange !== 'Custom') {
      setDateFrom(dFrom.toISOString().split('T')[0]);
      setDateTo(today.toISOString().split('T')[0]);
    }
  }, [quickRange]);

  // Core filtering logic for current vs previous period
  const { currentData, prevData, currentCosts, prevCosts } = useMemo(() => {
    if (!dateFrom || !dateTo) return { currentData: [], prevData: [], currentCosts: [], prevCosts: [] };
    
    const start = new Date(dateFrom).getTime();
    const end = new Date(dateTo).getTime();
    const duration = end - start;
    const prevStart = start - duration;
    const prevEnd = start;

    let bFiltered = bookings;
    if (productFilter !== 'All') bFiltered = bFiltered.filter(b => b.product_name === productFilter);
    if (channelFilter !== 'All') bFiltered = bFiltered.filter(b => b.channel === channelFilter);
    if (!includeCancelled) bFiltered = bFiltered.filter(b => !['CANCELLED_EARLY', 'CANCELLED_LATE'].includes(b.status));

    const currentData = bFiltered.filter(b => {
      const d = new Date(dateMode === 'travel' ? b.travel_date : b.booking_date).getTime();
      return d >= start && d <= end;
    });

    const prevData = bFiltered.filter(b => {
      const d = new Date(dateMode === 'travel' ? b.travel_date : b.booking_date).getTime();
      return d >= prevStart && d < prevEnd;
    });

    // Admin costs are monthly, so we approximate based on if the month falls in the range
    const filterCosts = (startT: number, endT: number) => {
      const sDate = new Date(startT);
      const eDate = new Date(endT);
      return adminCosts.filter(c => {
        const costDate = new Date(c.year, c.month - 1, 15);
        return costDate.getTime() >= sDate.getTime() && costDate.getTime() <= eDate.getTime();
      });
    };

    return {
      currentData,
      prevData,
      currentCosts: filterCosts(start, end),
      prevCosts: filterCosts(prevStart, prevEnd)
    };
  }, [bookings, adminCosts, dateFrom, dateTo, dateMode, productFilter, channelFilter, includeCancelled]);

  // KPIs
  const calcOpProfit = (b: any) => (b.net_revenue || 0) - (b.ticket_cost || 0) - (b.guide_cost || 0) - (b.extra_cost || 0);
  
  const curGross = currentData.reduce((s,b) => s + (b.gross_revenue || 0), 0);
  const prevGross = prevData.reduce((s,b) => s + (b.gross_revenue || 0), 0);
  
  const curOpProfit = currentData.reduce((s,b) => s + calcOpProfit(b), 0);
  const prevOpProfit = prevData.reduce((s,b) => s + calcOpProfit(b), 0);
  
  const curAdmin = currentCosts.reduce((s,c) => s + (c.amount || 0), 0);
  const prevAdmin = prevCosts.reduce((s,c) => s + (c.amount || 0), 0);
  
  const curNet = curOpProfit - curAdmin;
  const prevNet = prevOpProfit - prevAdmin;

  const pctChange = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 1 : 0) : ((cur - prev) / Math.abs(prev));

  // Monthly P&L Chart Data
  const monthlyData = useMemo(() => {
    const map: Record<string, { month: string; sort: number; gross: number; opProfit: number; netProfit: number; admin: number }> = {};
    
    currentData.forEach(b => {
      const d = new Date(dateMode === 'travel' ? b.travel_date : b.booking_date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!map[key]) map[key] = { month: key, sort: d.getTime(), gross: 0, opProfit: 0, netProfit: 0, admin: 0 };
      
      map[key].gross += (b.gross_revenue || 0);
      map[key].opProfit += calcOpProfit(b);
    });

    currentCosts.forEach(c => {
      const key = `${c.year}-${String(c.month).padStart(2,'0')}`;
      if (!map[key]) {
        map[key] = { month: key, sort: new Date(c.year, c.month-1).getTime(), gross: 0, opProfit: 0, netProfit: 0, admin: 0 };
      }
      map[key].admin += (c.amount || 0);
    });

    return Object.values(map).map(m => {
      m.netProfit = m.opProfit - m.admin;
      return m;
    }).sort((a,b) => a.sort - b.sort);
  }, [currentData, currentCosts, dateMode]);

  // Donut Chart Data
  const donutData = useMemo(() => {
    const map: Record<string, number> = {};
    currentData.forEach(b => {
      const c = b.channel || 'Other';
      map[c] = (map[c] || 0) + (b.net_revenue || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [currentData]);
  
  const COLORS = ['#3b82f6', '#10b981', '#f5a623', '#8b5cf6', '#64748b'];

  // Cost Stacked Chart Data
  const costStackData = useMemo(() => {
    const mkpt = currentData.reduce((s,b) => s + (b.marketplace_fee || 0), 0);
    const tick = currentData.reduce((s,b) => s + (b.ticket_cost || 0), 0);
    const guid = currentData.reduce((s,b) => s + (b.guide_cost || 0), 0);
    const extr = currentData.reduce((s,b) => s + (b.extra_cost || 0), 0);
    return [{ 
      name: 'Costs',
      Tickets: tick,
      Guides: guid,
      Extras: extr,
      Commissions: mkpt,
      Admin: curAdmin
    }];
  }, [currentData, curAdmin]);

  // Table Data
  const productPerformance = useMemo(() => {
    const map: Record<string, any> = {};
    currentData.forEach(b => {
      const code = b.product_name || 'Unknown';
      if (!map[code]) map[code] = { code, opts: new Set(), bookings: 0, pax: 0, gross: 0, opProfit: 0, cancelLoss: 0 };
      
      map[code].opts.add(b.option_name || '');
      map[code].bookings += 1;
      map[code].pax += (b.pax_adult || 0) + (b.pax_youth || 0) + (b.pax_child || 0) + (b.pax_infant || 0);
      map[code].gross += (b.gross_revenue || 0);
      map[code].opProfit += calcOpProfit(b);
      
      if (['CANCELLED_EARLY', 'CANCELLED_LATE', 'NO_SHOW'].includes(b.status)) {
        map[code].cancelLoss += (b.ticket_cost || 0);
      }
    });

    return Object.values(map).map(p => ({
      ...p,
      opts: p.opts.size,
      margin: p.gross > 0 ? p.opProfit / p.gross : 0
    })).sort((a,b) => b.opProfit - a.opProfit);
  }, [currentData]);

  // Total Cancellations
  const totalCancelLoss = currentData.filter(b => ['CANCELLED_EARLY', 'CANCELLED_LATE', 'NO_SHOW'].includes(b.status)).reduce((s,b) => s + (b.ticket_cost || 0), 0);

  // ALERTS LOGIC
  const alerts = useMemo(() => {
    const arr = [];
    
    // Alert 1: Margin drop >10%
    const currentMap: Record<string, {gross: number, op: number}> = {};
    currentData.forEach(b => {
      const code = b.product_name || 'Unknown';
      if (!currentMap[code]) currentMap[code] = {gross:0, op:0};
      currentMap[code].gross += (b.gross_revenue||0);
      currentMap[code].op += calcOpProfit(b);
    });
    
    const prevMap: Record<string, {gross: number, op: number}> = {};
    prevData.forEach(b => {
      const code = b.product_name || 'Unknown';
      if (!prevMap[code]) prevMap[code] = {gross:0, op:0};
      prevMap[code].gross += (b.gross_revenue||0);
      prevMap[code].op += calcOpProfit(b);
    });

    let marginDropped = false;
    for (const code in currentMap) {
      if (prevMap[code] && prevMap[code].gross > 0 && currentMap[code].gross > 0) {
        const curM = currentMap[code].op / currentMap[code].gross;
        const prevM = prevMap[code].op / prevMap[code].gross;
        if (prevM - curM > 0.1) {
          arr.push({ type: 'danger', msg: `🔴 ${code} margin dropped ${( (prevM - curM)*100 ).toFixed(1)}% vs previous period` });
          marginDropped = true;
          break; // only push one to avoid spam
        }
      }
    }

    // Alert 2: Cancel Losses
    if (totalCancelLoss > 100) {
      arr.push({ type: 'warning', msg: `🟡 €${Math.round(totalCancelLoss)} in ticket costs lost to cancellations this period` });
    }

    // Alert 3: Best Channel
    if (donutData.length >= 2) {
      const sorted = [...donutData].sort((a,b) => b.value - a.value);
      const diff = sorted[0].value - sorted[1].value;
      arr.push({ type: 'success', msg: `🟢 ${sorted[0].name} generated €${Math.round(diff)} more net revenue than ${sorted[1].name}` });
    }

    // Alert 4: Pipeline
    const upcomingGross = bookings.filter(b => b.status === 'UPCOMING').reduce((s,b) => s + (b.gross_revenue||0), 0);
    if (upcomingGross > 0) {
      arr.push({ type: 'info', msg: `🔵 €${Math.round(upcomingGross)} confirmed revenue in upcoming pipeline bookings` });
    }

    // Alert 5: No guide
    const noGuide = bookings.filter(b => b.status === 'UPCOMING' && !(b.assigned_guide || '').trim()).length;
    if (noGuide > 0) {
      arr.push({ type: 'warning', msg: `🟡 ${noGuide} upcoming tours have no guide assigned` });
    }

    return arr.slice(0, 5);
  }, [currentData, prevData, donutData, totalCancelLoss, bookings]);

  if (loading) return <div className="p-8 flex items-center justify-center h-full"><div className="w-8 h-8 rounded-full border-t-2 border-gold animate-spin" /></div>;

  return (
    <div className="p-8 pb-32 max-w-[1600px] mx-auto animate-fade-in text-foreground">
      
      {/* ── STICKY TOP FILTERS ── */}
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-md pt-2 pb-6 border-b border-border/50 mb-8 space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Row 1 */}
            <div className="bg-white/5 p-1 rounded-lg border border-border flex text-xs">
              <button onClick={() => setDateMode('travel')} className={`px-4 py-1.5 rounded-md transition-colors ${dateMode === 'travel' ? 'bg-background shadow-sm border border-border/50 font-bold' : 'text-muted-foreground'}`}>Travel Date</button>
              <button onClick={() => setDateMode('booking')} className={`px-4 py-1.5 rounded-md transition-colors ${dateMode === 'booking' ? 'bg-background shadow-sm border border-border/50 font-bold' : 'text-muted-foreground'}`}>Booking Date</button>
            </div>

            <div className="bg-white/5 p-1 rounded-lg border border-border flex text-xs ml-4">
              {QUICK_RANGES.map(r => (
                <button key={r} onClick={() => setQuickRange(r)} className={`px-3 py-1.5 rounded-md transition-colors ${quickRange === r ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:bg-white/5'}`}>{r}</button>
              ))}
            </div>

            {quickRange === 'Custom' && (
              <div className="flex items-center gap-2 ml-4">
                <input type="date" className="aurelia-input text-xs w-auto px-2 py-1" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <span className="text-muted-foreground">→</span>
                <input type="date" className="aurelia-input text-xs w-auto px-2 py-1" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {/* Row 2 */}
        <div className="flex items-center gap-3 text-xs">
          <select className="aurelia-input w-48 text-xs py-1.5" value={productFilter} onChange={e => setProductFilter(e.target.value)}>
            {uniqueProducts.map(p => <option key={p} value={p}>{p === 'All' ? 'All Products' : p}</option>)}
          </select>

          <select className="aurelia-input w-40 text-xs py-1.5" value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
            {CHANNELS.map(c => <option key={c} value={c}>{c === 'All' ? 'All Channels' : c}</option>)}
          </select>

          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input type="checkbox" checked={includeCancelled} onChange={e => setIncludeCancelled(e.target.checked)} className="rounded border-border bg-black/20 text-gold focus:ring-gold focus:ring-offset-background" />
            Include Cancelled Bookings
          </label>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <KPICard title="Gross Revenue" value={curGross} prev={prevGross} />
        <KPICard title="Operational Profit" value={curOpProfit} prev={prevOpProfit} />
        <KPICard title="Admin Costs" value={curAdmin} prev={prevAdmin} invertColors />
        <div className={`p-5 rounded-xl border relative overflow-hidden ${curNet >= 0 ? 'bg-profit-positive/10 border-profit-positive/20 text-profit-positive' : 'bg-profit-negative/10 border-profit-negative/20 text-profit-negative'}`}>
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2 opacity-80">Company Net Profit</div>
          <div className="text-3xl font-black tabular-nums tracking-tight mb-2 drop-shadow-sm">{fmtEuro(curNet)}</div>
          <TrendIndicator cur={curNet} prev={prevNet} invertColors={false} />
          {/* Subtle gradient glow */}
          <div className="absolute -inset-10 bg-gradient-to-tr from-transparent via-transparent to-current opacity-5 pointer-events-none" />
        </div>
      </div>

      {/* ── CHARTS ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 aurelia-card p-6">
          <h3 className="text-sm font-bold tracking-wide uppercase text-muted-foreground mb-6">Monthly P&L</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--tw-border-opacity) / 0.1)" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickMargin={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(val) => `€${val/1000}k`} />
                <RechartsTooltip 
                  cursor={{ fill: 'hsl(var(--hover))' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  formatter={(value: number) => fmtEuro(value)}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="gross" name="Gross Rev" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4,4,0,0]} />
                <Bar dataKey="opProfit" name="Op. Profit" fill="hsl(var(--gold))" radius={[4,4,0,0]} />
                <Bar dataKey="netProfit" name="Net Profit" fill="hsl(142 71% 45%)" radius={[4,4,0,0]} />
                <Line type="monotone" dataKey="admin" name="Admin Costs" stroke="#f43f5e" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="aurelia-card p-6 flex flex-col">
          <h3 className="text-sm font-bold tracking-wide uppercase text-muted-foreground mb-2">Net Revenue by Channel</h3>
          <div className="flex-1 min-h-[300px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={2} dataKey="value" stroke="transparent">
                  {donutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  formatter={(value: number) => fmtEuro(value)}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
              <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Total Net</span>
              <span className="text-lg font-black text-foreground">{fmtEuro(donutData.reduce((s,d)=>s+d.value,0))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── ALERTS SECTION ── */}
      <div className="mb-8">
        <h3 className="text-sm font-bold tracking-wide uppercase text-muted-foreground mb-4 flex items-center gap-2">
          <AlertCircle size={16} /> Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {alerts.length === 0 ? (
            <div className="aurelia-card p-4 bg-green-500/10 border-green-500/20 text-green-400 flex items-center gap-3 md:col-span-2 lg:col-span-3">
              <CheckCircle2 size={18} />
              <span className="text-sm font-bold">All metrics looking healthy this period.</span>
            </div>
          ) : (
            alerts.map((a, i) => (
              <div key={i} className="aurelia-card p-4 text-sm font-semibold text-foreground/90 border-l-[3px] shadow-sm transform transition-all hover:-translate-y-0.5"
                style={{ borderLeftColor: a.type === 'danger' ? '#ef4444' : a.type === 'warning' ? '#f5a623' : a.type === 'success' ? '#22c55e' : '#3b82f6' }}>
                {a.msg}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── BOTTOM ROW (Table + Stacked Bar) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Product Table */}
        <div className="lg:col-span-2 aurelia-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-surface-subtle">
            <h3 className="text-sm font-bold tracking-wide uppercase text-muted-foreground">Performance by Product Code</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#13131a] border-b border-border text-[10px] uppercase text-muted-foreground tracking-wider">
                  <th className="py-3 px-4 font-bold">Code</th>
                  <th className="py-3 px-3 font-bold text-center">Options</th>
                  <th className="py-3 px-3 font-bold text-center">Bookings</th>
                  <th className="py-3 px-3 font-bold text-center">Pax</th>
                  <th className="py-3 px-4 font-bold text-right">Gross Rev</th>
                  <th className="py-3 px-4 font-bold text-right text-gold">Op. Profit</th>
                  <th className="py-3 px-4 font-bold text-right">Margin %</th>
                  <th className="py-3 px-4 font-bold text-right text-red-400/80">Cancel Loss €</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {productPerformance.map(p => (
                  <tr key={p.code} className="hover:bg-white/5 transition-colors group cursor-pointer" onClick={() => setProductFilter(p.code)}>
                    <td className="py-3 px-4 font-semibold text-foreground relative">
                      {/* Sublets border indicator */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${p.margin > 0.4 ? 'bg-profit-positive' : p.margin >= 0.2 ? 'bg-gold' : 'bg-profit-negative'}`} />
                      {p.code}
                    </td>
                    <td className="py-3 px-3 text-center text-muted-foreground">{p.opts}</td>
                    <td className="py-3 px-3 text-center text-muted-foreground">{p.bookings}</td>
                    <td className="py-3 px-3 text-center text-muted-foreground">{p.pax}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">{fmtEuro(p.gross)}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-gold">{fmtEuro(p.opProfit)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-foreground">{fmtPct(p.margin)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-red-400 font-medium">{p.cancelLoss > 0 ? fmtEuro(p.cancelLoss) : '—'}</td>
                  </tr>
                ))}
                {productPerformance.length === 0 && (
                  <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No bookings found for selected period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="aurelia-card p-6 flex flex-col">
          <h3 className="text-sm font-bold tracking-wide uppercase text-muted-foreground mb-6">Cost Breakdown</h3>
          <div className="h-[250px] mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costStackData} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--tw-border-opacity) / 0.1)" horizontal={false} />
                <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" tick={false} axisLine={false} />
                <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `€${v/1000}k`} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  formatter={(value: number) => fmtEuro(value)}
                  cursor={{ fill: 'transparent' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Tickets" stackId="a" fill="#3b82f6" />
                <Bar dataKey="Guides" stackId="a" fill="#10b981" />
                <Bar dataKey="Extras" stackId="a" fill="#f5a623" />
                <Bar dataKey="Commissions" stackId="a" fill="#8b5cf6" />
                <Bar dataKey="Admin" stackId="a" fill="#f43f5e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {totalCancelLoss > 0 && (
            <div className="mt-auto p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-500 font-bold text-xs">
              <AlertCircle size={14} /> Cancellation Losses: {fmtEuro(totalCancelLoss)}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}

function KPICard({ title, value, prev, invertColors = false }: { title: string, value: number, prev: number, invertColors?: boolean }) {
  return (
    <div className="aurelia-card p-4">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{title}</div>
      <div className="text-2xl font-black text-foreground tabular-nums tracking-tight mb-2">{fmtEuro(value)}</div>
      <TrendIndicator cur={value} prev={prev} invertColors={invertColors} />
    </div>
  );
}

function TrendIndicator({ cur, prev, invertColors }: { cur: number, prev: number, invertColors: boolean }) {
  if (prev === 0) return <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">— No prior data</div>;
  const pct = (cur - prev) / Math.abs(prev);
  
  let isGood = pct > 0;
  if (invertColors) isGood = pct < 0; // for costs, down is good
  if (pct === 0) isGood = true;

  const colorCls = isGood ? 'text-profit-positive' : 'text-profit-negative';
  const Icon = pct >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className={`flex items-center gap-1 text-xs font-bold ${colorCls}`}>
      {pct !== 0 && <Icon size={14} />}
      <span>{fmtPct(Math.abs(pct))}</span>
      <span className="text-muted-foreground font-medium ml-1">vs prev</span>
    </div>
  );
}
