import { useState, useMemo } from 'react';
import { Plus, Upload, Trash2, Pencil, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { useBookings, type Booking } from '@/lib/useBookings';
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
  NO_SHOW: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  CANCELLED_EARLY: 'bg-red-500/15 text-red-400 border-red-500/20',
  CANCELLED_LATE: 'bg-red-500/10 text-orange-400 border-orange-500/20',
};

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${STATUS_STYLES[status] || 'bg-secondary text-muted-foreground'}`}>
      {label}
    </span>
  );
}

function formatPax(b: Booking) {
  const parts: string[] = [];
  if (b.pax_adult) parts.push(`A:${b.pax_adult}`);
  if (b.pax_youth) parts.push(`Y:${b.pax_youth}`);
  if (b.pax_child) parts.push(`C:${b.pax_child}`);
  if (b.pax_infant) parts.push(`I:${b.pax_infant}`);
  return parts.join(' ') || '0';
}

function fmtEuro(v: number) {
  return '€' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function LedgerPage() {
  const { bookings, loading, addBooking, updateBooking, deleteBooking, bulkInsert, refresh } = useBookings();
  const { data: appData } = useAppData();
  const { user } = useAuth();
  const productNames = useMemo(() => appData.products.map((p) => p.name), [appData.products]);

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
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
        b.booking_ref.toLowerCase().includes(q) ||
        b.customer_name.toLowerCase().includes(q) ||
        b.product_name.toLowerCase().includes(q)
      );
    }
    if (channelFilter !== 'All') out = out.filter((b) => b.channel === channelFilter);
    if (statusFilter !== 'All') out = out.filter((b) => b.status === statusFilter);
    if (travelMonth !== 'All') {
      const mi = MONTHS.indexOf(travelMonth); // 1-based
      out = out.filter((b) => new Date(b.travel_date).getMonth() + 1 === mi);
    }
    if (travelYear) out = out.filter((b) => new Date(b.travel_date).getFullYear() === Number(travelYear));
    if (bookingMonth !== 'All') {
      const mi = MONTHS.indexOf(bookingMonth);
      out = out.filter((b) => new Date(b.booking_date).getMonth() + 1 === mi);
    }
    if (bookingYear) out = out.filter((b) => new Date(b.booking_date).getFullYear() === Number(bookingYear));
    return out;
  }, [bookings, search, channelFilter, statusFilter, travelMonth, travelYear, bookingMonth, bookingYear]);

  // Summary
  const summary = useMemo(() => {
    const rev = filtered.reduce((s, b) => s + b.gross_revenue, 0);
    const comm = filtered.reduce((s, b) => s + b.commission_amount, 0);
    const costs = filtered.reduce((s, b) => s + b.ticket_cost + b.guide_cost + b.extra_cost, 0);
    const profit = filtered.reduce((s, b) => s + b.net_profit, 0);
    return { rev, comm, costs, profit };
  }, [filtered]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageBookings = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const handleSave = async (booking: Booking) => {
    if (booking.id) {
      const { id, user_id, created_at, ...fields } = booking;
      await updateBooking(id, fields);
    } else {
      await addBooking(booking);
    }
    setPanelOpen(false);
    setEditBooking(null);
  };

  const handleEdit = (b: Booking) => {
    setEditBooking(b);
    setPanelOpen(true);
  };

  const handleDelete = async (b: Booking) => {
    if (!b.id) return;
    if (confirm(`Delete booking ${b.booking_ref || 'this booking'}?`)) {
      await deleteBooking(b.id);
    }
  };

  const handleGsheetSync = async () => {
    const sheetId = localStorage.getItem('gsheet_id');
    if (!sheetId) {
      setSyncMsg('⚠ No Spreadsheet ID configured. Go to Settings first.');
      return;
    }
    if (!user) return;
    setSyncing(true);
    setSyncMsg('Syncing bookings…');
    try {
      const res = await syncMasterData(sheetId, user.id, supabase);
      if (res.error) {
        setSyncMsg(`❌ ${res.error}`);
      } else {
        setSyncMsg(`✅ Imported ${res.imported} new · Updated ${res.updated} · Skipped ${res.skipped}`);
        await refresh();
      }
    } catch {
      setSyncMsg('❌ Sync failed. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-fade-in">
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
          <button onClick={handleGsheetSync} disabled={syncing}
            className="aurelia-ghost-btn flex items-center gap-2 border border-border disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync from Google Sheets'}
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
          className="aurelia-input w-64"
          placeholder="Search booking ref, customer, product…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <select className="aurelia-input w-28" value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value); setPage(0); }}>
          {CHANNELS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="aurelia-input w-36" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <select className="aurelia-input w-24" value={travelMonth} onChange={(e) => { setTravelMonth(e.target.value); setPage(0); }}>
            {MONTHS.map((m) => <option key={'t' + m}>{m}</option>)}
          </select>
          <input className="aurelia-input w-20" placeholder="Year" value={travelYear}
            onChange={(e) => { setTravelYear(e.target.value); setPage(0); }} />
          <span className="text-[9px] text-muted-foreground uppercase">Travel</span>
        </div>
        <div className="flex items-center gap-1">
          <select className="aurelia-input w-24" value={bookingMonth} onChange={(e) => { setBookingMonth(e.target.value); setPage(0); }}>
            {MONTHS.map((m) => <option key={'b' + m}>{m}</option>)}
          </select>
          <input className="aurelia-input w-20" placeholder="Year" value={bookingYear}
            onChange={(e) => { setBookingYear(e.target.value); setPage(0); }} />
          <span className="text-[9px] text-muted-foreground uppercase">Booking</span>
        </div>
        <button onClick={clearFilters} className="text-xs font-bold text-muted-foreground hover:text-gold transition-colors">
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
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && bookings.length === 0 && (
        <div className="aurelia-card p-16 text-center">
          <FileSpreadsheet size={40} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">No bookings yet. Add your first booking or upload a CSV.</p>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="aurelia-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-subtle border-b border-border">
                  {['Ref', 'Ext Ref', 'Travel', 'Booked', 'Product', 'Option', 'Channel', 'Pax', 'Revenue', 'Comm.', 'Net Rev.', 'Costs', 'Profit', 'Status', ''].map((h) => (
                    <th key={h} className="py-3 px-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageBookings.map((b, i) => (
                  <tr key={b.id || i} className="border-b border-border/30 hover:bg-hover transition-colors">
                    <td className="py-2.5 px-3 text-foreground font-medium whitespace-nowrap">{b.booking_ref || '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{b.ext_ref || '—'}</td>
                    <td className="py-2.5 px-3 text-foreground tabular-nums whitespace-nowrap">{b.travel_date}</td>
                    <td className="py-2.5 px-3 text-muted-foreground tabular-nums whitespace-nowrap">{b.booking_date}</td>
                    <td className="py-2.5 px-3 text-foreground whitespace-nowrap max-w-[120px] truncate">{b.product_name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap max-w-[100px] truncate">{b.option_name || '—'}</td>
                    <td className="py-2.5 px-3 text-foreground whitespace-nowrap">{b.channel}</td>
                    <td className="py-2.5 px-3 text-muted-foreground tabular-nums whitespace-nowrap">{formatPax(b)}</td>
                    <td className="py-2.5 px-3 text-foreground tabular-nums whitespace-nowrap">{fmtEuro(b.gross_revenue)}</td>
                    <td className="py-2.5 px-3 text-muted-foreground tabular-nums whitespace-nowrap">{fmtEuro(b.commission_amount)}</td>
                    <td className="py-2.5 px-3 text-foreground tabular-nums whitespace-nowrap">{fmtEuro(b.net_revenue)}</td>
                    <td className="py-2.5 px-3 text-muted-foreground tabular-nums whitespace-nowrap">{fmtEuro(b.ticket_cost + b.guide_cost + b.extra_cost)}</td>
                    <td className={`py-2.5 px-3 font-bold tabular-nums whitespace-nowrap ${b.net_profit >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>
                      {fmtEuro(b.net_profit)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap"><StatusBadge status={b.status} /></td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(b)} className="p-1 text-muted-foreground hover:text-gold transition-colors">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDelete(b)} className="p-1 text-muted-foreground hover:text-profit-negative transition-colors">
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
            <div className="flex justify-between items-center px-4 py-3 border-t border-border">
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
