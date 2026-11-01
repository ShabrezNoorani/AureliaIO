import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Activity, Euro, BarChart2, Calendar, FileText, X, Star, Info, CheckCircle2, CalendarRange, Plus, Pencil, Trash2, EyeOff, Eye, Wallet, Users, LayoutGrid, Table as TableIcon, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { localDateStr } from '@/lib/utils';
import {
  computeGuideOverviewRows, computeAssignmentStats, computePunctualityStats,
  groupMonthlyEarnings, groupOrphanedMonthlyByName,
  filterAssignmentsByDateRange, assignmentEarned, sessionGuidesToAssignmentRows, buildUnifiedMonthlyRows,
  getAdminDateFilterBounds, computeGuidePaymentSummary, ADMIN_DATE_FILTER_PRESETS, ADMIN_DEFAULT_FILTER_START,
  filterMonthlyRowsByDateRange, matchesAdminStatusFilter, ADMIN_STATUS_FILTER_OPTIONS,
  filterAssignmentsByStatus, filterMonthlyRowsByStatus, dedupeAssignmentsAcrossSources,
  computeGuideReviewScore, REVIEW_PLATFORMS, isApprovedReview,
  computeCheckedInBookingRecords, countCheckedInBookingsByGuide, getScoreBand,
  ADMIN_SCORE_BAND_LABELS, computeMetricValue, getCombinedScoreBand, GUIDE_SCORE_MIN_BOOKINGS,
  computeCheckedInBookingCountsForPeriod, filterReviewsByPeriod, countCheckedInBookingsByGuideAndMonth,
  groupReviewsByMonth,
  type GuideAssignmentRow, type GuideMonthlyRow, type GuideReviewRow,
  type AdminDateFilter, type GuidePaymentSummary, type AdminStatusFilter, type GuideReviewScore,
  type ArrivalPunctualityRow, type SessionGuideForEarnings, type SessionForEarnings, type UnifiedMonthlyRow,
  type CheckinForGuiding, type SessionBookingForGuiding,
} from '@/lib/guidePerformance';
import { updateGuideMonthlyPayment, insertGuideMonthlyPayment } from '@/lib/guideRatingActions';
import { addGuideReview, updateGuideReview, deleteGuideReview, setReviewExcluded, approveGuideReview, rejectGuideReview, type ReviewPayload } from '@/lib/guideReviewActions';
import PendingReviewsQueue from '@/components/guide/PendingReviewsQueue';
import MonthlyInvoiceList from '@/components/guide/MonthlyInvoiceList';
import ScoreInfoTooltip from '@/components/guide/ScoreInfoTooltip';
import GuideScorePill from '@/components/guide/GuideScorePill';
import GuideDetailView, { type ScoreTrendPoint } from '@/components/guide/GuideDetailView';
import AddBonusModal from '@/components/guide/AddBonusModal';
import { bonusTotalsByGuide, listMonthEndBonuses, isMissingBonusColumnError } from '@/lib/guideBonus';
import { downloadGuideInvoice } from '@/lib/guideInvoice';
import { saveMonthEndBonus } from '@/lib/guideRatingActions';


