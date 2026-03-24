import { useState, useMemo, useRef } from 'react';
import { Plus, Upload, Trash2, Pencil, FileSpreadsheet, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { syncMasterData } from '@/lib/gsheetSync';
import BookingPanel from './BookingPanel';
import CsvUploadModal from './CsvUploadModal';
import MultiSelect from './MultiSelect';

const CHANNELS = ['All', 'Viator', 'GYG', 'Airbnb', 'Website', 'Agent', 'Other'];
const STATUSES = ['All', 'UPCOMING', 'DONE', 'NO_SHOW', 'CANCELLED_EARLY', 'CANCELLED_LATE'];
const MONTHS = ['All', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PER_PAGE = 50;

const DEFAULT_COLS = [
  { id: 'ref', label: 'Booking Ref', width: 140, sticky: 'left', stickyZ: 20 },
  { id: 'extId', label: 'Ext. Ref', width: 120 },
  { id: 'prod', label: 'Product Code', width: 90 },
  { id: 'opt', label: 'Option', width: 160 },
  { id: 'name', label: 'Customer Name', width: 140 },
  { id: 'phone', label: 'Customer Phone', width: 130 },
  { id: 'date', label: 'Travel Date', width: 110 },
  { id: 'time', label: 'Travel Time', width: 90 },
  { id: 'bdate', label: 'Booking Date', width: 110 },
  { id: 'chan', label: 'Channel', width: 90 },
  { id: 'promo', label: 'Promo Code', width: 100 },
  { id: 'pax', label: 'Pax', width: 120 },
  { id: 'tpax', label: 'Total Pax', width: 70 },
  { id: 'gross', label: 'Gross Revenue €', width: 110, align: 'text-right' },
  { id: 'comm', label: 'Commission %', width: 90, align: 'text-right' },
  { id: 'fee', label: 'Marketplace Fee €', width: 110, align: 'text-right' },
  { id: 'netp', label: 'Net Payout €', width: 100, align: 'text-right' },
  { id: 'gcost', label: 'Guide Cost €', width: 90, align: 'text-right' },
  { id: 'ecost', label: 'Extra Cost €', width: 90, align: 'text-right' },
  { id: 'tcost', label: 'Ticket Cost €', width: 90, align: 'text-right' },
  { id: 'profit', label: 'Net Profit €', width: 100, align: 'text-right' },
  { id: 'status', label: 'Status', width: 130, sticky: 'right', stickyZ: 20 },
  { id: 'guide', label: 'Assigned Guide', width: 120 },
  { id: 'actions', label: 'Actions', width: 80, sticky: 'right', stickyZ: 20 }
];

const STATUS_STYLES: Record<string, string> = {
  UPCOMING: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  DONE: 'bg-green-500/15 text-green-400 border-green-500/20',
  NO_SHOW: 'bg-orange-500/15 text-orange-400 border-orange-500/20 text-[#f5a623] bg-[#f5a623]/10 border-[#f5a623]/20', // override to orange as requested
  CANCELLED_EARLY: 'bg-red-500/15 text-red-400 border-red-500/20',
  CANCELLED_LATE: 'bg-red-500/10 text-orange-400 border-orange-500/20',
};

function StatusBadge({ status }: { status: string }) {
  const label = status === 'NO_SHOW' ? 'No Show' : status.replace(/_/g, ' ');
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${STATUS_STYLES[status] || 'bg-secondary text-muted-foreground'}`}>
      {label}
    </span>
  );
}

function formatPax(b: any) {
  return `A:${b.pax_adult || 0} Y:${b.pax_youth || 0} C:${b.pax_child || 0} I:${b.pax_infant || 0}`;
}

function calcTotalPax(b: any) {
  return (b.pax_adult || 0) + (b.pax_youth || 0) + (b.pax_child || 0) + (b.pax_infant || 0);
}

function fmtEuro(v: number) {
  const num = v || 0;
  // include negative sign before euro symbol
  if (num < 0) return '-€' + Math.abs(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '€' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

interface LedgerPageProps {
  bookings: any[];
  setBookings: (b: any[]) => void;
  onSync: () => void;
  bookingsLoaded: boolean;
}

export default function LedgerPage({ bookings, setBookings, onSync, bookingsLoaded }: LedgerPageProps) {
  const { data: appData } = useAppData();
  const { user } = useAuth();
  const productNames = useMemo(() => appData.products.map((p) => p.name), [appData.products]);

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [editBooking, setEditBooking] = useState<any | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string[]>(['All']);
  const [statusFilter, setStatusFilter] = useState<string[]>(['All']);
  const [travelMonth, setTravelMonth] = useState('All');
  const [travelYear, setTravelYear] = useState('');
  const [bookingMonth, setBookingMonth] = useState('All');
  const [bookingYear, setBookingYear] = useState('');
  const [page, setPage] = useState(0);

  // Column Widths
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('ledger_col_widths');
    if (saved) return JSON.parse(saved);
    const def: Record<string, number> = {};
    DEFAULT_COLS.forEach(c => def[c.id] = c.width);
    return def;
  });

  const handleResize = (id: string, newWidth: number) => {
    setColWidths(prev => {
      const nw = Math.max(50, newWidth);
      const next = { ...prev, [id]: nw };
      localStorage.setItem('ledger_col_widths', JSON.stringify(next));
      return next;
    });
  };

  const clearFilters = () => {
    setSearch(''); setChannelFilter(['All']); setStatusFilter(['All']);
    setTravelMonth('All'); setTravelYear(''); setBookingMonth('All'); setBookingYear('');
    setPage(0);
  };

  // Filtered bookings
  const filtered = useMemo(() => {
    let out = [...bookings];
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((b) =>
        (b.booking_ref || '').toLowerCase().includes(q) ||
        (b.customer_name || '').toLowerCase().includes(q) ||
        (b.product_name || '').toLowerCase().includes(q)
      );
    }
    if (!channelFilter.includes('All')) {
      out = out.filter((b) => channelFilter.includes(b.channel || 'Other'));
    }
    if (!statusFilter.includes('All')) {
      out = out.filter((b) => statusFilter.includes(b.status || 'UPCOMING'));
    }
    if (travelMonth !== 'All') {
      const mi = MONTHS.indexOf(travelMonth); 
      out = out.filter((b) => b.travel_date && new Date(b.travel_date).getMonth() + 1 === mi);
    }
    if (travelYear) out = out.filter((b) => b.travel_date && new Date(b.travel_date).getFullYear() === Number(travelYear));
    if (bookingMonth !== 'All') {
      const mi = MONTHS.indexOf(bookingMonth);
      out = out.filter((b) => b.booking_date && new Date(b.booking_date).getMonth() + 1 === mi);
    }
    if (bookingYear) out = out.filter((b) => b.booking_date && new Date(b.booking_date).getFullYear() === Number(bookingYear));
    return out;
  }, [bookings, search, channelFilter, statusFilter, travelMonth, travelYear, bookingMonth, bookingYear]);

  // Summary
  const summary = useMemo(() => {
    const rev = filtered.reduce((s, b) => s + (b.gross_revenue || 0), 0);
    const comm = filtered.reduce((s, b) => s + (b.marketplace_fee || 0), 0);
    const costs = filtered.reduce((s, b) => s + (b.ticket_cost || 0) + (b.guide_cost || 0) + (b.extra_cost || 0), 0);
    const profit = filtered.reduce((s, b) => s + (b.net_profit || 0), 0);
    return { rev, comm, costs, profit };
  }, [filtered]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageBookings = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  // Mutations
  const handleSave = async (booking: any) => {
    if (booking.id) {
      const { id, user_id, created_at, ...fields } = booking;
      const { data } = await supabase.from('bookings').update(fields).eq('id', id).select().single();
      if (data) setBookings(bookings.map((x) => (x.id === id ? data : x)));
    } else {
      const { data } = await supabase.from('bookings').insert({ ...booking, user_id: user?.id }).select().single();
      if (data) setBookings([data, ...bookings]);
    }
    setPanelOpen(false);
    setEditBooking(null);
  };

  const handleEdit = (b: any) => {
    setEditBooking(b);
    setPanelOpen(true);
  };

  const handleDelete = async (b: any) => {
    if (!b.id) return;
    if (confirm(`Delete booking ${b.booking_ref || 'this booking'}?`)) {
      await supabase.from('bookings').delete().eq('id', b.id);
      setBookings(bookings.filter((x) => x.id !== b.id));
    }
  };

  const bulkInsert = async (bs: any[]) => {
    const { data, error } = await supabase.from('bookings').insert(
      bs.map((b) => ({ ...b, user_id: user?.id }))
    ).select();
    if (data) setBookings([...data, ...bookings]);
    return { inserted: data ? data.length : 0, skipped: error ? bs.length : 0 };
  };

  const handleGsheetSync = async () => {
    const sheetId = localStorage.getItem('gsheet_id');
    if (!sheetId) return setSyncMsg('⚠ No Spreadsheet ID configured. Go to Settings first.');
    if (!user) return;
    setSyncing(true);
    setSyncMsg('Syncing bookings…');
    try {
      const res = await syncMasterData(sheetId, user.id, supabase);
      if (res.error) setSyncMsg(`❌ ${res.error}`);
      else {
        setSyncMsg(`✅ Imported ${res.imported} new · Updated ${res.updated} · Skipped ${res.skipped}`);
        onSync(); // Tell AppLayout to refetch
      }
    } catch {
      setSyncMsg('❌ Sync failed. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleForceSync = async () => {
    const sheetId = localStorage.getItem('gsheet_id');
    if (!sheetId) return setSyncMsg('⚠ No Spreadsheet ID configured. Go to Settings first.');
    if (!user) return;
    
    if (!confirm("WARNING: This will delete ALL bookings for your account and re-import from the Google Sheet. Are you absolutely sure?")) return;
    
    setSyncing(true);
    setSyncMsg('Deleting existing bookings...');
    try {
      await supabase.from('bookings').delete().eq('user_id', user.id);
      setSyncMsg('Wait, refetching fresh bookings from GSheets...');
      const res = await syncMasterData(sheetId, user.id, supabase);
      if (res.error) setSyncMsg(`❌ ${res.error}`);
      else {
        setSyncMsg(`✅ Re-synced ${res.imported} bookings`);
        onSync(); // Tell AppLayout to refetch
      }
    } catch {
      setSyncMsg('❌ Forced Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-fade-in pb-32">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Ledger</h1>
          <p className="text-sm text-muted-foreground mt-1">{bookings.length} total bookings</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setEditBooking(null); setPanelOpen(true); }} className="aurelia-gold-btn flex items-center gap-2">
            <Plus size={14} /> Add Booking
          </button>
          <button onClick={() => setCsvOpen(true)} className="aurelia-ghost-btn flex items-center gap-2 border border-border">
            <Upload size={14} /> Upload CSV
          </button>
          <button onClick={handleGsheetSync} disabled={syncing || !bookingsLoaded}
            className="aurelia-ghost-btn flex items-center gap-2 border border-border disabled:opacity-50">
            <RefreshCw size={14} className={syncing || !bookingsLoaded ? 'animate-spin' : ''} />
            {syncing || !bookingsLoaded ? 'Syncing…' : 'Sync from Google Sheets'}
          </button>
          <button onClick={handleForceSync} disabled={syncing || !bookingsLoaded}
            className="aurelia-ghost-btn flex items-center gap-2 border border-orange-500/20 text-orange-400 hover:bg-orange-500/10 disabled:opacity-50">
            <AlertTriangle size={14} />
            Force Full Re-sync
          </button>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div className={`p-3 rounded-lg text-xs font-medium mb-4 border animate-fade-in ${
          syncMsg.startsWith('✅') ? 'bg-green-500/10 border-green-500/20 text-green-400' :
          syncMsg.startsWith('❌') || syncMsg.startsWith('⚠') ? 'bg-red-500/10 border-red-500/20 text-red-400' :
          'bg-blue-500/10 border-blue-500/20 text-blue-400'
        }`}>
          {syncMsg}
          <button onClick={() => setSyncMsg('')} className="ml-3 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6 items-end">
        <input
          className="aurelia-input w-48 text-[11px]"
          placeholder="Search ref, customer, product..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <MultiSelect 
          label="OTA / Channel" 
          options={CHANNELS.map(c => ({ value: c, label: c }))}
          selected={channelFilter}
          onChange={(s) => { setChannelFilter(s); setPage(0); }}
        />
        <MultiSelect 
          label="Status" 
          options={STATUSES.map(s => ({ value: s, label: s.replace(/_/g, ' ') }))}
          selected={statusFilter}
          onChange={(s) => { setStatusFilter(s); setPage(0); }}
        />
        <div className="flex items-center gap-1">
          <select className="aurelia-input w-28 text-[11px]" value={travelMonth} onChange={(e) => { setTravelMonth(e.target.value); setPage(0); }}>
            <option value="All">Travel Month</option>
            {MONTHS.filter(m=>m!=='All').map((m) => <option key={'t' + m} value={m}>{m}</option>)}
          </select>
          <input className="aurelia-input w-16 text-[11px]" placeholder="Year" value={travelYear}
            onChange={(e) => { setTravelYear(e.target.value); setPage(0); }} />
        </div>
        <div className="flex items-center gap-1">
          <select className="aurelia-input w-28 text-[11px]" value={bookingMonth} onChange={(e) => { setBookingMonth(e.target.value); setPage(0); }}>
            <option value="All">Booking Month</option>
            {MONTHS.filter(m=>m!=='All').map((m) => <option key={'b' + m} value={m}>{m}</option>)}
          </select>
          <input className="aurelia-input w-16 text-[11px]" placeholder="Year" value={bookingYear}
            onChange={(e) => { setBookingYear(e.target.value); setPage(0); }} />
        </div>
        <button onClick={clearFilters} className="text-[11px] font-bold text-muted-foreground hover:text-gold transition-colors ml-2 pb-2">
          Clear filters
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="aurelia-card p-4">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Revenue</div>
          <div className="text-xl font-bold text-foreground tabular-nums">{fmtEuro(summary.rev)}</div>
        </div>
        <div className="aurelia-card p-4">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Commission</div>
          <div className="text-xl font-bold text-foreground tabular-nums">{fmtEuro(summary.comm)}</div>
        </div>
        <div className="aurelia-card p-4">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Costs</div>
          <div className="text-xl font-bold text-foreground tabular-nums">{fmtEuro(summary.costs)}</div>
        </div>
        <div className="aurelia-card p-4">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Net Profit</div>
          <div className={`text-xl font-bold tabular-nums ${summary.profit >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>
            {fmtEuro(summary.profit)}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {(!bookingsLoaded && bookings.length === 0) && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {bookingsLoaded && bookings.length === 0 && (
        <div className="aurelia-card p-16 text-center">
          <FileSpreadsheet size={40} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">No bookings yet. Sync from Google Sheets to get started.</p>
        </div>
      )}

      {/* Table - Horizontally Scrollable Exact Specifications */}
      {filtered.length > 0 && (
        <div className="aurelia-card relative flex flex-col w-full overflow-hidden">
          <div className="overflow-x-auto w-full max-w-full block flex-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-1">
            <table className="w-full text-[13px] text-foreground table-fixed min-w-[2400px]">
              <thead>
                <tr className="border-b" style={{ borderColor: 'hsl(var(--theme-border))', backgroundColor: 'hsl(var(--theme-card))' }}>
                  {DEFAULT_COLS.map((col) => {
                    const w = colWidths[col.id];
                    
                    let stickyStyle: any = null;
                    if (col.sticky === 'left') {
                      stickyStyle = { position: 'sticky', left: 0, zIndex: 30, boxShadow: '1px 0 0 0 hsl(var(--theme-border))' };
                    } else if (col.sticky === 'right') {
                      const rightOffset = col.id === 'status' ? colWidths['actions'] : 0;
                      stickyStyle = { position: 'sticky', right: rightOffset, zIndex: 30, boxShadow: '-1px 0 0 0 hsl(var(--theme-border))' };
                    }

                    return (
                      <th 
                        key={col.id} 
                        className={`py-3 px-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap bg-card ${col.align || ''} relative group`}
                        style={{ minWidth: w, width: w, maxWidth: w, backgroundColor: 'hsl(var(--theme-card))', ...stickyStyle }}
                      >
                        <div className="flex items-center justify-between w-full overflow-hidden">
                          <span className="truncate pr-2">{col.label}</span>
                        </div>
                        <div 
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/20 z-40 transition-colors"
                          style={{ borderRight: '1px solid hsl(var(--theme-border) / 0.5)' }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const startX = e.pageX;
                            const startW = w;
                            const mv = (me: MouseEvent) => requestAnimationFrame(() => handleResize(col.id, startW + (me.pageX - startX)));
                            const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
                            document.addEventListener('mousemove', mv);
                            document.addEventListener('mouseup', up);
                          }}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageBookings.map((b, i) => (
                  <tr key={b.id || i} className="border-b transition-colors group" style={{ borderColor: 'hsl(var(--theme-border) / 0.3)' }}>
                    {DEFAULT_COLS.map(col => {
                      const w = colWidths[col.id];
                      let stickyStyle: any = null;
                      if (col.sticky === 'left') {
                        stickyStyle = { position: 'sticky', left: 0, zIndex: col.stickyZ, boxShadow: '1px 0 0 0 hsl(var(--theme-border))' };
                      } else if (col.sticky === 'right') {
                        const rightOffset = col.id === 'status' ? colWidths['actions'] : 0;
                        stickyStyle = { position: 'sticky', right: rightOffset, zIndex: col.stickyZ, boxShadow: '-1px 0 0 0 hsl(var(--theme-border))' };
                      }

                      const renderCell = () => {
                        switch(col.id) {
                          case 'ref': return <span className="font-semibold text-foreground">{b.booking_ref || '—'}</span>;
                          case 'extId': return <span className="text-muted-foreground">{b.ext_ref || '—'}</span>;
                          case 'prod': return b.product_name || '—';
                          case 'opt': return b.option_name || '—';
                          case 'name': return b.customer_name || '—';
                          case 'phone': return <span className="text-muted-foreground">{b.customer_phone || '—'}</span>;
                          case 'date': return <span className="tabular-nums">{b.travel_date || '—'}</span>;
                          case 'time': return <span className="tabular-nums">{b.travel_time || '—'}</span>;
                          case 'bdate': return <span className="tabular-nums text-muted-foreground">{b.booking_date || '—'}</span>;
                          case 'chan': return <span className="text-muted-foreground">{b.channel || '—'}</span>;
                          case 'promo': return <span className="text-muted-foreground">{b.promo_code || '—'}</span>;
                          case 'pax': return <span className="tabular-nums text-emerald-400 font-mono text-[11px]">{formatPax(b)}</span>;
                          case 'tpax': return <span className="tabular-nums text-muted-foreground">{calcTotalPax(b)}</span>;
                          case 'gross': return <span className="tabular-nums text-foreground">{fmtEuro(b.gross_revenue)}</span>;
                          case 'comm': return <span className="tabular-nums text-muted-foreground">{b.commission_rate ? `${b.commission_rate}%` : '—'}</span>;
                          case 'fee': return <span className="tabular-nums text-muted-foreground">{fmtEuro(b.marketplace_fee)}</span>;
                          case 'netp': return <span className="tabular-nums text-foreground">{fmtEuro(b.net_revenue)}</span>;
                          case 'gcost': return <span className="tabular-nums text-muted-foreground">{fmtEuro(b.guide_cost)}</span>;
                          case 'ecost': return <span className="tabular-nums text-muted-foreground">{fmtEuro(b.extra_cost)}</span>;
                          case 'tcost': return <span className="tabular-nums text-muted-foreground">{fmtEuro(b.ticket_cost)}</span>;
                          case 'profit': return <span className={`font-bold tabular-nums ${b.net_profit >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>{fmtEuro(b.net_profit)}</span>;
                          case 'status': return <StatusBadge status={b.status} />;
                          case 'guide': return <span className="text-muted-foreground">{b.assigned_guide || '—'}</span>;
                          case 'actions': return (
                            <div className="flex gap-2">
                              <button onClick={() => handleEdit(b)} className="p-1 px-1.5 rounded transition-colors" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'hsl(var(--theme-text-sec))' }}>
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => handleDelete(b)} className="p-1 px-1.5 rounded transition-colors border border-red-500/20 text-red-400 hover:bg-red-500/10">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          );
                          default: return null;
                        }
                      };

                      return (
                        <td 
                          key={col.id} 
                          className={`py-2.5 px-3 truncate whitespace-nowrap overflow-hidden text-ellipsis ${col.align || ''} bg-card group-hover:brightness-110`}
                          style={{ minWidth: w, maxWidth: w, width: w, backgroundColor: 'hsl(var(--theme-card))', ...stickyStyle }}
                        >
                          {renderCell()}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-4 py-3 border-t mt-1 relative z-30" style={{ borderColor: 'hsl(var(--theme-border))', backgroundColor: 'hsl(var(--theme-card))' }}>
              <span className="text-xs text-muted-foreground">
                Showing {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(page - 1)}
                  className="aurelia-ghost-btn disabled:opacity-30">← Prev</button>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}
                  className="aurelia-ghost-btn disabled:opacity-30">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Booking Panel */}
      {panelOpen && (
        <BookingPanel
          booking={editBooking}
          productNames={productNames}
          onSave={handleSave}
          onClose={() => { setPanelOpen(false); setEditBooking(null); }}
        />
      )}

      {/* CSV Modal */}
      {csvOpen && (
        <CsvUploadModal
          onImport={bulkInsert}
          onClose={() => setCsvOpen(false)}
        />
      )}
    </div>
  );
}
