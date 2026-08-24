import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useChartColors } from '@/lib/theme';
import { ArrowLeft, LineChart as LineChartIcon, ToggleLeft, ToggleRight, Info } from 'lucide-react';
import PnlFilterBar from '@/components/analytics/PnlFilterBar';
import {
  computePresetRange, filterPnlBookings, groupBookingsByPeriod, computeAdminCostsByPeriod,
  attachAdminCosts, uniqueChannelsFrom, PNL_GRANULARITIES, DEFAULT_PNL_STATUSES, PNL_STATUS_BUCKETS,
  type PnlDatePreset, type PnlStatusBucket, type PnlBooking, type PnlAdminCost,
  type PnlGranularity, type PnlDateField, type PeriodRowWithAdmin,
} from '@/lib/monthlyPnl';

const fmtE = (v: number) => `€${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const GRANULARITY_LABELS: Record<PnlGranularity, string> = { day: 'Day', week: 'Week', month: 'Month' };

export default function BreakdownPnlPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const colors = useChartColors();

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<PnlBooking[]>([]);
  const [adminCosts, setAdminCosts] = useState<PnlAdminCost[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from('bookings').select('*').eq('user_id', user.id),
      supabase.from('admin_costs').select('amount, month, year, expense_date').eq('user_id', user.id),
    ]).then(([bRes, aRes]) => {
      if (cancelled) return;
      if (bRes.error) console.error('Error fetching bookings:', bRes.error);
      if (aRes.error) console.error('Error fetching admin_costs:', aRes.error);
      setBookings(bRes.data || []);
      setAdminCosts(aRes.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  // ── Controls ──────────────────────────────────────────────────────────────────────────────
  const [dateBasis, setDateBasis] = useState<PnlDateField>('travel');
  const [granularity, setGranularity] = useState<PnlGranularity>('month');
  const [includeAdmin, setIncludeAdmin] = useState(true);

  const [preset, setPreset] = useState<PnlDatePreset>('thisMonth');
  const [customStart, setCustomStart] = useState(() => computePresetRange('thisMonth').start || '');
  const [customEnd, setCustomEnd] = useState(() => computePresetRange('thisMonth').end || '');

  const [selectedStatuses, setSelectedStatuses] = useState<Set<PnlStatusBucket>>(() => new Set(DEFAULT_PNL_STATUSES));
  // Lazy-initialized from the already-loaded-by-the-time-this-matters bookings — same pattern as
  // the rest of the app's P&L filter bar: null on the very first tick before data arrives is fine
  // since uniqueChannels is empty then too, so the set stays trivially "all of nothing".
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(() => new Set());
  const [channelsInitialized, setChannelsInitialized] = useState(false);

  const uniqueChannels = useMemo(() => uniqueChannelsFrom(bookings), [bookings]);

  // Seeds the channel filter to "all selected" the first time real channels are known — can't do
  // this via a lazy useState initializer like the rest because this page fetches its own data
  // asynchronously (unlike the old Analytics section, which received already-loaded bookings as a
  // prop), so uniqueChannels is empty on first render.
  useEffect(() => {
    if (channelsInitialized || uniqueChannels.length === 0) return;
    setSelectedChannels(new Set(uniqueChannels));
    setChannelsInitialized(true);
  }, [uniqueChannels, channelsInitialized]);

  const range = useMemo(
    () => (preset === 'custom' ? { start: customStart || null, end: customEnd || null } : computePresetRange(preset)),
    [preset, customStart, customEnd]
  );

  const filtered = useMemo(
    () => filterPnlBookings(bookings, { dateField: dateBasis, range, statuses: selectedStatuses, channels: selectedChannels }),
    [bookings, dateBasis, range, selectedStatuses, selectedChannels]
  );

  const baseRows = useMemo(
    () => groupBookingsByPeriod(filtered, dateBasis, granularity),
    [filtered, dateBasis, granularity]
  );

  // Admin costs are only ever meaningful on the Travel basis (they're a whole-company cost tied
  // to when tours actually run, not to when they were booked) — on Booking basis the toggle is
  // hidden and rows never carry admin/net-after-admin columns, regardless of the stored toggle
  // state (which is preserved so switching back to Travel remembers the choice).
  const showAdmin = dateBasis === 'travel' && includeAdmin;

  const rows: PeriodRowWithAdmin[] = useMemo(() => {
    if (!showAdmin) return baseRows.map((r) => ({ ...r, adminCost: 0, netAfterAdmin: r.tourProfit }));
    const adminByPeriod = computeAdminCostsByPeriod(adminCosts, granularity);
    return attachAdminCosts(baseRows, adminByPeriod);
  }, [baseRows, adminCosts, granularity, showAdmin]);

  const totals = useMemo(() => rows.reduce((acc, r) => {
    acc.bookings += r.bookings; acc.travellers += r.travellers; acc.gross += r.gross;
    acc.tourCost += r.tourCost; acc.tourProfit += r.tourProfit; acc.adminCost += r.adminCost;
    acc.netAfterAdmin += r.netAfterAdmin;
    return acc;
  }, { bookings: 0, travellers: 0, gross: 0, tourCost: 0, tourProfit: 0, adminCost: 0, netAfterAdmin: 0 }), [rows]);

  // Chart reads chronologically (oldest→newest); the table reads newest-first — same rows, two
  // sort orders for two different jobs.
  const chartData = useMemo(() => [...rows].reverse(), [rows]);

  // ── Toggle handlers ──────────────────────────────────────────────────────────────────────
  const toggleStatus = (s: PnlStatusBucket) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };
  const toggleChannel = (c: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };
  const handleClearAll = () => {
    setPreset('all');
    setSelectedStatuses(new Set(PNL_STATUS_BUCKETS));
    setSelectedChannels(new Set(uniqueChannels));
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 pb-32 max-w-[1600px] mx-auto text-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-muted-foreground"><LineChartIcon size={24} /> Breakdown P&amp;L</h1>
          <button onClick={() => navigate('/app')} className="aurelia-ghost-btn px-4 py-2 flex items-center gap-2"><ArrowLeft size={16} /> Back to Dashboard</button>
        </div>
        <div className="py-32 flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mb-4" />
          <h2 className="text-xl font-bold text-muted-foreground">Loading booking data…</h2>
        </div>
      </div>
    );
  }

  if (!bookings || bookings.length === 0) {
    return (
      <div className="p-4 md:p-8 pb-32 max-w-[1600px] mx-auto text-foreground animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2"><LineChartIcon className="text-gold" size={24} /> Breakdown P&amp;L</h1>
          <button onClick={() => navigate('/app')} className="aurelia-ghost-btn px-4 py-2 flex items-center gap-2"><ArrowLeft size={16} /> Back to Dashboard</button>
        </div>
        <div className="aurelia-card p-16 flex flex-col items-center justify-center text-center max-w-2xl mx-auto mt-12 bg-muted/5 border-dashed">
          <LineChartIcon size={64} className="text-gold/40 mb-6" />
          <h2 className="text-3xl font-black mb-4">No data yet. Sync your bookings first.</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-lg">
            Breakdown P&amp;L requires booking data imported into your ledger. Navigate to the Financial Ledger to sync from Google Sheets or an API channel.
          </p>
          <button onClick={() => navigate('/app/ledger')} className="aurelia-gold-btn px-8 py-4 font-bold text-lg rounded-xl shadow-lg shadow-gold/20">
            Go to Financial Ledger
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-32 max-w-[1600px] mx-auto animate-fade-in text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/app')} className="aurelia-ghost-btn p-2 mr-2">
            <ArrowLeft size={20} />
          </button>
          <LineChartIcon className="text-gold" size={24} />
          <h1 className="text-2xl font-bold">Breakdown P&amp;L</h1>
        </div>
        <button onClick={() => navigate('/app')} className="aurelia-ghost-btn px-4 py-2 border border-border hover:bg-muted">Back to Dashboard</button>
      </div>

      {/* ── GRANULARITY / DATE-BASIS / ADMIN TOGGLES ── */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Granularity</span>
          <div className="flex bg-muted p-1 rounded-lg">
            {PNL_GRANULARITIES.map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${
                  granularity === g ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {GRANULARITY_LABELS[g]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Date Basis</span>
          <div className="flex bg-muted p-1 rounded-lg">
            {(['travel', 'booking'] as const).map((b) => (
              <button
                key={b}
                onClick={() => setDateBasis(b)}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${
                  dateBasis === b ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                By {b === 'travel' ? 'Travel' : 'Booking'} Date
              </button>
            ))}
          </div>
        </div>

        {dateBasis === 'travel' && (
          <button
            onClick={() => setIncludeAdmin((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              includeAdmin ? 'bg-gold/15 border-gold/40 text-gold' : 'bg-muted border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {includeAdmin ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            Include Admin Costs
          </button>
        )}
      </div>

      {dateBasis === 'booking' && (
        <p className="text-[11px] text-muted-foreground mb-5 flex items-center gap-1.5">
          <Info size={12} className="shrink-0" />
          Booking-date view shows demand only (bookings, travellers, gross revenue) — tour cost and admin costs are tied to when tours run, not when they're booked, so they're only shown on the Travel-date basis.
        </p>
      )}

      {/* ── FILTER BAR ── */}
      <PnlFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        selectedStatuses={selectedStatuses}
        onToggleStatus={toggleStatus}
        defaultStatuses={DEFAULT_PNL_STATUSES}
        uniqueChannels={uniqueChannels}
        selectedChannels={selectedChannels}
        onToggleChannel={toggleChannel}
        onClearAll={handleClearAll}
      />

      {/* ── SUMMARY STATS ── */}
      <div className={`grid grid-cols-2 ${showAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3 mb-5`}>
        <div className="aurelia-card p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Bookings</div>
          <div className="text-2xl font-black tabular-nums">{totals.bookings}</div>
        </div>
        <div className="aurelia-card p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Gross Revenue</div>
          <div className="text-2xl font-black tabular-nums">{fmtE(totals.gross)}</div>
        </div>
        {dateBasis === 'travel' ? (
          <div className="aurelia-card p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Tour Profit</div>
            <div className={`text-2xl font-black tabular-nums ${totals.tourProfit >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>{fmtE(totals.tourProfit)}</div>
          </div>
        ) : (
          <div className="aurelia-card p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Travellers</div>
            <div className="text-2xl font-black tabular-nums">{totals.travellers}</div>
          </div>
        )}
        {showAdmin && (
          <div className="aurelia-card p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Net After Admin</div>
            <div className={`text-2xl font-black tabular-nums ${totals.netAfterAdmin >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>{fmtE(totals.netAfterAdmin)}</div>
          </div>
        )}
      </div>

      {/* ── CHART ── */}
      <div className="aurelia-card p-5 mb-5">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
          Gross Revenue by {GRANULARITY_LABELS[granularity]} ({dateBasis === 'travel' ? 'Travel' : 'Booking'} Date)
        </h3>
        <div className="h-[280px]">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -10, right: 10, bottom: 0, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
                <XAxis dataKey="label" stroke={colors.text} fontSize={11} />
                <YAxis stroke={colors.text} fontSize={11} tickFormatter={(v) => `€${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: colors.tooltip.bg, borderColor: colors.tooltip.border, borderRadius: '8px', fontSize: '12px', color: colors.tooltip.text }}
                  itemStyle={{ color: colors.tooltip.text }}
                  formatter={(v: number) => fmtE(v)}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="gross" name="Gross Revenue" fill={colors.primary} radius={[4, 4, 0, 0]} />
                {dateBasis === 'travel' && (
                  <Bar dataKey={showAdmin ? 'netAfterAdmin' : 'tourProfit'} name={showAdmin ? 'Net After Admin' : 'Tour Profit'} fill={colors.secondary} radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">No bookings matching filters.</div>
          )}
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="aurelia-card overflow-hidden">
        <div className="p-4 bg-muted/20 border-b border-border">
          <h3 className="text-sm font-bold tracking-widest text-muted-foreground uppercase">
            By {GRANULARITY_LABELS[granularity]} ({dateBasis === 'travel' ? 'Travel' : 'Booking'} Date)
          </h3>
        </div>
        <div className="overflow-x-auto">
          {rows.length > 0 ? (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-muted border-b border-border text-[10px] uppercase text-muted-foreground tracking-wider">
                  <th className="py-3 px-4 font-bold">{GRANULARITY_LABELS[granularity]}</th>
                  <th className="py-3 px-3 font-bold text-center">Bookings</th>
                  <th className="py-3 px-3 font-bold text-center">Travellers</th>
                  <th className="py-3 px-3 font-bold text-right">Gross Revenue</th>
                  {dateBasis === 'travel' && (
                    <>
                      <th className="py-3 px-3 font-bold text-right">Tour Cost</th>
                      <th className="py-3 px-3 font-bold text-right">Tour Profit</th>
                    </>
                  )}
                  {showAdmin && (
                    <>
                      <th className="py-3 px-3 font-bold text-right">Admin Cost</th>
                      <th className="py-3 px-4 font-bold text-right">Net After Admin</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-muted/60 transition-colors">
                    <td className="py-3 px-4 font-semibold whitespace-nowrap">{r.label}</td>
                    <td className="py-3 px-3 text-center tabular-nums">{r.bookings}</td>
                    <td className="py-3 px-3 text-center tabular-nums">{r.travellers}</td>
                    <td className="py-3 px-3 text-right tabular-nums">{fmtE(r.gross)}</td>
                    {dateBasis === 'travel' && (
                      <>
                        <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">{fmtE(r.tourCost)}</td>
                        <td className={`py-3 px-3 text-right tabular-nums font-semibold ${r.tourProfit >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>{fmtE(r.tourProfit)}</td>
                      </>
                    )}
                    {showAdmin && (
                      <>
                        <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">{r.adminCost > 0 ? fmtE(r.adminCost) : '—'}</td>
                        <td className={`py-3 px-4 text-right tabular-nums font-bold ${r.netAfterAdmin >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>{fmtE(r.netAfterAdmin)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-primary/5 font-bold border-t-2 border-border">
                  <td className="py-3 px-4">TOTAL</td>
                  <td className="py-3 px-3 text-center tabular-nums">{totals.bookings}</td>
                  <td className="py-3 px-3 text-center tabular-nums">{totals.travellers}</td>
                  <td className="py-3 px-3 text-right tabular-nums">{fmtE(totals.gross)}</td>
                  {dateBasis === 'travel' && (
                    <>
                      <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">{fmtE(totals.tourCost)}</td>
                      <td className={`py-3 px-3 text-right tabular-nums ${totals.tourProfit >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>{fmtE(totals.tourProfit)}</td>
                    </>
                  )}
                  {showAdmin && (
                    <>
                      <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">{fmtE(totals.adminCost)}</td>
                      <td className={`py-3 px-4 text-right tabular-nums ${totals.netAfterAdmin >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>{fmtE(totals.netAfterAdmin)}</td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="p-8 text-center text-muted-foreground">No bookings matching filters.</div>
          )}
        </div>
      </div>

      {showAdmin && granularity !== 'month' && (
        <p className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1.5">
          <Info size={12} className="shrink-0" />
          Admin costs with a precise expense date are allocated to their exact {granularity}; costs recorded only by month are spread evenly across that month's {granularity === 'day' ? 'days' : 'weeks'}.
        </p>
      )}
    </div>
  );
}
