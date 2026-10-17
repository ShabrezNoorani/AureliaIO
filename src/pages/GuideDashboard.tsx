import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Activity, Euro, BarChart2, Calendar, FileText, X, Star, Info, CheckCircle2, CalendarRange, Plus, Pencil, Trash2, EyeOff, Eye } from 'lucide-react';
import { localDateStr } from '@/lib/utils';
import {
  computeGuideOverviewRows, computeAssignmentStats, computePunctualityStats,
  groupMonthlyEarnings, groupOrphanedMonthlyByName,
  filterAssignmentsByDateRange, assignmentEarned, sessionGuidesToAssignmentRows, buildUnifiedMonthlyRows,
  getAdminDateFilterBounds, computeGuidePaymentSummary, ADMIN_DATE_FILTER_PRESETS, ADMIN_DEFAULT_FILTER_START,
  filterMonthlyRowsByDateRange, matchesAdminStatusFilter, ADMIN_STATUS_FILTER_OPTIONS,
  filterAssignmentsByStatus, filterMonthlyRowsByStatus, dedupeAssignmentsAcrossSources,
  computeGuideReviewScore, REVIEW_PLATFORMS,
  computeCheckedInBookingRecords, countCheckedInBookingsByGuide, getScoreBand,
  ADMIN_SCORE_BAND_LABELS,
  type GuideAssignmentRow, type GuideMonthlyRow, type GuideReviewRow,
  type AdminDateFilter, type GuidePaymentSummary, type AdminStatusFilter, type GuideReviewScore,
  type ArrivalPunctualityRow, type SessionGuideForEarnings, type SessionForEarnings, type UnifiedMonthlyRow,
  type CheckinForGuiding, type SessionBookingForGuiding,
} from '@/lib/guidePerformance';
import { updateGuideMonthlyPayment, insertGuideMonthlyPayment } from '@/lib/guideRatingActions';
import { addGuideReview, updateGuideReview, deleteGuideReview, setReviewExcluded, type ReviewPayload } from '@/lib/guideReviewActions';
import GuideStatCards from '@/components/guide/GuideStatCards';
import TourHistoryList from '@/components/guide/TourHistoryList';
import MonthlyInvoiceList from '@/components/guide/MonthlyInvoiceList';
import ScoreInfoTooltip from '@/components/guide/ScoreInfoTooltip';

// recharts (pulled in by GuideEarningsChart) is a large charting library — lazy-loaded here too
// (same as GuideHome, the guide's own equivalent view) so it never blocks this page's first paint.
const GuideEarningsChart = lazy(() => import('@/components/guide/GuideEarningsChart'));

interface GuideArrivalRow extends ArrivalPunctualityRow {
  guide_id: string;
}

