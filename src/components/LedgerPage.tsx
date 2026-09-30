import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Upload, Trash2, Pencil, FileSpreadsheet, RefreshCw, AlertTriangle, FileDown, Search, CalendarDays } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { syncMasterData } from '@/lib/gsheetSync';
import { shortProductCode, datePresetRange, type DatePresetKey } from '@/lib/utils';
import { EMPTY_BOOKING, type Booking } from '@/lib/useBookings';
import { saveBooking } from '@/lib/bookingActions';
import { attributeSessionGuideCostByBooking } from '@/lib/guidePerformance';
import BookingPanel from './BookingPanel';
import CsvUploadModal from './CsvUploadModal';
import { TogglePill, FilterChip } from './analytics/PnlFilterBar';

const CHANNELS = ['Viator', 'GYG', 'Airbnb', 'Website', 'Agent', 'Other'];
const STATUSES = ['UPCOMING', 'DONE', 'NO_SHOW', 'CANCELLED'];
const SOURCES: { value: string; label: string }[] = [
  { value: 'bokun', label: 'Bokun' },
  { value: 'gsheet', label: 'Sheet' },
  { value: 'manual', label: 'Manual' },
];
const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'thisWeek', label: 'This Week' },
  { key: 'thisMonth', label: 'This Month' },
];
const PER_PAGE = 50;

type DateFilterMode = 'none' | 'preset' | 'day' | 'range';

// Toggles a value in/out of a MultiSelect-style ['All', ...] selection array — 'All' resets to
// itself alone; selecting the last remaining real value snaps back to ['All'] rather than leaving
// an empty (and ambiguous — "nothing selected" vs "everything selected") array.
function toggleMultiValue(current: string[], value: string): string[] {
  if (value === 'All') return ['All'];
  let next = current.filter((s) => s !== 'All');
  if (next.includes(value)) {
    next = next.filter((s) => s !== value);
    if (next.length === 0) next = ['All'];
  } else {
    next = [...next, value];
  }
  return next;
}

/** One row of toggle pills for a MultiSelect-style filter (channel/status/source) — an explicit
    "All" pill plus one per real option, all using the same TogglePill the Breakdown P&L filter
    bar uses, for a consistent look across every filter surface in the app. */
function FilterPillGroup({
  label, options, selected, onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 flex-wrap">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0 pt-1.5">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        <TogglePill active={selected.includes('All')} onClick={() => onToggle('All')}>All</TogglePill>
        {options.map((o) => (
          <TogglePill key={o.value} active={selected.includes(o.value)} onClick={() => onToggle(o.value)}>
            {o.label}
          </TogglePill>
        ))}
      </div>
    </div>
  );
}

const fmtDayChip = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const DEFAULT_COLS = [
  { id: 'ref', label: 'Booking Ref', width: 140, sticky: 'left', stickyZ: 20 },
  { id: 'source', label: 'Source', width: 80 },
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
  { id: 'gygcost', label: 'GYG Cost €', width: 90, align: 'text-right' },
  { id: 'profit', label: 'Net Profit €', width: 100, align: 'text-right' },
  { id: 'status', label: 'Status', width: 130, sticky: 'right', stickyZ: 20 },
  { id: 'guide', label: 'Assigned Guide', width: 120 },
  { id: 'actions', label: 'Actions', width: 80, sticky: 'right', stickyZ: 20 }
];

