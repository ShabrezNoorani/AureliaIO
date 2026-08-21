import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Users, Activity, Euro, BarChart2, Calendar, FileText, X, Star, Info } from 'lucide-react';
import { generateGuideInvoice } from '@/lib/generateInvoice';
import { localDateStr } from '@/lib/utils';
import {
  computeGuideOverviewRows, computeAssignmentStats, groupMonthlyEarnings,
  groupOrphanedMonthlyByName,
  type GuideAssignmentRow, type GuideMonthlyRow, type GuideRatingRow,
} from '@/lib/guidePerformance';
import {
  verifyGuideRating, deleteGuideRating, updateGuideRating, addGuideRating, updateGuideMonthlyPayment,
} from '@/lib/guideRatingActions';
import GuideStatCards from '@/components/guide/GuideStatCards';
import GuideEarningsChart from '@/components/guide/GuideEarningsChart';
import TourHistoryList from '@/components/guide/TourHistoryList';
import MonthlyInvoiceList from '@/components/guide/MonthlyInvoiceList';
import GuideRatingsPanel from '@/components/guide/GuideRatingsPanel';

export default function GuideDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [guides, setGuides] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<GuideAssignmentRow[]>([]);
  const [optionRates, setOptionRates] = useState<any[]>([]);
  const [ratings, setRatings] = useState<GuideRatingRow[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<GuideMonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'month' | 'mtd' | 'ytd'>('month');

  // Invoice Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<any | null>(null);
  const [invoiceDates, setInvoiceDates] = useState({
    from: localDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    to: localDateStr()
  });

  // Full-detail panel — opened from the new "All Guides" overview table below. Separate from
  // selectedGuide/showDetailsModal above (the pre-existing lightweight assignment-table modal),
  // which stays untouched.
  const [detailGuideId, setDetailGuideId] = useState<string | null>(null);
  const [detailVirtualName, setDetailVirtualName] = useState<string | null>(null);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [gRes, aRes, rRes, ratingsRes, monthlyRes] = await Promise.all([
      supabase.from('guides').select('*').eq('user_id', user.id).order('name'),
      supabase
        .from('guide_assignments')
        .select('*')
        .eq('user_id', user.id)
        .or('sync_source.eq.gsheet_assignments,sync_source.eq.manual,sync_source.is.null'),
      supabase.from('guide_product_rates').select('*').eq('user_id', user.id),
      supabase.from('guide_ratings').select('*').eq('user_id', user.id),
      supabase.from('guide_monthly').select('*').eq('user_id', user.id),
    ]);

    if (gRes.data) setGuides(gRes.data);
    if (aRes.data) setAssignments(aRes.data);
    if (rRes.data) setOptionRates(rRes.data);
    setRatings(ratingsRes.data || []);
    setMonthlyRows(monthlyRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  // All-time performance overview — deliberately built from the FULL `assignments` array, not
  // `filteredAssignments` below (which only covers the dateRange picker's period). A guide's
  // lifetime totals here must match what they see on their own dashboard; the dateRange filter
  // only ever scoped the pre-existing period cards/grid further down this page.
  const todayStr = localDateStr();
  const overviewRows = useMemo(
    () => computeGuideOverviewRows(guides, assignments, ratings, monthlyRows, todayStr),
    [guides, assignments, ratings, monthlyRows, todayStr]
  );
  const unattributedAssignmentCount = useMemo(
    () => assignments.filter(a => !a.guide_id).length,
    [assignments]
  );

  const detailGuide = detailGuideId ? guides.find(g => g.id === detailGuideId) || null : null;
  const detailGuideAssignments = useMemo(
    () => detailGuideId ? assignments.filter(a => a.guide_id === detailGuideId) : [],
    [assignments, detailGuideId]
  );
  const detailGuideRatings = useMemo(
    () => detailGuideId ? ratings.filter(r => r.guide_id === detailGuideId) : [],
    [ratings, detailGuideId]
  );
  const detailGuideMonthly = useMemo(
    () => detailGuideId ? monthlyRows.filter(m => m.guide_id === detailGuideId) : [],
    [monthlyRows, detailGuideId]
  );
  const detailGuideStats = useMemo(
    () => computeAssignmentStats(detailGuideAssignments, todayStr),
    [detailGuideAssignments, todayStr]
  );
  const detailGuideMonthlyEarnings = useMemo(
    () => groupMonthlyEarnings(detailGuideAssignments),
    [detailGuideAssignments]
  );

  const virtualMonthlyByName = useMemo(() => groupOrphanedMonthlyByName(monthlyRows), [monthlyRows]);
  const detailVirtualRows = detailVirtualName ? (virtualMonthlyByName.get(detailVirtualName) || []) : [];

  const closeDetail = () => { setDetailGuideId(null); setDetailVirtualName(null); };

  const refreshRatingsAndMonthly = async () => {
    if (!user) return;
    const [ratingsRes, monthlyRes] = await Promise.all([
      supabase.from('guide_ratings').select('*').eq('user_id', user.id),
      supabase.from('guide_monthly').select('*').eq('user_id', user.id),
    ]);
    setRatings(ratingsRes.data || []);
    setMonthlyRows(monthlyRes.data || []);
  };

  const handleVerifyRating = async (rating: GuideRatingRow) => {
    if (!user || !detailGuide) return;
    const { error } = await verifyGuideRating(supabase, user.id, rating, detailGuide.name);
    if (error) { alert(`Failed to verify rating: ${error}`); return; }
    await refreshRatingsAndMonthly();
  };

  const handleDeleteRating = async (rating: GuideRatingRow) => {
    if (!user || !detailGuide) return;
    if (!confirm('Delete this rating?')) return;
    const { error } = await deleteGuideRating(supabase, user.id, rating, detailGuide.name);
    if (error) { alert(`Failed to delete rating: ${error}`); return; }
    await refreshRatingsAndMonthly();
  };

  const handleEditRating = async (rating: GuideRatingRow, next: { stars: number; quantity: number; source: string | null; note: string | null }) => {
    if (!user || !detailGuide) return;
    const { error } = await updateGuideRating(supabase, user.id, rating, next, detailGuide.name);
    if (error) { alert(`Failed to update rating: ${error}`); return; }
    await refreshRatingsAndMonthly();
  };

  const handleAddRating = async (payload: { stars: number; quantity: number; source: string | null; note: string | null }) => {
    if (!user || !detailGuide) return;
    const { error } = await addGuideRating(supabase, user.id, detailGuide.id, detailGuide.name, payload);
    if (error) { alert(`Failed to add rating: ${error}`); return; }
    await refreshRatingsAndMonthly();
  };

  const handleUpdatePayment = async (row: GuideMonthlyRow, next: { payment_sent: boolean; payment_date: string | null }) => {
    if (!user) return;
    const guideLabel = row.guide_name || detailGuide?.name || 'Guide';
    const { error } = await updateGuideMonthlyPayment(
      supabase, user.id, row.id, guideLabel, row.month || 'this month',
      { payment_sent: !!row.payment_sent, payment_date: row.payment_date }, next
    );
    if (error) { alert(`Failed to update payment status: ${error}`); return; }
    await refreshRatingsAndMonthly();
  };

  const filteredAssignments = useMemo(() => {
    const now = new Date();
    const todayStr = localDateStr(now);

    let start = '';
    let end = todayStr;

    if (dateRange === 'today') {
      start = end = todayStr;
    } else if (dateRange === 'yesterday') {
      const y = new Date(); y.setDate(y.getDate() - 1);
      start = end = localDateStr(y);
    } else if (dateRange === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      start = localDateStr(first);
      end = localDateStr(last);
    } else if (dateRange === 'mtd') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      start = localDateStr(first);
    } else if (dateRange === 'ytd') {
      const first = new Date(now.getFullYear(), 0, 1);
      start = localDateStr(first);
    }

    return assignments.filter(a => {
      if (!a.travel_date) return false;
      return a.travel_date >= start && a.travel_date <= end;
    });
  }, [assignments, dateRange]);

  const guideStats = useMemo(() => {
    return guides.map(g => {
      const myAsns = filteredAssignments.filter(a => a.guide_id === g.id);
      const tours = myAsns.length;
      const earnings = myAsns.reduce((sum, a) => sum + (Number(a.calculated_pay) || 0), 0);
      return { ...g, tours, earnings };
    });
  }, [guides, filteredAssignments]);

  const totalEarnings = guideStats.reduce((sum, g) => sum + g.earnings, 0);
  const totalTours = filteredAssignments.length;

  const handleDownloadInvoice = () => {
    if (!selectedGuide) return;
    const guideAsns = assignments.filter(a => 
      a.guide_id === selectedGuide.id && 
      a.travel_date >= invoiceDates.from && 
      a.travel_date <= invoiceDates.to
    );
    
    if (guideAsns.length === 0) {
      alert("No assignments found for this guide in the selected period.");
      return;
    }

    generateGuideInvoice(
      selectedGuide, 
      guideAsns, 
      profile?.company_name || 'AURELIA Suite',
      invoiceDates
    );
    setShowInvoiceModal(false);
  };

  return (
    <div style={{ padding: '32px' }} className="animate-fade-in">
      <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
        <div className="flex items-center justify-between border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Guide Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Performance tracking and earnings overview</p>
          </div>

          <div className="flex bg-muted p-1 rounded-xl border border-border">
            {(['today', 'yesterday', 'month', 'mtd', 'ytd'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setDateRange(mode)}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                  dateRange === mode ? 'bg-muted text-foreground shadow-xl' : 'text-muted-foreground hover:text-foreground/80'
                }`}
              >
                {mode === 'month' ? 'This Month' : mode}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-20">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        ) : guides.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center border border-dashed border-border rounded-2xl bg-muted">
            <div className="text-7xl mb-6">📊</div>
            <h3 className="text-2xl font-extrabold mb-2">No guide data yet</h3>
            <p className="text-muted-foreground mb-8 max-w-sm">Add guides first to see performance</p>
            <button 
              onClick={() => navigate('/app/guides')}
              className="aurelia-gold-btn px-8 py-3 font-bold flex items-center gap-2"
            >
              Go to Guides <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="aurelia-card p-6 border-l-[4px] border-l-blue-500">
                <div className="flex items-center gap-3 text-muted-foreground mb-2">
                  <Activity size={18} />
                  <span className="text-xs font-bold uppercase tracking-widest">Total Tours</span>
                </div>
                <div className="text-4xl font-extrabold">{totalTours}</div>
              </div>
              <div className="aurelia-card p-6 border-l-[4px] border-l-gold">
                <div className="flex items-center gap-3 text-muted-foreground mb-2">
                  <Euro size={18} />
                  <span className="text-xs font-bold uppercase tracking-widest">Total Earnings</span>
                </div>
                <div className="text-4xl font-extrabold text-gold">€{totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="aurelia-card p-6 border-l-[4px] border-l-purple-500">
                <div className="flex items-center gap-3 text-muted-foreground mb-2">
                  <BarChart2 size={18} />
                  <span className="text-xs font-bold uppercase tracking-widest">Avg / Tour</span>
                </div>
                <div className="text-4xl font-extrabold text-purple-700">€{totalTours > 0 ? (totalEarnings / totalTours).toFixed(2) : '0.00'}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {guideStats.map(g => (
                <div key={g.id} className="aurelia-card p-6 border border-border hover:border-gold/30 transition-all group">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-xl border border-border group-hover:border-gold/50 transition-colors">
                      👤
                    </div>
                    <div>
                      <div className="font-extrabold text-lg text-foreground group-hover:text-gold transition-colors">{g.name}</div>
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{g.guide_number}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted p-3 rounded-xl border border-border">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Tours</div>
                      <div className="text-xl font-bold">{g.tours}</div>
                    </div>
                    <div className="bg-muted p-3 rounded-xl border border-border">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Earnings</div>
                      <div className="text-xl font-bold text-gold">€{g.earnings.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <button
                      onClick={() => { setSelectedGuide(g); setShowDetailsModal(true); }}
                      className="py-3 bg-muted border border-border rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-muted/70 hover:border-gold/30 transition-all flex items-center justify-center gap-2 group/btn"
                    >
                      <Activity size={14} className="text-muted-foreground group-hover/btn:text-gold" />
                      Details
                    </button>
                    <button
                      onClick={() => { setSelectedGuide(g); setShowInvoiceModal(true); }}
                      className="py-3 bg-muted border border-border rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-muted/70 hover:border-gold/30 transition-all flex items-center justify-center gap-2 group/btn"
                    >
                      <FileText size={14} className="text-muted-foreground group-hover/btn:text-gold" />
                      Invoice
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* ALL GUIDES — ALL-TIME PERFORMANCE OVERVIEW */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-extrabold tracking-tight">All Guides — All-Time Performance</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Lifetime totals across every tour on record — independent of the period picker above.
              </p>
              <div className="aurelia-card border border-border overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[820px]">
                  <thead className="bg-muted text-xs text-muted-foreground uppercase tracking-widest font-bold">
                    <tr>
                      <th className="px-5 py-3">Guide</th>
                      <th className="px-5 py-3 text-right">Done</th>
                      <th className="px-5 py-3 text-right">Upcoming</th>
                      <th className="px-5 py-3 text-right">Earned</th>
                      <th className="px-5 py-3 text-right">Paid</th>
                      <th className="px-5 py-3 text-right">Pending</th>
                      <th className="px-5 py-3 text-right">Avg Rating</th>
                      <th className="px-5 py-3 text-right">Review Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overviewRows.map(row => (
                      <tr
                        key={row.id}
                        onClick={() => row.kind === 'real' ? setDetailGuideId(row.id) : setDetailVirtualName(row.name)}
                        className="hover:bg-muted transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-3">
                          <div className="font-bold flex items-center gap-2">
                            {row.name}
                            {row.kind === 'virtual' && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border" title="Imported invoice history with no linked guide profile">
                                Unlinked
                              </span>
                            )}
                          </div>
                          {row.guideNumber && <div className="text-[10px] text-muted-foreground font-mono">{row.guideNumber}</div>}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">{row.toursDone}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-blue-700">{row.toursUpcoming}</td>
                        <td className="px-5 py-3 text-right tabular-nums font-bold">€{row.totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-green-700">€{row.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-amber-700">€{row.pendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {row.avgRating != null ? (
                            <span className="inline-flex items-center gap-1 justify-end">
                              {row.avgRating.toFixed(1)} <Star size={11} className="fill-gold text-gold" />
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">{row.reviewRatePct != null ? `${row.reviewRatePct.toFixed(0)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {unattributedAssignmentCount > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
                  <Info size={12} className="shrink-0" />
                  {unattributedAssignmentCount} additional imported tour record{unattributedAssignmentCount !== 1 ? 's have' : ' has'} no guide on file and {unattributedAssignmentCount !== 1 ? "aren't" : "isn't"} shown per-guide above.
                </p>
              )}
            </div>
          </div>
        )}

        {/* DETAILS MODAL */}
        {showDetailsModal && selectedGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-fade-in">
            <div className="bg-card border border-border rounded-[32px] w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-border flex items-center justify-between bg-muted">
                <div>
                  <h2 className="text-2xl font-black">Assignment Details</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">{selectedGuide.name} · {dateRange}</p>
                </div>
                <button onClick={() => setShowDetailsModal(false)} className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">
                    <tr>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Time</th>
                      <th className="px-3 py-3">Tour Name</th>
                      <th className="px-3 py-3">Language</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3 text-right">Pay</th>
                      <th className="px-3 py-3 text-right">Bonus</th>
                      <th className="px-3 py-3 text-right">Total</th>
                      <th className="px-3 py-3 text-center">Paid?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredAssignments.filter(a => a.guide_id === selectedGuide.id).map(a => (
                      <tr key={a.id} className="hover:bg-muted transition-colors">
                        <td className="px-3 py-3 font-mono text-muted-foreground whitespace-nowrap">{a.travel_date}</td>
                        <td className="px-3 py-3 text-muted-foreground">{a.travel_time || '—'}</td>
                        <td className="px-3 py-3 font-bold">{a.tour_name || a.product_code || '—'}</td>
                        <td className="px-3 py-3 text-foreground/80">{a.language || '—'}</td>
                        <td className="px-3 py-3 text-muted-foreground">{a.tour_type || '—'}</td>
                        <td className="px-3 py-3 text-right font-mono">€{Number(a.calculated_pay || 0).toFixed(2)}</td>
                        <td className="px-3 py-3 text-right font-mono text-gold">{a.bonus ? `€${Number(a.bonus).toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-3 text-right font-black text-green-700">€{Number(a.total_pay || a.calculated_pay || 0).toFixed(2)}</td>
                        <td className="px-3 py-3 text-center">
                          {a.is_paid
                            ? <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-green-600/20 text-green-700">Paid</span>
                            : <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-orange-600/20 text-orange-700">Pending</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* INVOICE MODAL */}
        {showInvoiceModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-fade-in">
            <div className="bg-card border border-border rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
              <div className="p-8 border-b border-border flex items-center justify-between bg-muted">
                <div>
                  <h2 className="text-2xl font-black">Generate Invoice</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">{selectedGuide?.name}</p>
                </div>
                <button
                  onClick={() => setShowInvoiceModal(false)}
                  className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Start Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={invoiceDates.from}
                        onChange={e => setInvoiceDates(prev => ({ ...prev, from: e.target.value }))}
                        className="aurelia-input w-full pl-10"
                      />
                      <Calendar className="absolute left-3 top-3 text-muted-foreground" size={16} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">End Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={invoiceDates.to}
                        onChange={e => setInvoiceDates(prev => ({ ...prev, to: e.target.value }))}
                        className="aurelia-input w-full pl-10"
                      />
                      <Calendar className="absolute left-3 top-3 text-muted-foreground" size={16} />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    onClick={() => setShowInvoiceModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold border border-border hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleDownloadInvoice}
                    className="flex-[2] py-4 bg-gold text-black rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <FileText size={18} />
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GUIDE DETAIL PANEL — real guide, full picture matching their own dashboard */}
        {detailGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-xl animate-fade-in">
            <div className="bg-card border border-border rounded-[32px] w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-6 md:p-8 border-b border-border flex items-center justify-between bg-muted shrink-0">
                <div className="min-w-0">
                  <h2 className="text-2xl font-black truncate">{detailGuide.name}</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1 font-mono">
                    {detailGuide.guide_number}{detailGuide.status ? ` · ${detailGuide.status}` : ''}
                  </p>
                </div>
                <button onClick={closeDetail} className="p-2 hover:bg-background rounded-xl text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 aurelia-scrollbar">
                <section className="space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Tours &amp; Pay</h3>
                  <GuideStatCards stats={detailGuideStats} />
                  <GuideEarningsChart data={detailGuideMonthlyEarnings} />
                  <TourHistoryList
                    assignments={detailGuideAssignments}
                    todayStr={todayStr}
                    isOwner
                    guideWhatsapp={detailGuide.whatsapp || detailGuide.phone}
                  />
                </section>

                <section className="space-y-4 pt-6 border-t border-border">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Invoices</h3>
                  <MonthlyInvoiceList rows={detailGuideMonthly} isOwner onUpdatePayment={handleUpdatePayment} />
                </section>

                <section className="space-y-4 pt-6 border-t border-border">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Ratings</h3>
                  <GuideRatingsPanel
                    guideName={detailGuide.name}
                    ratings={detailGuideRatings}
                    toursDoneCount={detailGuideStats.toursDone}
                    isOwner
                    embedded
                    onVerify={handleVerifyRating}
                    onDelete={handleDeleteRating}
                    onEdit={handleEditRating}
                    onAdd={handleAddRating}
                  />
                </section>
              </div>
            </div>
          </div>
        )}

        {/* GUIDE DETAIL PANEL — name-only imported history, no linked guide profile to attribute
            tour history or ratings to, so only the invoice statement is shown (honestly — not
            fabricated). */}
        {detailVirtualName && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-xl animate-fade-in">
            <div className="bg-card border border-border rounded-[32px] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-6 md:p-8 border-b border-border flex items-center justify-between bg-muted shrink-0">
                <div className="min-w-0">
                  <h2 className="text-2xl font-black truncate">{detailVirtualName}</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Imported invoice history · no linked profile</p>
                </div>
                <button onClick={closeDetail} className="p-2 hover:bg-background rounded-xl text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 aurelia-scrollbar">
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  This name doesn't match any current guide profile, so only their imported monthly invoice history is available — no tour history or ratings can be attributed to them.
                </p>
                <MonthlyInvoiceList rows={detailVirtualRows} isOwner onUpdatePayment={handleUpdatePayment} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ArrowRight = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
);