const fmtEur = (v: number) => `€${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface GuideArrivalRow extends ArrivalPunctualityRow {
  guide_id: string;
  arrived_at?: string | null;
}

/** Combined score is 0-100 (review 65% + punctuality 35%) — same formatting as the Leaderboard. */
function formatCombinedScore(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}%`;
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
  // APPROVED reviews only — everything below (score, list, counts) reads this, exactly as before.
  // Guide-submitted reviews still awaiting approval live separately in pendingReviews and never
  // touch the score until approved (see PendingReviewsQueue).
  const [reviews, setReviews] = useState<GuideReviewRow[]>([]);
  const [pendingReviews, setPendingReviews] = useState<GuideReviewRow[]>([]);
  const applyReviewRows = (rows: GuideReviewRow[]) => {
    setReviews(rows.filter(isApprovedReview));
    setPendingReviews(rows.filter(r => !isApprovedReview(r)));
  };
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

  // Guide detail page — opened from a card or a table row; replaces the overview while open.
  const [detailGuideId, setDetailGuideId] = useState<string | null>(null);
  const [detailVirtualName, setDetailVirtualName] = useState<string | null>(null);
  // Overview presentation — same data, same filter either way.
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showInactive, setShowInactive] = useState(false);

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
    applyReviewRows(data || []);
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

  const handleApproveReview = async (r: GuideReviewRow) => {
    if (!user) return;
    const guideName = guides.find(g => g.id === r.guide_id)?.name || 'Guide';
    const { error } = await approveGuideReview(supabase, user.id, r, guideName);
    if (error) { alert(`Failed to approve review: ${error}`); return; }
    await refreshReviews();
  };

  const handleRejectReview = async (r: GuideReviewRow) => {
    if (!user) return;
    if (!confirm('Reject and discard this review?')) return;
    const guideName = guides.find(g => g.id === r.guide_id)?.name || 'Guide';
    const { error } = await rejectGuideReview(supabase, user.id, r, guideName);
    if (error) { alert(`Failed to reject review: ${error}`); return; }
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
      supabase.from('guide_arrivals').select('guide_id, minutes_late, arrived_at').eq('user_id', user.id),
      supabase.from('session_guides').select('session_id, guide_id, status, base_pay, bonus, checkin_time').eq('user_id', user.id),
      supabase.from('tour_sessions').select('id, tour_date, start_time, label').eq('user_id', user.id),
      supabase.from('guide_reviews').select('*').eq('user_id', user.id),
      // Only ever need checked-in bookings from Oct 1 2026 onward — the score's floor is fixed,
      // never reactive to adminFilter (see ADMIN_DEFAULT_FILTER_START's own usage elsewhere).
      // travel_date is the checkin's OWN date — computeCheckedInBookingRecords counts off this
      // column directly, never a joined session's tour_date (see its own doc comment for why).
      // All checked-in rows (no Oct-1 floor) — the score now follows the selected period, which
      // can be "All Time" or any older month.
      supabase.from('checkins').select('booking_ref, status, travel_date').eq('user_id', user.id)
        .eq('status', 'checked_in'),
      supabase.from('session_bookings').select('booking_ref, allotted_guide_id, session_id').eq('user_id', user.id),
    ]);

    if (gRes.data) setGuides(gRes.data);
    if (aRes.data) setAssignments(aRes.data);
    if (rRes.data) setOptionRates(rRes.data);
    setMonthlyRows(monthlyRes.data || []);
    setArrivals(arrivalsRes.data || []);
    setSessionGuidesForPay(sgRes.data || []);
    setSessionsForPay(sessRes.data || []);
    applyReviewRows(reviewsRes.data || []);
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

  // ONE window for EVERY number on this page — tours/earnings (travel_date), reviews
  // (review_date), checked-in bookings (the checkin's own travel_date), arrivals (arrived_at) and
  // month-end bonuses (their month). Nothing here uses a different window.
  const bounds = useMemo(() => getAdminDateFilterBounds(adminFilter), [adminFilter]);

  // Score denominator for the period — the SAME function the Leaderboard uses for its periods.
  const periodBookingCounts = useMemo(
    () => computeCheckedInBookingCountsForPeriod(sessionBookingsForGuiding, checkinsForGuiding, bounds, sessionGuidesForPay),
    [sessionBookingsForGuiding, checkinsForGuiding, bounds, sessionGuidesForPay]
  );
  const periodReviews = useMemo(() => filterReviewsByPeriod(reviews, bounds), [reviews, bounds]);
  const periodArrivals = useMemo(
    () => arrivals.filter(a => { const d = (a.arrived_at ?? '').slice(0, 10); return !!d && d >= bounds.start && d <= bounds.end; }),
    [arrivals, bounds]
  );

  // Month-end bonuses in the window, narrowed by the status filter the same way tours are (a bonus
  // is paid/pending with its month; it's never "upcoming").
  const bonusByGuide = useMemo(() => {
    const out = new Map<string, { total: number; paid: number; pending: number }>();
    bonusTotalsByGuide(monthlyRows, bounds).forEach((t, guideId) => {
      const shown = statusFilter === 'upcoming' ? { total: 0, paid: 0, pending: 0 }
        : statusFilter === 'paid' ? { total: t.paid, paid: t.paid, pending: 0 }
        : statusFilter === 'pending' ? { total: t.pending, paid: 0, pending: t.pending }
        : t;
      out.set(guideId, shown);
    });
    return out;
  }, [monthlyRows, bounds, statusFilter]);

  // Per-guide score for the period. Combined comes from computeMetricValue('combined', …) — the
  // exact shared function the Leaderboard and the guide's own dashboard use — with the same 3+
  // checked-in-bookings gate ("—" below it).
  const scoreByGuide = useMemo(() => {
    const out = new Map<string, { reviewScore: number | null; reviewCount: number; bookings: number; combined: number | null; onTimeCount: number; countedArrivals: number; reviews: GuideReviewRow[] }>();
    guides.forEach(g => {
      const guideReviews = periodReviews.filter(r => r.guide_id === g.id);
      const guideArrivals = periodArrivals.filter(a => a.guide_id === g.id);
      const bookings = periodBookingCounts.get(g.id) || 0;
      const rs = computeGuideReviewScore(guideReviews, bookings);
      const punctuality = computePunctualityStats(guideArrivals);
      out.set(g.id, {
        reviewScore: rs.score,
        reviewCount: rs.reviewCount,
        bookings,
        combined: bookings >= GUIDE_SCORE_MIN_BOOKINGS ? computeMetricValue('combined', guideReviews, bookings, 0, guideArrivals) : null,
        onTimeCount: punctuality.onTimeCount,
        countedArrivals: punctuality.countedArrivals,
        reviews: guideReviews,
      });
    });
    return out;
  }, [guides, periodReviews, periodArrivals, periodBookingCounts]);

  // Name-only imported monthly history (no guide profile) in the window — table view only.
  const virtualOverviewRows = useMemo(
    () => computeGuideOverviewRows([], [], [], new Map(), filteredMonthlyRowsForOverview, todayStr)
      .filter(row => matchesAdminStatusFilter(row, statusFilter)),
    [filteredMonthlyRowsForOverview, todayStr, statusFilter]
  );

  // "Paid through [month]" + last payment date, per guide — always all-time (an "are we caught
  // up overall" question, see computeGuidePaymentSummary).
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
  const detailGuideAssignments = useMemo(
    () => detailGuideId ? statusFilteredAssignments.filter(a => a.guide_id === detailGuideId) : [],
    [statusFilteredAssignments, detailGuideId]
  );
  const detailGuidePaymentSummary = detailGuideId
    ? (paymentSummaryByGuide.get(detailGuideId) || { paidThroughMonth: null, lastPaymentDate: null })
    : { paidThroughMonth: null, lastPaymentDate: null };
  // Payment history: real guide_monthly rows + synthetic session-only months, scoped to the
  // window like everything else (see buildUnifiedMonthlyRows).
  const detailGuideMonthly: UnifiedMonthlyRow[] = useMemo(() => {
    if (!detailGuideId) return [];
    const mySessionRows = sessionAssignmentRows.filter(a => a.guide_id === detailGuideId);
    return filterMonthlyRowsByDateRange(
      buildUnifiedMonthlyRows(detailGuideId, detailGuide?.name || '', monthlyRows, mySessionRows), bounds);
  }, [detailGuideId, detailGuide, monthlyRows, sessionAssignmentRows, bounds]);
  const detailGuideBonuses = useMemo(
    () => detailGuideId ? listMonthEndBonuses(monthlyRows, { guideId: detailGuideId, bounds }) : [],
    [monthlyRows, detailGuideId, bounds]
  );
  // Review score per month inside the window (same per-booking formula, month by month).
  const detailScoreTrend: ScoreTrendPoint[] = useMemo(() => {
    if (!detailGuideId) return [];
    const records = computeCheckedInBookingRecords(sessionBookingsForGuiding, checkinsForGuiding, bounds.start, sessionGuidesForPay)
      .filter(r => r.guide_id === detailGuideId && r.month <= bounds.end.slice(0, 7));
    const bookingsByMonth = countCheckedInBookingsByGuideAndMonth(records).get(detailGuideId) || new Map<string, number>();
    const reviewsByMonth = groupReviewsByMonth(periodReviews.filter(r => r.guide_id === detailGuideId));
    const months = Array.from(new Set([...bookingsByMonth.keys(), ...reviewsByMonth.keys()])).sort().slice(-12);
    return months.map(month => {
      const monthReviews = reviewsByMonth.get(month) || [];
      const rs = computeGuideReviewScore(monthReviews, bookingsByMonth.get(month) || 0);
      const [y, m] = month.split('-').map(Number);
      return { month, label: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' }), score: rs.score, reviews: rs.reviewCount };
    });
  }, [detailGuideId, sessionBookingsForGuiding, checkinsForGuiding, sessionGuidesForPay, bounds, periodReviews]);

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

  // Per-guide figures for the period: tours/pay from the date+status-narrowed tour list
  // (computeAssignmentStats, same as everywhere), plus that guide's month-end bonuses (never a
  // tour), plus the period score. Earned = tours + bonus; paid/pending split the same way.
  const guideStats = useMemo(() => {
    return guides.map(g => {
      const myAsns = statusFilteredAssignments.filter(a => a.guide_id === g.id);
      const stats = computeAssignmentStats(myAsns, todayStr);
      const bonus = bonusByGuide.get(g.id) || { total: 0, paid: 0, pending: 0 };
      const score = scoreByGuide.get(g.id)!;
      const payment = paymentSummaryByGuide.get(g.id) || { paidThroughMonth: null, lastPaymentDate: null };
      return {
        ...g,
        tours: myAsns.length,
        tourEarnings: stats.totalEarned,
        earnings: stats.totalEarned + bonus.total,
        paid: stats.paidAmount + bonus.paid,
        pending: stats.pendingAmount + bonus.pending,
        bonus: bonus.total,
        toursDone: stats.toursDone,
        toursUpcoming: stats.toursUpcoming,
        score,
        payment,
        // Activity in the period: at least one tour, a review, or a bonus.
        active: myAsns.length > 0 || score.reviews.length > 0 || bonus.total > 0,
      };
    }).sort((a, b) => b.earnings - a.earnings || a.name.localeCompare(b.name));
  }, [guides, statusFilteredAssignments, todayStr, bonusByGuide, scoreByGuide, paymentSummaryByGuide]);

  const activeGuideStats = useMemo(() => guideStats.filter(g => g.active), [guideStats]);
  const inactiveGuideStats = useMemo(() => guideStats.filter(g => !g.active), [guideStats]);

  // Header totals are the SUM of the per-guide figures, so they always equal the cards. A tour
  // with no guide_id belongs to no card and is reported in the footnote instead.
  const totalTours = useMemo(() => guideStats.reduce((sum, g) => sum + g.tours, 0), [guideStats]);
  const totalTourEarnings = useMemo(() => guideStats.reduce((sum, g) => sum + g.tourEarnings, 0), [guideStats]);
  const totalEarnings = useMemo(() => guideStats.reduce((sum, g) => sum + g.earnings, 0), [guideStats]);
  const totalPaid = useMemo(() => guideStats.reduce((sum, g) => sum + g.paid, 0), [guideStats]);
  const totalPending = useMemo(() => guideStats.reduce((sum, g) => sum + g.pending, 0), [guideStats]);
  const unattributedInRangeCount = useMemo(
    () => statusFilteredAssignments.filter(a => !a.guide_id).length,
    [statusFilteredAssignments]
  );

  // Dev-only regression guard: header Total Tours must equal the guide-attributed rows directly.
  if (import.meta.env.DEV) {
    const independentTotal = statusFilteredAssignments.filter(a => !!a.guide_id && guides.some(g => g.id === a.guide_id)).length;
    console.assert(
      independentTotal === totalTours,
      '[GuideDashboard] Total Tours header does not equal the sum of per-guide cards',
      { adminFilter, statusFilter, totalTours, independentTotal }
    );
  }

  // Table view sorting.
  type SortKey = 'name' | 'toursDone' | 'toursUpcoming' | 'earnings' | 'paid' | 'pending' | 'score';
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'earnings', dir: 'desc' });
  const sortedTableRows = useMemo(() => {
    const rows = showInactive ? guideStats : activeGuideStats;
    const val = (g: typeof guideStats[number]) => sort.key === 'name' ? g.name.toLowerCase()
      : sort.key === 'score' ? (g.score.combined ?? -1) : g[sort.key];
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [guideStats, activeGuideStats, showInactive, sort]);
  const toggleSort = (key: SortKey) => setSort(prev => prev.key === key
    ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'name' ? 'asc' : 'desc' });

  // Invoice PDF for the selected period — tours (date-filtered, all statuses) + month-end bonuses.
  const downloadInvoiceFor = async (g: any) => {
    const ok = await downloadGuideInvoice({
      guide: g,
      assignments: filteredAssignments,
      monthlyRows,
      bounds,
      periodLabel: adminFilterLabel,
      companyName: profile?.company_name,
    });
    if (!ok) alert(`Nothing to invoice for ${g.name} in ${adminFilterLabel}.`);
  };

  // Month-end bonus (owner-only write to that guide's guide_monthly row for that month).
  const [bonusModal, setBonusModal] = useState<{ guideId: string; month: string } | null>(null);
  const monthlyRowFor = (guideId: string, month: string) => monthlyRows.find(m => m.guide_id === guideId && m.month === month) || null;
  const defaultBonusMonth = (adminFilter.mode === 'month' || adminFilter.mode === 'thisMonth' || adminFilter.mode === 'lastMonth')
    ? bounds.start.slice(0, 7) : todayStr.slice(0, 7);
  const handleSaveBonus = async (month: string, amount: number | null, note: string | null): Promise<string | null> => {
    if (!user || !bonusModal) return 'Not signed in';
    const guide = guides.find(g => g.id === bonusModal.guideId);
    const existing = monthlyRowFor(bonusModal.guideId, month);
    const { error } = await saveMonthEndBonus(supabase, user.id, {
      guideId: bonusModal.guideId, guideName: guide?.name || 'Guide', month, amount, note,
      existing: existing ? { id: existing.id, bonus: existing.bonus, bonus_note: existing.bonus_note } : null,
    });
    if (error) {
      return isMissingBonusColumnError({ message: error })
        ? 'The bonus columns are not in the database yet — run the guide_monthly bonus migration in Supabase first.'
        : error;
    }
    await refreshMonthly();
    return null;
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

        <PendingReviewsQueue
          reviews={pendingReviews}
          guides={guides}
          onApprove={handleApproveReview}
          onReject={handleRejectReview}
        />

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
        ) : detailGuide ? (
          (() => {
            const g = guideStats.find(x => x.id === detailGuide.id)!;
            return (
              <GuideDetailView
                guide={detailGuide}
                periodLabel={`${adminFilterLabel}${statusFilter !== 'all' ? ` · ${statusFilterLabel}` : ''}`}
                todayStr={todayStr}
                stats={{
                  toursDone: g.toursDone, toursUpcoming: g.toursUpcoming, earned: g.earnings, paid: g.paid, pending: g.pending,
                  bonus: g.bonus, combined: g.score.combined, reviewScore: g.score.reviewScore, reviewCount: g.score.reviewCount,
                  bookings: g.score.bookings, onTimeCount: g.score.onTimeCount, countedArrivals: g.score.countedArrivals,
                }}
                assignments={detailGuideAssignments}
                reviews={g.score.reviews}
                scoreTrend={detailScoreTrend}
                monthlyRows={detailGuideMonthly}
                bonuses={detailGuideBonuses}
                paymentSummary={detailGuidePaymentSummary}
                onBack={closeDetail}
                onAddBonus={() => setBonusModal({ guideId: detailGuide.id, month: defaultBonusMonth })}
                onEditBonus={(month) => setBonusModal({ guideId: detailGuide.id, month })}
                onDownloadInvoice={() => downloadInvoiceFor(detailGuide)}
                onManageReviews={() => openReviewsModal(detailGuide.id)}
                onUpdatePayment={handleUpdatePayment}
              />
            );
          })()
        ) : (
          <div className="space-y-6">
            {/* SUMMARY STRIP */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total tours', hint: 'tours worked', value: String(totalTours), icon: Activity, cls: '' },
                { label: 'Total earnings', hint: 'earned, incl. bonuses', value: fmtEur(totalEarnings), icon: Euro, cls: 'text-gold' },
                { label: 'Avg / tour', hint: 'tour pay only', value: fmtEur(totalTours > 0 ? totalTourEarnings / totalTours : 0), icon: BarChart2, cls: '' },
                { label: 'You owe (pending)', hint: 'still to pay out', value: fmtEur(totalPending), icon: Wallet, cls: 'text-amber-700' },
                { label: 'Paid', hint: 'already paid out', value: fmtEur(totalPaid), icon: CheckCircle2, cls: 'text-green-700' },
                { label: 'Active guides', hint: 'with activity this period', value: String(activeGuideStats.length), icon: Users, cls: '' },
              ].map(k => (
                <div key={k.label} className={`aurelia-card p-4 ${k.label.startsWith('You owe') ? 'border-l-[3px] border-l-amber-500' : ''}`}>
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                    <k.icon size={13} />
                    <span className="text-[10px] font-bold uppercase tracking-wide">{k.label}</span>
                  </div>
                  <div className={`text-2xl font-bold tracking-tight tabular-nums ${k.cls}`}>{k.value}</div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{k.hint}</p>
                </div>
              ))}
            </div>

            {(unattributedInRangeCount > 0 || virtualOverviewRows.length > 0) && (
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 -mt-2">
                <Info size={12} className="shrink-0 mt-0.5" />
                <span>
                  Not counted on any guide:{' '}
                  {[
                    unattributedInRangeCount > 0 ? `${unattributedInRangeCount} tour${unattributedInRangeCount !== 1 ? 's' : ''} with no guide assigned` : null,
                    virtualOverviewRows.length > 0 ? `imported invoices for ${virtualOverviewRows.length} name${virtualOverviewRows.length !== 1 ? 's' : ''} with no guide profile (see Table view)` : null,
                  ].filter(Boolean).join(' · ')}.
                </span>
              </p>
            )}

            {/* VIEW TOGGLE */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-bold tracking-tight">Guides · {adminFilterLabel}</h2>
              <div className="flex gap-1 bg-muted/60 p-1 rounded-xl border border-border">
                {([['cards', 'Cards', LayoutGrid], ['table', 'Table', TableIcon]] as const).map(([mode, label, Icon]) => (
                  <button key={mode} onClick={() => setViewMode(mode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide ${viewMode === mode ? 'bg-card text-gold shadow-[var(--card-shadow)]' : 'text-muted-foreground'}`}>
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
            </div>

            {activeGuideStats.length === 0 && !showInactive && (
              <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-2xl bg-muted/40">
                <p className="text-sm font-semibold text-foreground">No guide activity in {adminFilterLabel}{statusFilter !== 'all' ? ` (${statusFilterLabel})` : ''}</p>
                <p className="text-xs text-muted-foreground mt-1">Try a wider period or a different status.</p>
              </div>
            )}

            {viewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {(showInactive ? guideStats : activeGuideStats).map(g => {
                  const paidPct = g.earnings > 0 ? Math.min(100, (g.paid / g.earnings) * 100) : 0;
                  return (
                    <div key={g.id} className={`aurelia-card p-5 border border-border hover:border-gold/30 hover:shadow-[var(--card-shadow-hover)] transition-all flex flex-col ${g.active ? '' : 'opacity-70'}`}>
                      <button onClick={() => setDetailGuideId(g.id)} className="text-left flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-base text-foreground break-words leading-snug">{g.name}</div>
                            {g.guide_number && <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-0.5">{g.guide_number}</div>}
                          </div>
                          <GuideScorePill combined={g.score.combined} reviewCount={g.score.reviewCount} />
                        </div>
                        <div className="mt-4">
                          <div className="text-3xl font-bold tracking-tight text-gold tabular-nums">{fmtEur(g.earnings)}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {g.toursDone} tour{g.toursDone !== 1 ? 's' : ''} done{g.toursUpcoming > 0 ? ` · ${g.toursUpcoming} upcoming` : ''}
                            {g.bonus > 0 ? ` · incl. ${fmtEur(g.bonus)} bonus` : ''}
                          </div>
                        </div>
                        <div className="mt-4">
                          <div className="h-2 rounded-full bg-amber-500/25 overflow-hidden">
                            <div className="h-full bg-green-600" style={{ width: `${paidPct}%` }} />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1.5">
                            <span className="text-green-700 font-semibold">{fmtEur(g.paid)} paid</span> · <span className="text-amber-700 font-semibold">{fmtEur(g.pending)} pending</span>
                          </p>
                        </div>
                      </button>
                      <div className="grid grid-cols-3 gap-2 mt-5">
                        {[
                          { label: 'Reviews', icon: Star, onClick: () => openReviewsModal(g.id) },
                          { label: 'Details', icon: Activity, onClick: () => setDetailGuideId(g.id) },
                          { label: 'Invoice', icon: FileText, onClick: () => downloadInvoiceFor(g) },
                        ].map(btn => (
                          <button key={btn.label} onClick={btn.onClick}
                            className="py-2.5 bg-muted border border-border rounded-xl text-[10px] font-bold uppercase tracking-widest hover:border-gold/30 transition-all flex items-center justify-center gap-1.5">
                            <btn.icon size={13} className="text-muted-foreground" /> {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="aurelia-card border border-border overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[820px]">
                  <thead className="bg-muted text-[11px] text-muted-foreground uppercase tracking-widest font-bold">
                    <tr>
                      {([
                        ['name', 'Guide', 'text-left'], ['toursDone', 'Tours done', 'text-right'], ['toursUpcoming', 'Upcoming', 'text-right'],
                        ['earnings', 'Earned', 'text-right'], ['paid', 'Paid', 'text-right'], ['pending', 'Pending', 'text-right'], ['score', 'Score', 'text-right'],
                      ] as const).map(([key, label, align]) => (
                        <th key={key} className={`px-4 py-3 ${align}`}>
                          <button onClick={() => toggleSort(key)} className={`inline-flex items-center gap-1 uppercase tracking-widest hover:text-foreground ${sort.key === key ? 'text-foreground' : ''}`}>
                            {label}
                            {sort.key === key ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={11} className="opacity-40" />}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedTableRows.map(g => (
                      <tr key={g.id} onClick={() => setDetailGuideId(g.id)} className={`hover:bg-muted transition-colors cursor-pointer ${g.active ? '' : 'opacity-60'}`}>
                        <td className="px-4 py-3">
                          <div className="font-bold">{g.name}</div>
                          {g.guide_number && <div className="text-[10px] text-muted-foreground font-mono">{g.guide_number}</div>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{g.toursDone}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-blue-700">{g.toursUpcoming}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold">{fmtEur(g.earnings)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-green-700">{fmtEur(g.paid)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700">{fmtEur(g.pending)}</td>
                        <td className="px-4 py-3 text-right"><GuideScorePill combined={g.score.combined} reviewCount={g.score.reviewCount} /></td>
                      </tr>
                    ))}
                    {virtualOverviewRows.map(row => (
                      <tr key={row.id} onClick={() => setDetailVirtualName(row.name)} className="hover:bg-muted transition-colors cursor-pointer text-muted-foreground">
                        <td className="px-4 py-3">
                          <div className="font-bold flex items-center gap-2">
                            {row.name}
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-muted border border-border" title="Imported invoice history with no linked guide profile">Unlinked</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.toursDone}</td>
                        <td className="px-4 py-3 text-right tabular-nums">—</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtEur(row.totalEarned)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtEur(row.paidAmount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtEur(row.pendingAmount)}</td>
                        <td className="px-4 py-3 text-right">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {inactiveGuideStats.length > 0 && (
              <button onClick={() => setShowInactive(v => !v)} className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2">
                {showInactive
                  ? `Hide ${inactiveGuideStats.length} guide${inactiveGuideStats.length !== 1 ? 's' : ''} with no activity this period`
                  : `${inactiveGuideStats.length} guide${inactiveGuideStats.length !== 1 ? 's' : ''} with no activity this period — Show`}
              </button>
            )}
          </div>
        )}

        {bonusModal && (
          <AddBonusModal
            guideName={guides.find(g => g.id === bonusModal.guideId)?.name || 'Guide'}
            defaultMonth={bonusModal.month}
            existingFor={(month) => {
              const row = monthlyRowFor(bonusModal.guideId, month);
              return row ? { bonus: row.bonus ?? null, bonus_note: row.bonus_note ?? null } : null;
            }}
            onSave={handleSaveBonus}
            onClose={() => setBonusModal(null)}
          />
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