const STATUS_STYLES: Record<string, string> = {
  UPCOMING: 'bg-blue-600/15 text-blue-700 border-blue-600/20',
  DONE: 'bg-green-600/15 text-green-700 border-green-600/20',
  NO_SHOW: 'bg-orange-600/15 text-orange-700 border-orange-600/20', // override to orange as requested
  CANCELLED: 'bg-red-600/15 text-red-700 border-red-600/20',
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

function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    bokun: 'bg-blue-600/10 text-blue-700 border-blue-600/20',
    gsheet: 'bg-green-600/10 text-green-700 border-green-600/20',
    manual: 'bg-muted text-muted-foreground border-border',
  };
  const label: Record<string, string> = {
    bokun: 'Bokun',
    gsheet: 'Sheet',
    manual: 'Manual',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border ${styles[source] || styles.manual}`}>
      {label[source] || 'Manual'}
    </span>
  );
}

function calcTotalPax(b: any) {
  return (b.pax_adult || 0) + (b.pax_youth || 0) + (b.pax_child || 0) + (b.pax_infant || 0);
}


// Any channel can leave revenue/cost blank in the source booking data — that's stored as null,
// distinct from a genuine €0, so it renders as a "Needs input" flag rather than silently reading
// as zero. Only used for gross_revenue/guide_cost/extra_cost/ticket_cost, the four fields that can
// actually be blank; every other money column always has a computed value.
function MoneyCell({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-amber-600/10 text-amber-700 border border-amber-600/20 whitespace-nowrap">
        Needs input
      </span>
    );
  }
  return <span className={`tabular-nums ${className || ''}`}>{fmtEuro(value)}</span>;
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
  const { data: appData, loading: appDataLoading } = useAppData();
  const { user, profile } = useAuth();
  const productNames = useMemo(() => appData.products.map((p) => p.name), [appData.products]);

  // SESSION-BASED GUIDE COST — the real, current source of truth for guide cost once a booking
  // has a session (bookings.guide_cost goes stale at that point). Fetched once when the Ledger
  // opens, same as `bookings` itself. See liveNetProfit below.
  const [sessionBookings, setSessionBookings] = useState<{ booking_ref: string; session_id: string }[]>([]);
  const [sessionGuides, setSessionGuides] = useState<{ session_id: string; status: string; base_pay: number | null; bonus: number | null }[]>([]);
  const [sessionPayLoaded, setSessionPayLoaded] = useState(false);

  useEffect(() => {
    if (!user || sessionPayLoaded) return;
    Promise.all([
      supabase.from('session_bookings').select('booking_ref, session_id').eq('user_id', user.id),
      supabase.from('session_guides').select('session_id, status, base_pay, bonus').eq('user_id', user.id),
    ]).then(([sbRes, sgRes]) => {
      setSessionBookings(sbRes.data || []);
      setSessionGuides(sgRes.data || []);
      setSessionPayLoaded(true);
    });
  }, [user, sessionPayLoaded]);

  const sessionedRefs = useMemo(() => new Set(sessionBookings.map((sb) => sb.booking_ref)), [sessionBookings]);

  // Reuses the exact same attribution logic as the Analytics profit fix (see
  // lib/guidePerformance.ts) rather than reinventing it, so a session-linked booking's guide cost
  // is identical across the Ledger, Analytics, Breakdown P&L and Live Board.
  const bookingGuideCost = useMemo(
    () => attributeSessionGuideCostByBooking({ bookings, sessionBookings, sessionGuides }),
    [bookings, sessionBookings, sessionGuides]
  );

  // Computed LIVE for display rather than trusting the stored bookings.net_profit column, which can
  // go stale (edited costs, a corrected gross_revenue, etc. don't retroactively update it). Every
  // blank ("needs input") cost is treated as 0 for this calculation only — the cost CELLS still show
  // their own "Needs input" flag via MoneyCell, this just means a still-incomplete booking always has
  // a real, current profit figure rather than showing blank/€0 by default. Guide cost: a
  // session-linked booking uses that session's real pay (never its own stale guide_cost); a booking
  // not in any session falls back to its own guide_cost — never both, matching the Live Board/
  // Analytics/Breakdown P&L rule exactly, so all four surfaces agree on the same booking's profit.
  const liveNetProfit = useMemo(() => (b: any): number => {
    const gross = b.gross_revenue || 0;
    const otherCosts = (b.ticket_cost || 0) + (b.extra_cost || 0) + (b.gyg_cost || 0)
      + (b.commission_amount || 0) + (b.marketplace_fee || 0);
    const guideCost = sessionedRefs.has(b.booking_ref)
      ? (bookingGuideCost.get(b.booking_ref) || 0)
      : (b.guide_cost || 0);
    return gross - otherCosts - guideCost;
  }, [sessionedRefs, bookingGuideCost]);

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string[]>(['All']);
  const [statusFilter, setStatusFilter] = useState<string[]>(['All']);
  const [sourceFilter, setSourceFilter] = useState<string[]>(['All']);
  // DATE FILTER — a single active mechanism at a time (preset / single day / custom range),
  // applied to whichever date field (travel_date or booking_date) dateBasis selects. Picking any
  // one of the three replaces whichever was active before, rather than stacking.
  const [dateBasis, setDateBasis] = useState<'travel' | 'booking'>('travel');
  const [dateMode, setDateMode] = useState<DateFilterMode>('none');
  const [datePreset, setDatePreset] = useState<DatePresetKey | null>(null);
  const [singleDay, setSingleDay] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [page, setPage] = useState(0);

  const selectPreset = (p: DatePresetKey) => {
    setDateMode('preset'); setDatePreset(p); setSingleDay(''); setRangeFrom(''); setRangeTo(''); setPage(0);
  };
  const selectDay = (day: string) => {
    setDatePreset(null); setRangeFrom(''); setRangeTo(''); setSingleDay(day);
    setDateMode(day ? 'day' : 'none');
    setPage(0);
  };
  const selectRange = (from: string, to: string) => {
    setDatePreset(null); setSingleDay(''); setRangeFrom(from); setRangeTo(to);
    setDateMode(from || to ? 'range' : 'none');
    setPage(0);
  };
  const clearDate = () => {
    setDateMode('none'); setDatePreset(null); setSingleDay(''); setRangeFrom(''); setRangeTo(''); setPage(0);
  };

  // Inclusive { start, end } YYYY-MM-DD bounds for whichever date mechanism is active, or null
  // when no date filter is set at all.
  const activeDateRange = useMemo((): { start: string | null; end: string | null } | null => {
    if (dateMode === 'preset' && datePreset) return datePresetRange(datePreset);
    if (dateMode === 'day' && singleDay) return { start: singleDay, end: singleDay };
    if (dateMode === 'range' && (rangeFrom || rangeTo)) return { start: rangeFrom || null, end: rangeTo || null };
    return null;
  }, [dateMode, datePreset, singleDay, rangeFrom, rangeTo]);

  const dateChipLabel = useMemo(() => {
    const basisLabel = dateBasis === 'travel' ? 'Travel' : 'Booking';
    if (dateMode === 'preset' && datePreset) {
      return `${basisLabel}: ${DATE_PRESETS.find((p) => p.key === datePreset)?.label || datePreset}`;
    }
    if (dateMode === 'day' && singleDay) return `${basisLabel}: ${fmtDayChip(singleDay)}`;
    if (dateMode === 'range' && (rangeFrom || rangeTo)) {
      return `${basisLabel}: ${rangeFrom ? fmtDayChip(rangeFrom) : '…'} → ${rangeTo ? fmtDayChip(rangeTo) : '…'}`;
    }
    return null;
  }, [dateBasis, dateMode, datePreset, singleDay, rangeFrom, rangeTo]);

  // Column Widths — defaults first, then overlaid with any saved widths, so a column added after
  // a user already has localStorage state (like gygcost) still gets a sane width instead of
  // `undefined` from a saved object that predates it.
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const def: Record<string, number> = {};
    DEFAULT_COLS.forEach(c => def[c.id] = c.width);
    const saved = localStorage.getItem('ledger_col_widths');
    if (saved) {
      try {
        return { ...def, ...JSON.parse(saved) };
      } catch {
        return def;
      }
    }
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

  const clearAllFilters = () => {
    setSearch(''); setChannelFilter(['All']); setStatusFilter(['All']); setSourceFilter(['All']);
    clearDate();
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
    if (!sourceFilter.includes('All')) {
      out = out.filter((b) => sourceFilter.includes(b.sync_source || 'manual'));
    }
    if (activeDateRange) {
      out = out.filter((b) => {
        const raw = dateBasis === 'travel' ? b.travel_date : b.booking_date;
        if (!raw) return false;
        const day = String(raw).slice(0, 10);
        if (activeDateRange.start && day < activeDateRange.start) return false;
        if (activeDateRange.end && day > activeDateRange.end) return false;
        return true;
      });
    }
    return out;
  }, [bookings, search, channelFilter, statusFilter, sourceFilter, dateBasis, activeDateRange]);

  // Summary
  const summary = useMemo(() => {
    const rev = filtered.reduce((s, b) => s + (b.gross_revenue || 0), 0);
    const comm = filtered.reduce((s, b) => s + (b.marketplace_fee || 0), 0);
    const costs = filtered.reduce((s, b) => s + (b.ticket_cost || 0) + (b.guide_cost || 0) + (b.extra_cost || 0) + (b.gyg_cost || 0), 0);
    const profit = filtered.reduce((s, b) => s + liveNetProfit(b), 0);
    return { rev, comm, costs, profit };
  }, [filtered, liveNetProfit]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageBookings = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  // Mutations
  // Single write path for owner edits (see lib/bookingActions.ts): recomputes total_pax/
  // net_profit fresh from what's being saved, flags whichever protectable fields actually
  // changed so a later Bokun/gsheet sync can never revert them, and writes one change_logs row
  // per changed field. `editBooking` is the pre-edit snapshot to diff against — EMPTY_BOOKING for
  // a brand-new booking, so every hand-entered field on it gets protected too.
  const handleSave = async (booking: Booking) => {
    if (!user) return;
    const before = booking.id ? (editBooking ?? EMPTY_BOOKING) : EMPTY_BOOKING;
    const { error, booking: saved } = await saveBooking(supabase, user.id, before, booking);
    if (error) {
      console.error('Error saving booking:', error);
      setSyncMsg(`❌ Save failed: ${error}`);
      return;
    }
    if (saved) {
      setBookings(booking.id ? bookings.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...bookings]);
    }
    setPanelOpen(false);
    setEditBooking(null);
  };

  const handleEdit = (b: Booking) => {
    setEditBooking(b);
    setPanelOpen(true);
  };

  // jsPDF (+ jspdf-autotable) is a heavy dependency only ever needed for this one action — loaded
  // on demand instead of bundled into the app's initial download.
  const handleDownloadInvoice = async (b: any) => {
    const { generateBookingInvoice } = await import('@/lib/generateInvoice');
    generateBookingInvoice(b, profile?.company_name || 'AURELIA Suite');
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
    const sheetId = profile?.gsheet_id;
    if (!sheetId) return setSyncMsg('⚠ No Spreadsheet ID configured. Go to Settings first.');
    if (!user) return;
    setSyncing(true);
    setSyncMsg('Syncing bookings…');
    try {
      const res = await syncMasterData(sheetId, user.id, supabase);
      if (res.error) setSyncMsg(`❌ ${res.error}`);
      else {
        setSyncMsg(`✅ ${res.imported} new · ${res.updated} updated · ${res.unchanged} unchanged${res.skipped ? ` · ${res.skipped} skipped` : ''}`);
        onSync(); // Tell AppLayout to refetch
      }
    } catch {
      setSyncMsg('❌ Sync failed. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleForceSync = async () => {
    const sheetId = profile?.gsheet_id;
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

  if (appDataLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-fade-in pb-32">
      {/* Top bar */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Ledger</h1>
          <p className="text-sm text-muted-foreground mt-1">{bookings.length} total bookings</p>
        </div>
        <div className="flex flex-wrap gap-3">
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
            className="aurelia-ghost-btn flex items-center gap-2 border border-orange-600/20 text-orange-700 hover:bg-orange-600/10 disabled:opacity-50">
            <AlertTriangle size={14} />
            Force Full Re-sync
          </button>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div className={`p-3 rounded-lg text-xs font-medium mb-4 border animate-fade-in ${
          syncMsg.startsWith('✅') ? 'bg-green-600/10 border-green-600/20 text-green-700' :
          syncMsg.startsWith('❌') || syncMsg.startsWith('⚠') ? 'bg-red-600/10 border-red-600/20 text-red-700' :
          'bg-blue-600/10 border-blue-600/20 text-blue-700'
        }`}>
          {syncMsg}
          <button onClick={() => setSyncMsg('')} className="ml-3 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="aurelia-card p-4 sm:p-5 mb-6 space-y-4">
        {/* SEARCH + DATE BASIS — stacked on phone, side by side from sm up. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-0 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              className="aurelia-input w-full pl-9 text-[12px] min-h-10"
              placeholder="Search ref, customer, product…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
          <div className="flex bg-muted p-1 rounded-xl border border-border w-fit shrink-0">
            <button
              onClick={() => setDateBasis('travel')}
              className={`px-3 sm:px-4 py-2 min-h-9 rounded-lg text-[11px] sm:text-xs font-bold uppercase tracking-wide transition-all ${
                dateBasis === 'travel' ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              By Travel Date
            </button>
            <button
              onClick={() => setDateBasis('booking')}
              className={`px-3 sm:px-4 py-2 min-h-9 rounded-lg text-[11px] sm:text-xs font-bold uppercase tracking-wide transition-all ${
                dateBasis === 'booking' ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              By Booking Date
            </button>
          </div>
        </div>

        {/* DATE CONTROLS — presets, a single-day picker, and a custom range, all acting on
            whichever basis is selected above. Only ONE of these three is ever "the" active date
            filter — picking one clears whichever of the other two was set (see selectPreset/
            selectDay/selectRange). */}
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays size={14} className="text-muted-foreground shrink-0 hidden sm:block" />
          <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-xl border border-border">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => selectPreset(p.key)}
                className={`px-3 py-1.5 min-h-9 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all ${
                  dateMode === 'preset' && datePreset === p.key
                    ? 'bg-background text-foreground shadow-sm border border-border/50'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">Pick a day</span>
            <input
              type="date"
              className="aurelia-input w-auto min-h-9 py-1.5 text-[12px]"
              value={singleDay}
              onChange={(e) => selectDay(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">Range</span>
            <input
              type="date"
              className="aurelia-input w-auto min-h-9 py-1.5 text-[12px]"
              value={rangeFrom}
              max={rangeTo || undefined}
              onChange={(e) => selectRange(e.target.value, rangeTo)}
            />
            <span className="text-muted-foreground text-xs shrink-0">→</span>
            <input
              type="date"
              className="aurelia-input w-auto min-h-9 py-1.5 text-[12px]"
              value={rangeTo}
              min={rangeFrom || undefined}
              onChange={(e) => selectRange(rangeFrom, e.target.value)}
            />
          </div>

          {dateMode !== 'none' && (
            <button onClick={clearDate} className="text-[11px] font-bold text-muted-foreground hover:text-gold transition-colors whitespace-nowrap">
              Clear date
            </button>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* OTHER FILTERS — channel/status/source, redesigned as toggle-pill groups matching the
            Breakdown P&L filter bar (TogglePill/FilterChip, reused from there for consistency). */}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <FilterPillGroup
            label="Channel"
            options={CHANNELS.map((c) => ({ value: c, label: c }))}
            selected={channelFilter}
            onToggle={(v) => { setChannelFilter(toggleMultiValue(channelFilter, v)); setPage(0); }}
          />
          <FilterPillGroup
            label="Status"
            options={STATUSES.map((s) => ({ value: s, label: s === 'NO_SHOW' ? 'No Show' : s.replace(/_/g, ' ') }))}
            selected={statusFilter}
            onToggle={(v) => { setStatusFilter(toggleMultiValue(statusFilter, v)); setPage(0); }}
          />
          <FilterPillGroup
            label="Source"
            options={SOURCES}
            selected={sourceFilter}
            onToggle={(v) => { setSourceFilter(toggleMultiValue(sourceFilter, v)); setPage(0); }}
          />
        </div>

        {/* ACTIVE FILTER CHIPS */}
        {(search || dateChipLabel || !channelFilter.includes('All') || !statusFilter.includes('All') || !sourceFilter.includes('All')) && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            {search && <FilterChip label={`"${search}"`} onRemove={() => setSearch('')} />}
            {dateChipLabel && <FilterChip label={dateChipLabel} onRemove={clearDate} />}
            {!channelFilter.includes('All') && channelFilter.map((c) => (
              <FilterChip key={`chan-${c}`} label={c} onRemove={() => setChannelFilter(toggleMultiValue(channelFilter, c))} />
            ))}
            {!statusFilter.includes('All') && statusFilter.map((s) => (
              <FilterChip key={`stat-${s}`} label={s === 'NO_SHOW' ? 'No Show' : s.replace(/_/g, ' ')} onRemove={() => setStatusFilter(toggleMultiValue(statusFilter, s))} />
            ))}
            {!sourceFilter.includes('All') && sourceFilter.map((s) => (
              <FilterChip key={`src-${s}`} label={SOURCES.find((o) => o.value === s)?.label || s} onRemove={() => setSourceFilter(toggleMultiValue(sourceFilter, s))} />
            ))}
            <button onClick={clearAllFilters} className="text-[11px] font-bold text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-1">
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
          <div className="overflow-x-auto w-full max-w-full block flex-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pb-1">
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
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-muted z-40 transition-colors"
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
                          case 'source': return <SourceBadge source={b.sync_source || 'manual'} />;
                          case 'extId': return <span className="text-muted-foreground">{b.ext_ref || '—'}</span>;
                          case 'prod': return shortProductCode(b.product_code) || '—';
                          case 'opt': return b.option_name || '—';
                          case 'name': return b.customer_name || '—';
                          case 'phone': return <span className="text-muted-foreground">{b.customer_phone || '—'}</span>;
                          case 'date': return <span className="tabular-nums">{b.travel_date || '—'}</span>;
                          case 'time': return <span className="tabular-nums">{b.travel_time || '—'}</span>;
                          case 'bdate': return <span className="tabular-nums text-muted-foreground">{b.booking_date || '—'}</span>;
                          case 'chan': return <span className="text-muted-foreground">{b.channel || '—'}</span>;
                          case 'promo': return <span className="text-muted-foreground">{b.promo_code || '—'}</span>;
                          case 'pax': return <span className="tabular-nums text-emerald-700 font-mono text-[11px]">{formatPax(b)}</span>;
                          case 'tpax': return <span className="tabular-nums text-muted-foreground">{calcTotalPax(b)}</span>;
                          case 'gross': return <MoneyCell value={b.gross_revenue} className="text-foreground" />;
                          case 'comm': return <span className="tabular-nums text-muted-foreground">{b.commission_rate ? `${b.commission_rate}%` : '—'}</span>;
                          case 'fee': return <span className="tabular-nums text-muted-foreground">{fmtEuro(b.marketplace_fee)}</span>;
                          case 'netp': return <span className="tabular-nums text-foreground">{fmtEuro(b.net_revenue)}</span>;
                          case 'gcost': return <MoneyCell value={b.guide_cost} className="text-muted-foreground" />;
                          case 'ecost': return <MoneyCell value={b.extra_cost} className="text-muted-foreground" />;
                          case 'tcost': return <MoneyCell value={b.ticket_cost} className="text-muted-foreground" />;
                          case 'gygcost': return <MoneyCell value={b.gyg_cost} className="text-muted-foreground" />;
                          case 'profit': {
                            const profit = liveNetProfit(b);
                            return <span className={`font-bold tabular-nums ${profit >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}>{fmtEuro(profit)}</span>;
                          }
                          case 'status': return <StatusBadge status={b.status} />;
                          case 'guide': return <span className="text-muted-foreground">{b.assigned_guide || '—'}</span>;
                          case 'actions': return (
                            <div className="flex gap-2">
                              <button onClick={() => handleDownloadInvoice(b)} className="p-1 px-1.5 rounded transition-colors text-gold border border-gold/20 hover:bg-gold/10" title="Download Invoice">
                                <FileDown size={12} />
                              </button>
                              <button onClick={() => handleEdit(b)} className="p-1 px-1.5 rounded transition-colors bg-muted" style={{ color: 'hsl(var(--theme-text-sec))' }}>
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => handleDelete(b)} className="p-1 px-1.5 rounded transition-colors border border-red-600/20 text-red-700 hover:bg-red-600/10">
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