export default function GuideDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [guides, setGuides] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<GuideAssignmentRow[]>([]);
  const [optionRates, setOptionRates] = useState<any[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<GuideMonthlyRow[]>([]);
  // All-time, company-wide arrivals — the owner sees every guide's punctuality history, same
  // scope as assignments above. Display-only (see detailGuidePunctuality below).
  const [arrivals, setArrivals] = useState<GuideArrivalRow[]>([]);
  // NEW per-session pay (session_guides.base_pay/bonus) — company-wide, all dates. Converted to
  // GuideAssignmentRow shape below (sessionAssignmentRows) and folded into every stats/chart/list
  // alongside the imported guide_assignments history — see lib/guidePerformance.ts's "SESSION-BASED
  // PAY UNIFICATION" section for the full rationale.
  const [sessionGuidesForPay, setSessionGuidesForPay] = useState<SessionGuideForEarnings[]>([]);
  const [sessionsForPay, setSessionsForPay] = useState<SessionForEarnings[]>([]);
  // Individual admin-entered reviews (guide_reviews) — drives the per-guide review SCORE. The
  // ONE review/score system in this app — see guidePerformance.ts's own section header comment.
  const [reviews, setReviews] = useState<GuideReviewRow[]>([]);
  // The score's denominator: checked-in bookings since Oct 1 2026, joined against session_bookings'
  // allotted_guide_id — see computeGuidedBookingCounts's own doc comment.
  const [checkinsForGuiding, setCheckinsForGuiding] = useState<CheckinForGuiding[]>([]);
  const [sessionBookingsForGuiding, setSessionBookingsForGuiding] = useState<SessionBookingForGuiding[]>([]);
  const [loading, setLoading] = useState(true);
  // Admin-only period filter — defaults to "From Oct 1, 2026" per the fix spec. Nothing older is
  // ever hidden permanently: switching to a specific month, a custom range, or "All Time" reaches
  // every tour/earning on record. See lib/guidePerformance.ts's getAdminDateFilterBounds.
  const [adminFilter, setAdminFilter] = useState<AdminDateFilter>({ mode: 'fromDefaultStart' });
  // Local text-input drafts for the month/range pickers — committed into adminFilter on change,
  // kept separate so the <input> always reflects exactly what's typed even mid-edit.
  const [monthInput, setMonthInput] = useState(localDateStr().slice(0, 7));
  const [rangeFromInput, setRangeFromInput] = useState('');
  const [rangeToInput, setRangeToInput] = useState('');

  const selectPreset = (mode: AdminDateFilter['mode']) => setAdminFilter({ mode });
  const selectMonth = (month: string) => {
    setMonthInput(month);
    if (month) setAdminFilter({ mode: 'month', month });
  };
  const selectRange = (from: string, to: string) => {
    setRangeFromInput(from);
    setRangeToInput(to);
    setAdminFilter({ mode: 'range', rangeFrom: from || undefined, rangeTo: to || undefined });
  };

  const adminFilterLabel = useMemo(() => {
    if (adminFilter.mode === 'month') {
      if (!adminFilter.month) return 'Select a month';
      const [y, m] = adminFilter.month.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (adminFilter.mode === 'range') {
      return `${adminFilter.rangeFrom || '…'} → ${adminFilter.rangeTo || '…'}`;
    }
    return ADMIN_DATE_FILTER_PRESETS.find(p => p.mode === adminFilter.mode)?.label || adminFilter.mode;
  }, [adminFilter]);

  // Secondary filter — on top of adminFilter's date window, not a replacement for it. Narrows
  // the actual tour list (filterAssignmentsByStatus below), so every number on this page — top
  // totals, per-guide cards, the "All Guides" table, the detail panel — follows it, not just
  // which guides happen to appear.
  const [statusFilter, setStatusFilter] = useState<AdminStatusFilter>('all');
  const statusFilterLabel = useMemo(
    () => ADMIN_STATUS_FILTER_OPTIONS.find(o => o.value === statusFilter)?.label || '',
    [statusFilter]
  );

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

  // Reviews modal — Add/Edit form at the top, filterable list (by guide + platform) below, so the
  // owner can see what's already on file and avoid logging the same review twice. One shared
  // modal for both the header "+ Add Review" action and each per-guide card's "Reviews" shortcut
  // (which just presets reviewListGuideFilter + the form's guide to that card's guide).
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [reviewListGuideFilter, setReviewListGuideFilter] = useState('All');
  const [reviewListPlatformFilter, setReviewListPlatformFilter] = useState('All');
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({
    guide_id: '',
    stars: 5,
    reviewer_name: '',
    comment: '',
    platform: REVIEW_PLATFORMS[0] as string,
    review_date: localDateStr(),
  });
  const [savingReview, setSavingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const openReviewsModal = (presetGuideId?: string) => {
    setReviewError('');
    setEditingReviewId(null);
    setReviewForm({
      guide_id: presetGuideId || '',
      stars: 5,
      reviewer_name: '',
      comment: '',
      platform: REVIEW_PLATFORMS[0],
      review_date: localDateStr(),
    });
    setReviewListGuideFilter(presetGuideId || 'All');
    setReviewListPlatformFilter('All');
    setShowReviewsModal(true);
  };

  const startEditReview = (r: GuideReviewRow) => {
    setReviewError('');
    setEditingReviewId(r.id);
    setReviewForm({
      guide_id: r.guide_id,
      stars: r.stars,
      reviewer_name: r.reviewer_name || '',
      comment: r.comment || '',
      platform: r.platform || REVIEW_PLATFORMS[0],
      review_date: r.review_date,
    });
  };

  const cancelEditReview = () => {
    setEditingReviewId(null);
    setReviewForm(prev => ({ ...prev, stars: 5, reviewer_name: '', comment: '', platform: REVIEW_PLATFORMS[0], review_date: localDateStr() }));
  };

  const refreshReviews = async () => {
    if (!user) return;
    const { data } = await supabase.from('guide_reviews').select('*').eq('user_id', user.id);
    setReviews(data || []);
  };

  const handleSaveReview = async () => {
    if (!user) return;
    if (!reviewForm.guide_id) { setReviewError('Pick a guide.'); return; }
    const guideName = guides.find(g => g.id === reviewForm.guide_id)?.name || 'Guide';
    const payload: ReviewPayload = {
      guide_id: reviewForm.guide_id,
      stars: reviewForm.stars,
      reviewer_name: reviewForm.reviewer_name.trim() || null,
      comment: reviewForm.comment.trim() || null,
      platform: reviewForm.platform || null,
      review_date: reviewForm.review_date || localDateStr(),
    };
    setSavingReview(true);
    setReviewError('');
    try {
      if (editingReviewId) {
        const existing = reviews.find(r => r.id === editingReviewId);
        if (!existing) throw new Error('Review not found');
        const { error } = await updateGuideReview(supabase, user.id, existing, payload, guideName);
        if (error) throw new Error(error);
      } else {
        const { error } = await addGuideReview(supabase, user.id, guideName, payload);
        if (error) throw new Error(error);
      }
      await refreshReviews();
      cancelEditReview();
    } catch (e: any) {
      setReviewError(e.message || 'Failed to save review.');
    } finally {
      setSavingReview(false);
    }
  };

  const handleDeleteReview = async (r: GuideReviewRow) => {
    if (!user) return;
    if (!confirm('Delete this review?')) return;
    const guideName = guides.find(g => g.id === r.guide_id)?.name || 'Guide';
    const { error } = await deleteGuideReview(supabase, user.id, r, guideName);
    if (error) { alert(`Failed to delete review: ${error}`); return; }
    await refreshReviews();
  };

  // Exclude/re-include a review from the score — the review itself stays on file either way.
  const handleToggleReviewExcluded = async (r: GuideReviewRow) => {
    if (!user) return;
    const guideName = guides.find(g => g.id === r.guide_id)?.name || 'Guide';
    const { error } = await setReviewExcluded(supabase, user.id, r, !r.excluded_from_score, guideName);
    if (error) { alert(`Failed to update review: ${error}`); return; }
    await refreshReviews();
  };

  const filteredReviewList = useMemo(() => {
    return reviews
      .filter(r => reviewListGuideFilter === 'All' || r.guide_id === reviewListGuideFilter)
      .filter(r => reviewListPlatformFilter === 'All' || r.platform === reviewListPlatformFilter)
      .sort((a, b) => (b.review_date || '').localeCompare(a.review_date || ''));
  }, [reviews, reviewListGuideFilter, reviewListPlatformFilter]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [gRes, aRes, rRes, monthlyRes, arrivalsRes, sgRes, sessRes, reviewsRes, checkinsRes, sessionBookingsRes] = await Promise.all([
      supabase.from('guides').select('*').eq('user_id', user.id).order('name'),
      // Previously filtered to `sync_source in (gsheet_assignments, manual, null)`, which silently
      // excluded every row tagged `sync_source = 'import'` — that batch holds 96 of the 97 rows
      // that actually have a guide_id (the real, attributable tour history), while the rows this
      // filter DID include are almost entirely unattributed (guide_id null). That's the root cause
      // of the header/per-guide mismatch: the header counted the (mostly unattributed) included
      // rows while the per-guide cards could only ever match the handful with a guide_id. Every
      // sync_source value present in this table represents real imported/synced history — none of
      // them should be excluded — so this now loads all of it.
      supabase
        .from('guide_assignments')
        .select('*')
        .eq('user_id', user.id),
      supabase.from('guide_product_rates').select('*').eq('user_id', user.id),
      supabase.from('guide_monthly').select('*').eq('user_id', user.id),
      supabase.from('guide_arrivals').select('guide_id, minutes_late').eq('user_id', user.id),
      supabase.from('session_guides').select('session_id, guide_id, status, base_pay, bonus, checkin_time').eq('user_id', user.id),
      supabase.from('tour_sessions').select('id, tour_date, start_time, label').eq('user_id', user.id),
      supabase.from('guide_reviews').select('*').eq('user_id', user.id),
      // Only ever need checked-in bookings from Oct 1 2026 onward — the score's floor is fixed,
      // never reactive to adminFilter (see ADMIN_DEFAULT_FILTER_START's own usage elsewhere).
      // travel_date is the checkin's OWN date — computeCheckedInBookingRecords counts off this
      // column directly, never a joined session's tour_date (see its own doc comment for why).
      supabase.from('checkins').select('booking_ref, status, travel_date').eq('user_id', user.id)
        .eq('status', 'checked_in').gte('travel_date', ADMIN_DEFAULT_FILTER_START),
      supabase.from('session_bookings').select('booking_ref, allotted_guide_id, session_id').eq('user_id', user.id),
    ]);

    if (gRes.data) setGuides(gRes.data);
    if (aRes.data) setAssignments(aRes.data);
    if (rRes.data) setOptionRates(rRes.data);
    setMonthlyRows(monthlyRes.data || []);
    setArrivals(arrivalsRes.data || []);
    setSessionGuidesForPay(sgRes.data || []);
    setSessionsForPay(sessRes.data || []);
    setReviews(reviewsRes.data || []);
    setCheckinsForGuiding(checkinsRes.data || []);
    setSessionBookingsForGuiding(sessionBookingsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  // SESSION-BASED PAY UNIFICATION — converts session_guides.base_pay/bonus into the same
  // GuideAssignmentRow shape as imported guide_assignments rows, then concatenates the two into
  // ONE combined array (`allAssignments`) that every stats/overview/chart/list function below
  // consumes instead of raw `assignments` — see lib/guidePerformance.ts for the full rationale.
  // Paid status for session-based pay is derived per MONTH (payment_sent on guide_monthly), not
  // per row, matching how monthly invoicing already works for imported history.
  const paidMonthsByGuide = useMemo(
    () => new Set(monthlyRows.filter(m => m.payment_sent && m.guide_id).map(m => `${m.guide_id}:${m.month}`)),
    [monthlyRows]
  );
  const sessionAssignmentRows = useMemo(
    () => sessionGuidesToAssignmentRows(sessionGuidesForPay, sessionsForPay, paidMonthsByGuide),
    [sessionGuidesForPay, sessionsForPay, paidMonthsByGuide]
  );
  // Admin-only dedup: the same physical tour can exist in BOTH the legacy per-booking
  // guide_assignments import AND the newer per-session session_guides pay system (e.g. assigned
  // via the standalone check-in app's booking-level flow, which writes guide_assignments
  // independently of session_guides) — see dedupeAssignmentsAcrossSources's own doc comment.
  // GuideHome.tsx (the guide's own dashboard) intentionally keeps the plain concatenation —
  // untouched here, scope stays admin-only.
  const allAssignments = useMemo(
    () => dedupeAssignmentsAcrossSources(assignments, sessionAssignmentRows),
    [assignments, sessionAssignmentRows]
  );

  const todayStr = localDateStr();

  // ONE shared function (getAdminDateFilterBounds, in guidePerformance.ts) computes the window
  // and filterAssignmentsByDateRange filters `allAssignments` (imported + session-based combined)
  // down to it — the totals strip, per-guide cards, "All Guides" table AND the detail panel below
  // are all derived from this SAME filtered array, so they're structurally incapable of
  // disagreeing. Selecting "All Time" simply widens the bounds to cover everything — nothing is
  // ever a separate, hidden dataset; it's the exact same pipe with wider bounds.
  const filteredAssignments = useMemo(
    () => filterAssignmentsByDateRange(allAssignments, getAdminDateFilterBounds(adminFilter)),
    [allAssignments, adminFilter]
  );

  // Secondary status filter (Upcoming/Done/Paid/Pending/All), narrowing the ACTUAL tour list
  // (not just which guides end up showing) — see filterAssignmentsByStatus's own doc comment.
  // Every downstream number (top totals strip, per-guide cards, the "All Guides" table, the
  // detail panel) is derived from this ONE narrowed array, so they can never disagree.
  const statusFilteredAssignments = useMemo(
    () => filterAssignmentsByStatus(filteredAssignments, statusFilter, todayStr),
    [filteredAssignments, statusFilter, todayStr]
  );

  // Scopes the "Unlinked" virtual rows (orphaned guide_monthly history with no guide_id) to the
  // SAME date window AND status as every real guide's row above — without the date scoping, a
  // pre-October "Unlinked" row would keep showing its full all-time total under the From-Oct-1
  // default; without the status scoping, it would ignore Paid/Pending/Upcoming entirely. See
  // filterMonthlyRowsByDateRange/filterMonthlyRowsByStatus's own doc comments.
  const filteredMonthlyRowsForOverview = useMemo(() => {
    const dateScoped = filterMonthlyRowsByDateRange(monthlyRows, getAdminDateFilterBounds(adminFilter));
    return filterMonthlyRowsByStatus(dateScoped, statusFilter);
  }, [monthlyRows, adminFilter, statusFilter]);

  // The score's denominator — checked-in BOOKINGS only, since Oct 1 2026, fixed regardless of
  // whatever adminFilter/statusFilter the rest of the page is currently showing. Dated directly
  // off each checkin row's own travel_date (see computeCheckedInBookingRecords' own doc comment).
  const checkedInBookingRecords = useMemo(
    () => computeCheckedInBookingRecords(sessionBookingsForGuiding, checkinsForGuiding, ADMIN_DEFAULT_FILTER_START, sessionGuidesForPay),
    [sessionBookingsForGuiding, checkinsForGuiding, sessionGuidesForPay]
  );
  const overallBookingCounts = useMemo(() => countCheckedInBookingsByGuide(checkedInBookingRecords), [checkedInBookingRecords]);

  // Reviews feeding the score are likewise always scoped to Oct 1 2026 onward, never to
  // adminFilter — the review LIST further down the page (filterable by guide/platform) uses the
  // full `reviews` array instead, since browsing/avoiding duplicates benefits from seeing
  // everything on file, not just the score's own fixed window.
  const reviewsSinceOct1 = useMemo(
    () => reviews.filter(r => r.review_date >= ADMIN_DEFAULT_FILTER_START),
    [reviews]
  );

  // Headline per-guide score — overall/Oct-1-onward, shown on every card/row/detail panel here.
  // The ranked, period-filterable Leaderboard now lives on its own page (LeaderboardPage.tsx) —
  // see that file for the monthly view.
  const reviewScoreByGuide = useMemo(() => {
    const out = new Map<string, GuideReviewScore>();
    guides.forEach(g => {
      const guideReviews = reviewsSinceOct1.filter(r => r.guide_id === g.id);
      out.set(g.id, computeGuideReviewScore(guideReviews, overallBookingCounts.get(g.id) || 0));
    });
    return out;
  }, [guides, reviewsSinceOct1, overallBookingCounts]);

  // "All Guides" overview now respects both the selected period AND status (per-guide
  // cards/totals strip/table all agree, all built from the same narrowed arrays) — pass
  // adminFilter.mode === 'allTime' + statusFilter === 'all' to see the old lifetime-only view,
  // including every "Unlinked" row regardless of date. The review score columns are the one
  // exception — always Oct-1-onward, per computeGuideOverviewRows' own inputs here.
  const overviewRows = useMemo(
    () => computeGuideOverviewRows(guides, statusFilteredAssignments, reviewsSinceOct1, overallBookingCounts, filteredMonthlyRowsForOverview, todayStr),
    [guides, statusFilteredAssignments, reviewsSinceOct1, overallBookingCounts, filteredMonthlyRowsForOverview, todayStr]
  );
  // Drops a guide with literally nothing left after the status narrowing above, instead of
  // rendering an empty €0 row — see matchesAdminStatusFilter's own doc comment.
  const visibleOverviewRows = useMemo(
    () => overviewRows.filter(row => matchesAdminStatusFilter(row, statusFilter)),
    [overviewRows, statusFilter]
  );
  const unattributedAssignmentCount = useMemo(
    () => assignments.filter(a => !a.guide_id).length,
    [assignments]
  );

  // "Paid through [month]" + last payment date, per guide — always all-time regardless of the
  // period filter (see computeGuidePaymentSummary's own doc comment: this is an "are we caught
  // up overall" question, not something that should vanish just because a single month is being
  // viewed). Grouped once here and looked up per guide below.
  const paymentSummaryByGuide = useMemo(() => {
    const byGuide = new Map<string, GuideMonthlyRow[]>();
    monthlyRows.forEach(r => {
      if (!r.guide_id) return;
      const arr = byGuide.get(r.guide_id) || [];
      arr.push(r);
      byGuide.set(r.guide_id, arr);
    });
    const out = new Map<string, GuidePaymentSummary>();
    byGuide.forEach((rows, guideId) => out.set(guideId, computeGuidePaymentSummary(rows)));
    return out;
  }, [monthlyRows]);

  const detailGuide = detailGuideId ? guides.find(g => g.id === detailGuideId) || null : null;
  // Date- AND status-scoped (same statusFilteredAssignments every other section uses) — the
  // detail view's earned/paid/pending/tours (via GuideStatCards below) respects both filters too.
  const detailGuideAssignments = useMemo(
    () => detailGuideId ? statusFilteredAssignments.filter(a => a.guide_id === detailGuideId) : [],
    [statusFilteredAssignments, detailGuideId]
  );
  const detailGuidePaymentSummary = detailGuideId
    ? (paymentSummaryByGuide.get(detailGuideId) || { paidThroughMonth: null, lastPaymentDate: null })
    : { paidThroughMonth: null, lastPaymentDate: null };
  // Unified per-month view — real (imported) guide_monthly rows plus a synthetic row for any
  // month whose ONLY earnings are session-based (no guide_monthly row yet) — see
  // buildUnifiedMonthlyRows in lib/guidePerformance.ts.
  const detailGuideMonthly: UnifiedMonthlyRow[] = useMemo(() => {
    if (!detailGuideId) return [];
    const mySessionRows = sessionAssignmentRows.filter(a => a.guide_id === detailGuideId);
    return buildUnifiedMonthlyRows(detailGuideId, detailGuide?.name || '', monthlyRows, mySessionRows);
  }, [detailGuideId, detailGuide, monthlyRows, sessionAssignmentRows]);
  const detailGuideStats = useMemo(
    () => computeAssignmentStats(detailGuideAssignments, todayStr),
    [detailGuideAssignments, todayStr]
  );
  const detailGuideMonthlyEarnings = useMemo(
    () => groupMonthlyEarnings(detailGuideAssignments),
    [detailGuideAssignments]
  );
  const detailGuideArrivals = useMemo(
    () => detailGuideId ? arrivals.filter(a => a.guide_id === detailGuideId) : [],
    [arrivals, detailGuideId]
  );
  // Display-only "On-time X/Y" next to the review score below — zero-weight in the real score
  // today (see PUNCTUALITY_SCORE_WEIGHT in guidePerformance.ts), shown here as the same raw
  // arrival-vs-checkin_time count the guide's own dashboard shows (GuideOwnScoreCard).
  const detailGuidePunctuality = useMemo(
    () => computePunctualityStats(detailGuideArrivals),
    [detailGuideArrivals]
  );

  const virtualMonthlyByName = useMemo(() => groupOrphanedMonthlyByName(monthlyRows), [monthlyRows]);
  const detailVirtualRows = detailVirtualName ? (virtualMonthlyByName.get(detailVirtualName) || []) : [];

  const closeDetail = () => { setDetailGuideId(null); setDetailVirtualName(null); };

  const refreshMonthly = async () => {
    if (!user) return;
    const { data } = await supabase.from('guide_monthly').select('*').eq('user_id', user.id);
    setMonthlyRows(data || []);
  };

  // Session-based pay is stored on session_guides, never guide_monthly, so "Mark Paid" on a
  // session-based month can't be a plain UPDATE — there's no row to update yet the first time.
  // `id` on a not-yet-persisted month is always "virtual-month:<guideId>:<month>" (see
  // buildUnifiedMonthlyRows) — detected here purely from the id string so MonthlyInvoiceList
  // itself never needs to know about the real/virtual distinction.
  const isVirtualMonthlyId = (id: string) => id.startsWith('virtual-month:');

  const handleUpdatePayment = async (row: GuideMonthlyRow, next: { payment_sent: boolean; payment_date: string | null }) => {
    if (!user) return;
    const guideLabel = row.guide_name || detailGuide?.name || 'Guide';

    if (isVirtualMonthlyId(row.id)) {
      const { error } = await insertGuideMonthlyPayment(
        supabase, user.id,
        { guide_id: row.guide_id, guide_name: row.guide_name, month: row.month, amount_owed: row.amount_owed, tours_completed: row.tours_completed },
        next
      );
      if (error) { alert(`Failed to save payment status: ${error}`); return; }
      await refreshMonthly();
      return;
    }

    const { error } = await updateGuideMonthlyPayment(
      supabase, user.id, row.id, guideLabel, row.month || 'this month',
      { payment_sent: !!row.payment_sent, payment_date: row.payment_date }, next
    );
    if (error) { alert(`Failed to update payment status: ${error}`); return; }
    await refreshMonthly();
  };

  // computeAssignmentStats — the SAME function the guide's own dashboard and the "All Guides"
  // table below both use — so paid/pending here is derived identically everywhere, just scoped to
  // this guide's rows within the selected period.
  // Built from statusFilteredAssignments (date AND status already narrowed) — this is what makes
  // the top totals strip below (summed from this same array) follow the status filter instead of
  // staying fixed: selecting "Paid" means every guide's own Tours/Earnings tiles AND the header
  // totals both become the paid-only subset, by construction, not by a separate patch.
  const guideStats = useMemo(() => {
    return guides.map(g => {
      const myAsns = statusFilteredAssignments.filter(a => a.guide_id === g.id);
      const stats = computeAssignmentStats(myAsns, todayStr);
      const payment = paymentSummaryByGuide.get(g.id) || { paidThroughMonth: null, lastPaymentDate: null };
      return {
        ...g, tours: myAsns.length, earnings: stats.totalEarned, paid: stats.paidAmount, pending: stats.pendingAmount,
        toursDone: stats.toursDone, toursUpcoming: stats.toursUpcoming, payment,
      };
    });
  }, [guides, statusFilteredAssignments, todayStr, paymentSummaryByGuide]);

  // Drops a guide with nothing left after the status narrowing above, instead of rendering an
  // empty €0 card — same matchesAdminStatusFilter predicate as visibleOverviewRows, so the cards
  // grid and the "All Guides" table can never disagree on which guides are showing.
  const visibleGuideStats = useMemo(
    () => guideStats.filter(g => matchesAdminStatusFilter(
      { toursDone: g.toursDone, toursUpcoming: g.toursUpcoming, paidAmount: g.paid, pendingAmount: g.pending },
      statusFilter
    )),
    [guideStats, statusFilter]
  );

  // Header totals are the SUM of the per-guide cards (not an independently-recomputed count over
  // filteredAssignments) — this is what guarantees "Total Tours == sum of every guide card's
  // tours" by construction, for every preset, forever, rather than merely by the two happening to
  // use the same filtered array today. A row with no guide_id (unattributed imported history)
  // can't belong to any guide's card, so it correctly can't count toward "tours performed by
  // guides" here either — it's surfaced separately via unattributedInRangeCount below instead of
  // silently vanishing.
  // Summed from guideStats, which is itself built from statusFilteredAssignments — so these
  // follow BOTH the date filter and the secondary status filter automatically, with no separate
  // patch needed (requirement: top totals must update with the status filter, not stay fixed).
  const totalTours = useMemo(() => guideStats.reduce((sum, g) => sum + g.tours, 0), [guideStats]);
  const totalEarnings = useMemo(() => guideStats.reduce((sum, g) => sum + g.earnings, 0), [guideStats]);
  const unattributedInRangeCount = useMemo(
    () => statusFilteredAssignments.filter(a => !a.guide_id).length,
    [statusFilteredAssignments]
  );

  // Self-check (dev only): recompute Total Tours independently — by filtering+counting
  // guide-attributed rows directly out of the SAME statusFilteredAssignments array, rather than
  // via guideStats' per-guide reduce — and assert it still matches. Passes trivially today since
  // totalTours is defined as that same sum, but it's a real regression guard: it would fire the
  // moment a future edit makes guideStats and totalTours diverge again (e.g. reintroducing an
  // independently-filtered header count), which is exactly the class of bug this diff fixes.
  if (import.meta.env.DEV) {
    const independentTotal = statusFilteredAssignments.filter(a => !!a.guide_id).length;
    console.assert(
      independentTotal === totalTours,
      '[GuideDashboard] Total Tours header does not equal the sum of per-guide cards',
      { adminFilter, statusFilter, totalTours, independentTotal }
    );
  }

  const handleDownloadInvoice = async () => {
    if (!selectedGuide) return;
    // allAssignments (imported + unified session-based pay), not the raw imported-only
    // `assignments` — otherwise a guide's session-based tours/pay would silently never appear on
    // their invoice even though they're already counted in every on-screen total.
    const guideAsns = allAssignments.filter(a =>
      a.guide_id === selectedGuide.id &&
      (a.travel_date || '') >= invoiceDates.from &&
      (a.travel_date || '') <= invoiceDates.to
    );
    
    if (guideAsns.length === 0) {
      alert("No assignments found for this guide in the selected period.");
      return;
    }

    // jsPDF (+ jspdf-autotable) is a heavy dependency only ever needed for this one action —
    // loaded on demand instead of bundled into the app's initial download.
    const { generateGuideInvoice } = await import('@/lib/generateInvoice');
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
        <div className="flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-foreground">Guide Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1.5">Performance tracking and earnings overview</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => openReviewsModal()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gold text-black text-xs font-bold uppercase tracking-wide shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Plus size={14} />
                Add Review
              </button>
              <button
                onClick={() => navigate('/app/leaderboard')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted border border-border text-xs font-bold uppercase tracking-wide hover:border-gold/30 transition-all"
              >
                View Leaderboard
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 md:items-end">
            <div className="flex flex-wrap items-center gap-1.5 bg-muted/60 p-1.5 rounded-2xl border border-border">
              {ADMIN_DATE_FILTER_PRESETS.map(preset => (
                <button
                  key={preset.mode}
                  onClick={() => selectPreset(preset.mode)}
                  className={`px-3.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide transition-all ${
                    adminFilter.mode === preset.mode
                      ? 'bg-card text-gold shadow-[var(--card-shadow)]'
                      : 'text-muted-foreground hover:text-foreground/80'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <div className="w-px h-5 bg-border mx-0.5" />
              <button
                onClick={() => selectMonth(monthInput)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide transition-all ${
                  adminFilter.mode === 'month' ? 'bg-card text-gold shadow-[var(--card-shadow)]' : 'text-muted-foreground hover:text-foreground/80'
                }`}
              >
                <Calendar size={13} />
                Month
              </button>
              <button
                onClick={() => selectRange(rangeFromInput, rangeToInput)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide transition-all ${
                  adminFilter.mode === 'range' ? 'bg-card text-gold shadow-[var(--card-shadow)]' : 'text-muted-foreground hover:text-foreground/80'
                }`}
              >
                <CalendarRange size={13} />
                Range
              </button>
            </div>
            {adminFilter.mode === 'month' && (
              <input
                type="month"
                value={monthInput}
                onChange={e => selectMonth(e.target.value)}
                className="aurelia-input text-xs py-1.5 px-2.5"
              />
            )}
            {adminFilter.mode === 'range' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={rangeFromInput}
                  onChange={e => selectRange(e.target.value, rangeToInput)}
                  className="aurelia-input text-xs py-1.5 px-2.5"
                />
                <span className="text-muted-foreground text-xs">→</span>
                <input
                  type="date"
                  value={rangeToInput}
                  onChange={e => selectRange(rangeFromInput, e.target.value)}
                  className="aurelia-input text-xs py-1.5 px-2.5"
                />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground font-medium">
              Showing <span className="text-foreground font-bold">{adminFilterLabel}</span>
            </p>
            <div className="flex flex-wrap items-center gap-1.5 bg-muted/60 p-1.5 rounded-2xl border border-border">
              {ADMIN_STATUS_FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`px-3.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide transition-all ${
                    statusFilter === opt.value
                      ? 'bg-card text-gold shadow-[var(--card-shadow)]'
                      : 'text-muted-foreground hover:text-foreground/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
              <div className="aurelia-card p-6 border-l-[3px] border-l-blue-500">
                <div className="flex items-center gap-2.5 text-muted-foreground mb-2.5">
                  <Activity size={16} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide">Total Tours</span>
                </div>
                <div className="text-3xl font-bold tracking-tight">{totalTours}</div>
              </div>
              <div className="aurelia-card p-6 border-l-[3px] border-l-gold">
                <div className="flex items-center gap-2.5 text-muted-foreground mb-2.5">
                  <Euro size={16} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide">Total Earnings</span>
                </div>
                <div className="text-3xl font-bold tracking-tight text-gold">€{totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="aurelia-card p-6 border-l-[3px] border-l-purple-500">
                <div className="flex items-center gap-2.5 text-muted-foreground mb-2.5">
                  <BarChart2 size={16} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide">Avg / Tour</span>
                </div>
                <div className="text-3xl font-bold tracking-tight text-purple-700">€{totalTours > 0 ? (totalEarnings / totalTours).toFixed(2) : '0.00'}</div>
              </div>
            </div>

            {unattributedInRangeCount > 0 && (
              <p className="text-[11px] text-muted-foreground -mt-4 flex items-center gap-1.5">
                <Info size={12} className="shrink-0" />
                {unattributedInRangeCount} additional tour{unattributedInRangeCount !== 1 ? 's' : ''} in this period {unattributedInRangeCount !== 1 ? "have" : "has"} no guide on file, so {unattributedInRangeCount !== 1 ? "they aren't" : "it isn't"} counted above or on any guide's card.
              </p>
            )}

            {statusFilter !== 'all' && visibleGuideStats.length === 0 && (
              <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-2xl bg-muted/40">
                <p className="text-sm font-semibold text-foreground">No guides match "{statusFilterLabel}" in {adminFilterLabel}</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different status, or widen the date range.</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleGuideStats.map(g => (
                <div key={g.id} className="aurelia-card p-6 border border-border hover:border-gold/30 hover:shadow-[var(--card-shadow-hover)] transition-all group">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-xl border border-border group-hover:border-gold/50 transition-colors">
                      👤
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-base text-foreground group-hover:text-gold transition-colors truncate">{g.name}</div>
                      <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">{g.guide_number}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted p-3 rounded-xl border border-border">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Tours</div>
                      <div className="text-xl font-bold">{g.tours}</div>
                    </div>
                    <div className="bg-muted p-3 rounded-xl border border-border">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Earnings</div>
                      <div className="text-xl font-bold text-gold">€{g.earnings.toLocaleString()}</div>
                    </div>
                    <div className="bg-green-600/8 p-3 rounded-xl border border-green-600/15">
                      <div className="text-[10px] font-bold text-green-700/80 uppercase tracking-widest mb-1">Paid</div>
                      <div className="text-base font-bold text-green-700">€{g.paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div className="bg-amber-600/8 p-3 rounded-xl border border-amber-600/15">
                      <div className="text-[10px] font-bold text-amber-700/80 uppercase tracking-widest mb-1">Pending</div>
                      <div className="text-base font-bold text-amber-700">€{g.pending.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mt-4 text-[11px] text-muted-foreground">
                    <CheckCircle2 size={12} className="shrink-0 text-muted-foreground/60" />
                    {g.payment.paidThroughMonth
                      ? <span>Paid through <span className="font-semibold text-foreground">{g.payment.paidThroughMonth}</span>{g.payment.lastPaymentDate ? ` · last paid ${g.payment.lastPaymentDate}` : ''}</span>
                      : <span>No payments recorded yet</span>
                    }
                  </div>

                  {(() => {
                    const rs = reviewScoreByGuide.get(g.id);
                    const band = getScoreBand(rs?.score ?? null);
                    return (
                      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
                        <Star size={12} className="shrink-0 text-gold" />
                        <span>
                          Score{' '}
                          <span className={`font-semibold ${rs?.score != null ? (rs.score >= 0 ? 'text-green-700' : 'text-red-600') : 'text-foreground'}`}>
                            {rs?.score != null ? `${rs.score >= 0 ? '+' : ''}${rs.score.toFixed(2)}` : '—'}
                          </span>
                          {' · '}{rs?.reviewCount ?? 0} review{(rs?.reviewCount ?? 0) !== 1 ? 's' : ''} / {rs?.bookingsGuided ?? 0} bookings
                          {band && <span className="text-muted-foreground"> · {ADMIN_SCORE_BAND_LABELS[band]}</span>}
                        </span>
                        <ScoreInfoTooltip />
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-3 gap-2.5 mt-5">
                    <button
                      onClick={() => openReviewsModal(g.id)}
                      className="py-3 bg-muted border border-border rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-muted/70 hover:border-gold/30 transition-all flex items-center justify-center gap-1.5 group/btn"
                    >
                      <Star size={13} className="text-muted-foreground group-hover/btn:text-gold" />
                      Reviews
                    </button>
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

            {/* ALL GUIDES — PERIOD-SCOPED OVERVIEW */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold tracking-tight">All Guides — {adminFilterLabel}</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Totals for the selected period{statusFilter !== 'all' ? ` · ${statusFilterLabel} only` : ''}. "Unlinked" imported history only appears when its month falls inside the selected window — switch to "All Time" above to see every tour on record, including older unlinked rows. Score/Reviews are always since Oct 1, 2026 — see the Leaderboard page for a monthly breakdown.
              </p>
              {visibleOverviewRows.length === 0 ? (
                <div className="aurelia-card border border-dashed border-border p-10 text-center">
                  <p className="text-sm text-muted-foreground">No guides match the current date and status filters.</p>
                </div>
              ) : (
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
                      <th className="px-5 py-3 text-right">
                        <span className="inline-flex items-center gap-1">
                          Score <ScoreInfoTooltip />
                        </span>
                      </th>
                      <th className="px-5 py-3 text-right">Reviews</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleOverviewRows.map(row => {
                      const band = getScoreBand(row.reviewScore);
                      return (
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
                          {row.reviewScore != null ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`font-bold ${row.reviewScore >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {row.reviewScore >= 0 ? '+' : ''}{row.reviewScore.toFixed(2)}
                              </span>
                              {band && <span className="text-[9px] text-muted-foreground">{ADMIN_SCORE_BAND_LABELS[band]}</span>}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                          {row.reviewCount} / {row.bookingsGuided}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
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
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">{selectedGuide.name} · {adminFilterLabel}{statusFilter !== 'all' ? ` · ${statusFilterLabel}` : ''}</p>
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
                    {statusFilteredAssignments.filter(a => a.guide_id === selectedGuide.id).map(a => (
                      <tr key={a.id} className="hover:bg-muted transition-colors">
                        <td className="px-3 py-3 font-mono text-muted-foreground whitespace-nowrap">{a.travel_date}</td>
                        <td className="px-3 py-3 text-muted-foreground">{a.travel_time || '—'}</td>
                        <td className="px-3 py-3 font-bold">{a.tour_name || a.product_code || '—'}</td>
                        <td className="px-3 py-3 text-foreground/80">{a.language || '—'}</td>
                        <td className="px-3 py-3 text-muted-foreground">{a.tour_type || '—'}</td>
                        <td className="px-3 py-3 text-right font-mono">€{Number(a.calculated_pay || 0).toFixed(2)}</td>
                        <td className="px-3 py-3 text-right font-mono text-gold">{a.bonus ? `€${Number(a.bonus).toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-3 text-right font-black text-green-700">€{assignmentEarned(a).toFixed(2)}</td>
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

        {/* REVIEWS MODAL — Add/Edit form + filterable list, shared by the header "+ Add Review"
            action and every per-guide card's "Reviews" shortcut. */}
        {showReviewsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-xl animate-fade-in">
            <div className="bg-card border border-border rounded-[32px] w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-6 md:p-8 border-b border-border flex items-center justify-between bg-muted shrink-0">
                <div>
                  <h2 className="text-2xl font-black">Reviews</h2>
                  <p className="text-xs text-muted-foreground mt-1">Individually logged reviews — drives each guide's score.</p>
                </div>
                <button onClick={() => setShowReviewsModal(false)} className="p-2 hover:bg-background rounded-xl text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 aurelia-scrollbar">
                {/* ADD / EDIT FORM */}
                <section className="aurelia-card p-5 space-y-4">
                  <h3 className="text-xs font-bold text-gold uppercase tracking-widest border-b border-border pb-2">
                    {editingReviewId ? 'Edit Review' : 'Add Review'}
                  </h3>
                  {reviewError && (
                    <div className="p-3 rounded-lg bg-red-600/10 border border-red-600/20 text-sm text-red-700">{reviewError}</div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Guide</label>
                      <select
                        value={reviewForm.guide_id}
                        onChange={e => setReviewForm(prev => ({ ...prev, guide_id: e.target.value }))}
                        className="aurelia-input w-full appearance-none bg-muted text-foreground"
                      >
                        <option value="">Select a guide…</option>
                        {guides.map(g => <option key={g.id} value={g.id}>{g.name} ({g.guide_number})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Platform</label>
                      <select
                        value={reviewForm.platform}
                        onChange={e => setReviewForm(prev => ({ ...prev, platform: e.target.value }))}
                        className="aurelia-input w-full appearance-none bg-muted text-foreground"
                      >
                        {REVIEW_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Stars</label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setReviewForm(prev => ({ ...prev, stars: n }))}
                          className="p-1"
                          aria-label={`${n} star${n !== 1 ? 's' : ''}`}
                        >
                          <Star size={26} className={n <= reviewForm.stars ? 'fill-gold text-gold' : 'text-muted-foreground/30'} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Reviewer Name</label>
                      <input
                        value={reviewForm.reviewer_name}
                        onChange={e => setReviewForm(prev => ({ ...prev, reviewer_name: e.target.value }))}
                        className="aurelia-input w-full"
                        placeholder="e.g. John S."
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Review Date</label>
                      <input
                        type="date"
                        value={reviewForm.review_date}
                        onChange={e => setReviewForm(prev => ({ ...prev, review_date: e.target.value }))}
                        className="aurelia-input w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Comment</label>
                    <textarea
                      rows={2}
                      value={reviewForm.comment}
                      onChange={e => setReviewForm(prev => ({ ...prev, comment: e.target.value }))}
                      className="aurelia-input w-full resize-none"
                      placeholder="What the review said"
                    />
                  </div>

                  <div className="flex gap-3 pt-1">
                    {editingReviewId && (
                      <button onClick={cancelEditReview} className="flex-1 py-3 rounded-xl font-bold border border-border hover:bg-muted transition-colors text-sm">
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={handleSaveReview}
                      disabled={savingReview}
                      className="flex-[2] py-3 bg-gold text-black rounded-xl font-black text-sm uppercase tracking-widest shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
                    >
                      {savingReview ? 'Saving…' : editingReviewId ? 'Save Changes' : 'Add Review'}
                    </button>
                  </div>
                </section>

                {/* FILTERABLE LIST */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                      All Reviews ({filteredReviewList.length})
                    </h3>
                    <div className="flex gap-2">
                      <select
                        value={reviewListGuideFilter}
                        onChange={e => setReviewListGuideFilter(e.target.value)}
                        className="aurelia-input text-xs py-1.5 appearance-none bg-muted"
                      >
                        <option value="All">All Guides</option>
                        {guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <select
                        value={reviewListPlatformFilter}
                        onChange={e => setReviewListPlatformFilter(e.target.value)}
                        className="aurelia-input text-xs py-1.5 appearance-none bg-muted"
                      >
                        <option value="All">All Platforms</option>
                        {REVIEW_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>

                  {filteredReviewList.length === 0 ? (
                    <div className="aurelia-card p-8 text-center text-muted-foreground text-sm">No reviews match these filters.</div>
                  ) : (
                    <div className="space-y-2">
                      {filteredReviewList.map(r => {
                        const guideName = guides.find(g => g.id === r.guide_id)?.name || 'Unknown guide';
                        return (
                          <div key={r.id} className="aurelia-card p-4 flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <div className="flex items-center gap-0.5 text-gold">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star key={i} size={12} className={i < r.stars ? 'fill-gold' : 'opacity-20'} />
                                  ))}
                                </div>
                                <span className="text-sm font-bold text-foreground">{guideName}</span>
                                {r.platform && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">{r.platform}</span>
                                )}
                                <span className="text-[11px] text-muted-foreground font-mono">{r.review_date}</span>
                                {r.excluded_from_score && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-600/10 text-red-700 border border-red-600/20">Excluded from score</span>
                                )}
                              </div>
                              {r.reviewer_name && <p className="text-xs font-semibold text-foreground/80">{r.reviewer_name}</p>}
                              {r.comment && <p className="text-xs text-muted-foreground mt-0.5">{r.comment}</p>}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleToggleReviewExcluded(r)}
                                className={`p-2 rounded-lg transition-colors ${r.excluded_from_score ? 'text-red-600 hover:bg-red-600/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                                aria-label={r.excluded_from_score ? 'Re-include review in score' : 'Exclude review from score'}
                                title={r.excluded_from_score ? 'Re-include in score' : 'Exclude from score'}
                              >
                                {r.excluded_from_score ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                              <button onClick={() => startEditReview(r)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit review">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handleDeleteReview(r)} className="p-2 hover:bg-red-600/10 rounded-lg text-muted-foreground hover:text-red-600 transition-colors" aria-label="Delete review">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Tours &amp; Pay · {adminFilterLabel}{statusFilter !== 'all' ? ` · ${statusFilterLabel}` : ''}</h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <CheckCircle2 size={12} className="shrink-0 text-muted-foreground/60" />
                      {detailGuidePaymentSummary.paidThroughMonth
                        ? <span>Paid through <span className="font-semibold text-foreground">{detailGuidePaymentSummary.paidThroughMonth}</span>{detailGuidePaymentSummary.lastPaymentDate ? ` · last paid ${detailGuidePaymentSummary.lastPaymentDate}` : ''}</span>
                        : <span>No payments recorded yet</span>
                      }
                    </div>
                  </div>
                  <GuideStatCards stats={detailGuideStats} />
                  <Suspense fallback={<div className="h-64 rounded-2xl bg-muted animate-pulse" />}>
                    <GuideEarningsChart data={detailGuideMonthlyEarnings} />
                  </Suspense>
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Reviews · Since Oct 1, 2026</h3>
                      <ScoreInfoTooltip />
                    </div>
                    <button
                      onClick={() => openReviewsModal(detailGuide.id)}
                      className="px-3 py-1.5 rounded-lg bg-muted border border-border text-[10px] font-bold uppercase tracking-widest hover:border-gold/30 transition-all"
                    >
                      Manage Reviews
                    </button>
                  </div>
                  {(() => {
                    const rs = reviewScoreByGuide.get(detailGuide.id);
                    const band = getScoreBand(rs?.score ?? null);
                    return (
                      <div className="aurelia-card p-5 border-l-[3px] border-l-gold space-y-3">
                        <div className="flex flex-wrap items-center gap-6">
                          <div>
                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Score</div>
                            <div className={`text-2xl font-bold ${rs?.score != null ? (rs.score >= 0 ? 'text-green-700' : 'text-red-600') : ''}`}>
                              {rs?.score != null ? `${rs.score >= 0 ? '+' : ''}${rs.score.toFixed(2)}` : '—'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Reviews</div>
                            <div className="text-2xl font-bold">{rs?.reviewCount ?? 0}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Bookings</div>
                            <div className="text-2xl font-bold">{rs?.bookingsGuided ?? 0}</div>
                          </div>
                        </div>
                        {band && (
                          <p className={`text-sm font-bold ${band === 'falling' ? 'text-red-600' : band === 'excellent' ? 'text-green-700' : 'text-foreground'}`}>
                            {ADMIN_SCORE_BAND_LABELS[band]}
                          </p>
                        )}
                        {/* Display-only — doesn't affect the score above yet (see PUNCTUALITY_SCORE_WEIGHT). */}
                        {detailGuidePunctuality.countedArrivals > 0 && (
                          <div className="pt-3 border-t border-border text-xs text-muted-foreground">
                            Punctuality: <span className="font-bold text-foreground">On-time {detailGuidePunctuality.onTimeCount}/{detailGuidePunctuality.countedArrivals}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
