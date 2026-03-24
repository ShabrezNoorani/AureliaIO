import { useState, useMemo } from 'react';
import { Plus, Upload, Trash2, Pencil, FileSpreadsheet, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { syncMasterData } from '@/lib/gsheetSync';
import BookingPanel from './BookingPanel';
import CsvUploadModal from './CsvUploadModal';

const CHANNELS = ['All', 'Viator', 'GYG', 'Airbnb', 'Website', 'Agent', 'Other'];
const STATUSES = ['All', 'UPCOMING', 'DONE', 'NO_SHOW', 'CANCELLED_EARLY', 'CANCELLED_LATE'];
const MONTHS = ['All', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PER_PAGE = 50;

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
  const [channelFilter, setChannelFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [travelMonth, setTravelMonth] = useState('All');
  const [travelYear, setTravelYear] = useState('');
  const [bookingMonth, setBookingMonth] = useState('All');
  const [bookingYear, setBookingYear] = useState('');
  const [page, setPage] = useState(0);

  const clearFilters = () => {
    setSearch(''); setChannelFilter('All'); setStatusFilter('All');
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
    if (channelFilter !== 'All') out = out.filter((b) => b.channel === channelFilter);
    if (statusFilter !== 'All') out = out.filter((b) => b.status === statusFilter);
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
          className="aurelia-input w-64 text-xs"
          placeholder="Search booking ref, customer, product…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <select className="aurelia-input w-28 text-xs" value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value); setPage(0); }}>
          {CHANNELS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="aurelia-input w-36 text-xs" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <select className="aurelia-input w-24 text-xs" value={travelMonth} onChange={(e) => { setTravelMonth(e.target.value); setPage(0); }}>
            {MONTHS.map((m) => <option key={'t' + m}>{m}</option>)}
          </select>
          <input className="aurelia-input w-20 text-xs" placeholder="Year" value={travelYear}
            onChange={(e) => { setTravelYear(e.target.value); setPage(0); }} />
          <span className="text-[9px] text-muted-foreground uppercase">Travel</span>
        </div>
        <div className="flex items-center gap-1">
          <select className="aurelia-input w-24 text-xs" value={bookingMonth} onChange={(e) => { setBookingMonth(e.target.value); setPage(0); }}>
            {MONTHS.map((m) => <option key={'b' + m}>{m}</option>)}
          </select>
          <input className="aurelia-input w-20 text-xs" placeholder="Year" value={bookingYear}
            onChange={(e) => { setBookingYear(e.target.value); setPage(0); }} />
          <span className="text-[9px] text-muted-foreground uppercase">Booking</span>
        </div>
        <button onClick={clearFilters} className="text-xs font-bold text-muted-foreground hover:text-gold transition-colors ml-2 pb-2">
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
          <div className="overflow-x-auto w-full max-w-full block flex-1 scrollbar-hide aurelia-scrollbar">
            <table className="w-full text-[13px] text-white table-fixed min-w-[1800px]">
              <thead>
                <tr className="bg-[#13131a] border-b border-border">
                  {[
                    { key: 'Booking Ref', sticky: 'sticky left-0 z-20 shadow-[1px_0_0_0_#1e1e2e]' },
                    { key: 'Ext. Ref' },
                    { key: 'Product Code' },
                    { key: 'Option' },
                    { key: 'Customer Name' },
                    { key: 'Customer Phone' },
                    { key: 'Travel Date' },
                    { key: 'Travel Time' },
                    { key: 'Booking Date' },
                    { key: 'Channel' },
                    { key: 'Promo Code' },
                    { key: 'Pax' },
                    { key: 'Total Pax' },
                    { key: 'Gross Revenue €', align: 'text-right' },
                    { key: 'Commission %', align: 'text-right' },
                    { key: 'Marketplace Fee €', align: 'text-right' },
                    { key: 'Net Payout €', align: 'text-right' },
                    { key: 'Guide Cost €', align: 'text-right' },
                    { key: 'Extra Cost €', align: 'text-right' },
                    { key: 'Ticket Cost €', align: 'text-right' },
                    { key: 'Net Profit €', align: 'text-right' },
                    { key: 'Status', sticky: 'sticky right-[80px] z-20 shadow-[-1px_0_0_0_#1e1e2e]' },
                    { key: 'Assigned Guide' },
                    { key: 'Actions', sticky: 'sticky right-0 z-20 shadow-[-1px_0_0_0_#1e1e2e]' }
                  ].map((h) => (
                    <th 
                      key={h.key} 
                      className={`py-3 px-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap bg-[#13131a] ${h.align || ''} ${h.sticky || 'relative'}`}
                    >
                      {h.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageBookings.map((b, i) => (
                  <tr key={b.id || i} className="border-b border-border/30 hover:bg-hover transition-colors group">
                    <td className="py-2.5 px-3 text-white font-medium whitespace-nowrap bg-[#13131a] sticky left-0 z-10 shadow-[1px_0_0_0_#1e1e2e] group-hover:bg-[#1a1a2e]">
                      {b.booking_ref || '—'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">{b.ext_ref || '—'}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap max-w-[120px] truncate">{b.product_name || '—'}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap max-w-[100px] truncate">{b.option_name || '—'}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap max-w-[100px] truncate">{b.customer_name || '—'}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">{b.customer_phone || '—'}</td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap">{b.travel_date || '—'}</td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap">{b.travel_time || '—'}</td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-muted-foreground">{b.booking_date || '—'}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">{b.channel || '—'}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">{b.promo_code || '—'}</td>
                    
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-emerald-400 font-mono text-[11px]">{formatPax(b)}</td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-center text-muted-foreground">{calcTotalPax(b)}</td>
                    
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-right">{fmtEuro(b.gross_revenue)}</td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-right text-muted-foreground">{b.commission_rate ? `${b.commission_rate}%` : '—'}</td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-right text-muted-foreground">{fmtEuro(b.marketplace_fee)}</td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-right">{fmtEuro(b.net_revenue)}</td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-right text-muted-foreground">{fmtEuro(b.guide_cost)}</td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-right text-muted-foreground">{fmtEuro(b.extra_cost)}</td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap text-right text-muted-foreground">{fmtEuro(b.ticket_cost)}</td>
                    <td className={`py-2.5 px-3 font-bold tabular-nums whitespace-nowrap text-right ${b.net_profit >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>
                      {fmtEuro(b.net_profit)}
                    </td>
                    
                    <td className="py-2.5 px-3 whitespace-nowrap bg-[#13131a] sticky right-[80px] z-10 shadow-[-1px_0_0_0_#1e1e2e] group-hover:bg-[#1a1a2e]">
                      <StatusBadge status={b.status} />
                    </td>
                    
                    <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground truncate max-w-[100px]">{b.assigned_guide || '—'}</td>
                    
                    <td className="py-2.5 px-3 whitespace-nowrap bg-[#13131a] sticky right-0 z-10 shadow-[-1px_0_0_0_#1e1e2e] group-hover:bg-[#1a1a2e]">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(b)} className="p-1 px-1.5 rounded bg-white/5 border border-white/10 text-muted-foreground hover:text-gold hover:bg-white/10 transition-colors">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDelete(b)} className="p-1 px-1.5 rounded bg-red-500/5 text-muted-foreground border border-red-500/20 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center px-4 py-3 border-t border-border mt-1 relative z-30 bg-[#13131a]">
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
