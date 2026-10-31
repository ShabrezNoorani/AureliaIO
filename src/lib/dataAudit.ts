// Owner "Health Check" — pure, EXACT consistency checks over data the owner already has. No I/O
// and no AI here: every finding is produced by a deterministic comparison, and the P&L / Ledger /
// capacity figures come from the SAME library functions those pages use (groupBookingsByPeriod,
// attributeSessionGuideCostByBooking, computeSessionCapacity), so a finding can never disagree
// with what the owner sees on those pages. The AI (ai-insights Edge Function, kind 'audit') only
// ever receives a summary of these findings to word them; it never detects anything.

import { isCancelled } from './utils';
import {
  filterPnlBookings, groupBookingsByPeriod, uniqueChannelsFrom, statusBucket, PNL_STATUS_BUCKETS,
} from './monthlyPnl';
import { attributeSessionGuideCostByBooking, ADMIN_DEFAULT_FILTER_START } from './guidePerformance';
import { computeSessionCapacity } from './staffingAlerts';

// ── INPUT SHAPES (read-only rows) ────────────────────────────────────────────────────────────

export interface AuditBooking {
  booking_ref: string | null;
  travel_date: string | null;
  booking_date: string | null;
  status: string | null;
  channel: string | null;
  product_name: string | null;
  option_name: string | null;
  assigned_guide: string | null;
  gross_revenue: number | null;
  ticket_cost: number | null;
  guide_cost: number | null;
  extra_cost: number | null;
  gyg_cost: number | null;
  commission_amount: number | null;
  marketplace_fee: number | null;
  pax_adult: number | null;
  pax_youth: number | null;
  pax_child: number | null;
  pax_infant: number | null;
}
export interface AuditSession {
  id: string; tour_date: string; label: string | null; start_time: string | null;
  max_pax_per_guide: number | null; needs_guide: boolean | null;
}
export interface AuditSessionBooking { session_id: string; booking_ref: string; allotted_guide_id: string | null }
export interface AuditSessionGuide { session_id: string; guide_id: string; status: string; base_pay: number | null; bonus: number | null }
export interface AuditCheckin { booking_ref: string; status: string | null; travel_date: string | null }
export interface AuditReview { id: string; guide_id: string; review_date: string; stars: number; approval_status: string | null; reviewer_name: string | null }
export interface AuditGuideAssignment { guide_id: string | null; travel_date: string | null }
export interface AuditGuide { id: string; name: string }

export interface AuditInput {
  bookings: AuditBooking[];
  sessions: AuditSession[];
  sessionBookings: AuditSessionBooking[];
  sessionGuides: AuditSessionGuide[];
  checkins: AuditCheckin[];
  reviews: AuditReview[];
  guideAssignments: AuditGuideAssignment[];
  guides: AuditGuide[];
}

// ── OUTPUT ───────────────────────────────────────────────────────────────────────────────────

export type AuditType =
  | 'pnl_ledger_mismatch' | 'session_needs_guide' | 'over_capacity' | 'mixed_private_group'
  | 'review_no_tour' | 'missing_data' | 'past_unresolved' | 'other';

/** Where the owner fixes it — an AppLayout view id (+ URL path for the path-routed views). */
export interface AuditFixTarget { view: 'ledger' | 'breakdown-pnl' | 'dispatch' | 'guide-dashboard' | 'today'; path?: string; label: string }

export interface AuditFinding {
  type: AuditType;
  /** Stable id for React keys. */
  id: string;
  date: string | null;
  /** Code-generated, specific: names the record/session/date and the exact numbers. */
  detail: string;
  fix: AuditFixTarget;
}

export const AUDIT_TYPE_ORDER: AuditType[] = [
  'pnl_ledger_mismatch', 'session_needs_guide', 'over_capacity', 'mixed_private_group',
  'review_no_tour', 'missing_data', 'past_unresolved', 'other',
];

export const AUDIT_TYPE_TITLES: Record<AuditType, string> = {
  pnl_ledger_mismatch: 'Breakdown P&L vs Financial Ledger',
  session_needs_guide: 'Sessions needing a guide',
  over_capacity: 'Over the pax limit',
  mixed_private_group: 'Private and group guests mixed',
  review_no_tour: 'Reviews with no matching tour',
  missing_data: 'Bookings missing data',
  past_unresolved: 'Past tours still UPCOMING',
  other: 'Other inconsistencies',
};

const FIX = {
  ledger: { view: 'ledger', label: 'Financial Ledger' },
  pnl: { view: 'breakdown-pnl', path: '/app/breakdown-pnl', label: 'Breakdown P&L (Day view)' },
  dispatch: { view: 'dispatch', path: '/app/dispatch', label: 'Dispatch' },
  reviews: { view: 'guide-dashboard', path: '/app/guide-dashboard', label: 'Guide Dashboard → reviews' },
  today: { view: 'today', label: "Today's Tours" },
} satisfies Record<string, AuditFixTarget>;

// ── HELPERS ──────────────────────────────────────────────────────────────────────────────────

const EPS = 0.005;
const day = (d: string | null) => (d ? d.slice(0, 10) : null);
const money = (n: number) => `€${n.toFixed(2)}`;
const pax = (b: AuditBooking) =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);
const PRIVATE_RE = /\b(private|privat|privé|privée|privado|privada|privato|privata)\b/i;
export const isPrivateBooking = (b: Pick<AuditBooking, 'option_name' | 'product_name'>) =>
  PRIVATE_RE.test(b.option_name || '') || PRIVATE_RE.test(b.product_name || '');
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const sessionName = (s: AuditSession) => `${s.label || 'Untitled session'} (${s.tour_date}${s.start_time ? ` ${s.start_time.slice(0, 5)}` : ''})`;

/** Review-to-tour matching window: a tour on or up to this many days before the review date
    (plus one day after, for timezone slop) counts as "the tour this review is about". */
export const REVIEW_MATCH_WINDOW_DAYS = 60;

// ── THE AUDIT ────────────────────────────────────────────────────────────────────────────────

export function runDataAudit(input: AuditInput, today: string): AuditFinding[] {
  const { bookings, sessions, sessionBookings, sessionGuides, checkins, reviews, guideAssignments, guides } = input;
  const out: AuditFinding[] = [];
  const push = (f: Omit<AuditFinding, 'id'>) => out.push({ ...f, id: `${f.type}:${out.length}` });

  const bookingByRef = new Map<string, AuditBooking>();
  bookings.forEach(b => { if (b.booking_ref) bookingByRef.set(b.booking_ref, b); });
  const sessionById = new Map(sessions.map(s => [s.id, s]));
  const guideName = new Map(guides.map(g => [g.id, g.name]));
  const sessionsByRef = new Map<string, string[]>();
  sessionBookings.forEach(sb => {
    const arr = sessionsByRef.get(sb.booking_ref) || [];
    arr.push(sb.session_id);
    sessionsByRef.set(sb.booking_ref, arr);
  });
  const refsBySession = new Map<string, string[]>();
  sessionBookings.forEach(sb => {
    const arr = refsBySession.get(sb.session_id) || [];
    arr.push(sb.booking_ref);
    refsBySession.set(sb.session_id, arr);
  });
  const acceptedGuidesBySession = new Map<string, string[]>();
  sessionGuides.forEach(sg => {
    if (sg.status !== 'accepted') return;
    const arr = acceptedGuidesBySession.get(sg.session_id) || [];
    arr.push(sg.guide_id);
    acceptedGuidesBySession.set(sg.session_id, arr);
  });
  const checkinByRef = new Map(checkins.map(c => [c.booking_ref, c]));

  // ── 1. BREAKDOWN P&L vs FINANCIAL LEDGER, per travel day ──
  // P&L side: exactly what Breakdown P&L shows with every status/channel selected, Day view.
  const pnlRows = groupBookingsByPeriod(
    filterPnlBookings(bookings, {
      dateField: 'travel', range: { start: null, end: null },
      statuses: new Set(PNL_STATUS_BUCKETS), channels: new Set(uniqueChannelsFrom(bookings)),
    }),
    'travel', 'day',
    { sessionBookings, sessionGuides, sessions },
  );
  const pnlByDay = new Map(pnlRows.map(r => [r.key, r]));
  // Ledger side: the Ledger's own summary (LedgerPage `summary`/`liveNetProfit`) for a travel-date
  // filter of that single day. Ledger profit also subtracts commission + marketplace fee, which
  // Breakdown P&L's tour profit deliberately doesn't — they're added back here so only REAL
  // discrepancies are compared, never that known definitional difference.
  const sessionedRefs = new Set(sessionBookings.map(sb => sb.booking_ref));
  const attributed = attributeSessionGuideCostByBooking({ bookings, sessionBookings, sessionGuides });
  const ledgerByDay = new Map<string, { rev: number; profit: number }>();
  bookings.forEach(b => {
    const d = day(b.travel_date);
    if (!d) return;
    const gross = b.gross_revenue || 0;
    const guideCost = b.booking_ref && sessionedRefs.has(b.booking_ref) ? (attributed.get(b.booking_ref) || 0) : (b.guide_cost || 0);
    const profitBeforeFees = gross - (b.ticket_cost || 0) - (b.extra_cost || 0) - (b.gyg_cost || 0) - guideCost;
    const row = ledgerByDay.get(d) || { rev: 0, profit: 0 };
    row.rev += gross;
    row.profit += profitBeforeFees;
    ledgerByDay.set(d, row);
  });
  const allDays = new Set([...pnlByDay.keys(), ...ledgerByDay.keys()]);
  [...allDays].sort().reverse().forEach(d => {
    const p = pnlByDay.get(d);
    const l = ledgerByDay.get(d) || { rev: 0, profit: 0 };
    const pRev = p?.gross ?? 0;
    const pProfit = p?.tourProfit ?? 0;
    const revGap = l.rev - pRev;
    const profitGap = l.profit - pProfit;
    if (Math.abs(revGap) < EPS && Math.abs(profitGap) < EPS) return;

    const causes: string[] = [];
    const dayBookings = bookings.filter(b => day(b.travel_date) === d);
    const unknownStatus = dayBookings.filter(b => statusBucket(b.status) === null);
    if (unknownStatus.length) {
      causes.push(`${unknownStatus.length} booking(s) with an unrecognised status are in the Ledger but not the P&L (${unknownStatus.map(b => `${b.booking_ref} "${b.status ?? 'blank'}"`).slice(0, 5).join(', ')})`);
    }
    const dateMismatch = dayBookings.filter(b => b.booking_ref && (sessionsByRef.get(b.booking_ref) || []).some(sid => {
      const s = sessionById.get(sid);
      return s && s.tour_date !== d;
    }));
    if (dateMismatch.length) {
      causes.push(`${dateMismatch.length} booking(s) sit in a session dated a different day, so guide pay lands on different days (${dateMismatch.map(b => b.booking_ref).slice(0, 5).join(', ')})`);
    }
    const daySessions = sessions.filter(s => s.tour_date === d);
    const paidNoBookings = daySessions.filter(s => (acceptedGuidesBySession.get(s.id) || []).length > 0 && !(refsBySession.get(s.id) || []).length);
    if (paidNoBookings.length) {
      causes.push(`guide pay on ${paidNoBookings.length} session(s) with no bookings counts in the P&L only (${paidNoBookings.map(sessionName).slice(0, 3).join(', ')})`);
    }
    if (!p && daySessions.some(s => (acceptedGuidesBySession.get(s.id) || []).length > 0)) {
      causes.push('the P&L has no row for this day, so its session guide pay is not shown there');
    }
    push({
      type: 'pnl_ledger_mismatch', date: d,
      detail: `${d}: Ledger revenue ${money(l.rev)} vs P&L ${money(pRev)} (gap ${money(revGap)}); profit before commission Ledger ${money(l.profit)} vs P&L ${money(pProfit)} (gap ${money(profitGap)}). ${causes.length ? `Likely cause: ${causes.join('; ')}.` : 'Cause not identified automatically — open this day in both views.'}`,
      fix: FIX.pnl,
    });
  });

  // ── 2–4. SESSIONS (today + upcoming) ──
  const upcomingSessions = sessions.filter(s => s.tour_date >= today).sort((a, b) =>
    a.tour_date.localeCompare(b.tour_date) || (a.start_time || '').localeCompare(b.start_time || ''));
  upcomingSessions.forEach(s => {
    const live = (refsBySession.get(s.id) || []).map(r => bookingByRef.get(r)).filter((b): b is AuditBooking => !!b && !isCancelled(b.status));
    const totalPax = live.reduce((sum, b) => sum + pax(b), 0);
    const guideCount = (acceptedGuidesBySession.get(s.id) || []).length;

    if (live.length > 0 && guideCount === 0) {
      push({ type: 'session_needs_guide', date: s.tour_date, detail: `${sessionName(s)}: ${live.length} booking(s), ${totalPax} pax, no accepted guide.`, fix: FIX.dispatch });
    } else if (s.needs_guide && live.length > 0) {
      push({ type: 'session_needs_guide', date: s.tour_date, detail: `${sessionName(s)}: manually flagged "needs another guide" (${guideCount} guide(s), ${totalPax} pax).`, fix: FIX.dispatch });
    }

    if (guideCount > 0) {
      const { capacity } = computeSessionCapacity({ maxPaxPerGuide: s.max_pax_per_guide, needsGuide: false, assignedGuideCount: guideCount, totalPax });
      if (capacity !== null && totalPax > capacity) {
        push({ type: 'over_capacity', date: s.tour_date, detail: `${sessionName(s)}: ${totalPax} pax but ${guideCount} guide(s) × ${s.max_pax_per_guide} max = ${capacity}. Over by ${totalPax - capacity}.`, fix: FIX.dispatch });
      }
    }

    const priv = live.filter(isPrivateBooking);
    const group = live.filter(b => !isPrivateBooking(b));
    if (priv.length > 0 && (group.length > 0 || priv.length > 1)) {
      push({
        type: 'mixed_private_group', date: s.tour_date,
        detail: `${sessionName(s)}: ${priv.length} private booking(s) (${priv.map(b => `${b.booking_ref} "${b.option_name || b.product_name}"`).slice(0, 3).join(', ')})${group.length ? ` together with ${group.length} group booking(s)` : ' sharing one session'}.`,
        fix: FIX.dispatch,
      });
    }
  });

  // ── 5. REVIEWS WITH NO MATCHING TOUR ──
  // A guide "had a tour" on a date if a checked-in booking on that date is on a session they were
  // accepted on (or allotted to), or a legacy guide_assignments row exists for them on that date.
  const tourDatesByGuide = new Map<string, Set<string>>();
  const addTour = (g: string | null, d: string | null) => {
    if (!g || !d) return;
    const set = tourDatesByGuide.get(g) || new Set<string>();
    set.add(d.slice(0, 10));
    tourDatesByGuide.set(g, set);
  };
  sessionBookings.forEach(sb => {
    const c = checkinByRef.get(sb.booking_ref);
    if (c?.status !== 'checked_in') return;
    const d = day(bookingByRef.get(sb.booking_ref)?.travel_date ?? null) ?? day(c.travel_date) ?? sessionById.get(sb.session_id)?.tour_date ?? null;
    addTour(sb.allotted_guide_id, d);
    (acceptedGuidesBySession.get(sb.session_id) || []).forEach(g => addTour(g, d));
  });
  guideAssignments.forEach(a => addTour(a.guide_id, a.travel_date));
  reviews
    .filter(r => r.approval_status !== 'rejected' && r.review_date >= ADMIN_DEFAULT_FILTER_START)
    .sort((a, b) => b.review_date.localeCompare(a.review_date))
    .forEach(r => {
      const rd = r.review_date.slice(0, 10);
      const from = addDays(rd, -REVIEW_MATCH_WINDOW_DAYS);
      const to = addDays(rd, 1);
      const dates = tourDatesByGuide.get(r.guide_id);
      const matched = dates && [...dates].some(d => d >= from && d <= to);
      if (matched) return;
      push({
        type: 'review_no_tour', date: rd,
        detail: `${r.stars}★ review dated ${rd}${r.reviewer_name ? ` from "${r.reviewer_name}"` : ''} for ${guideName.get(r.guide_id) || 'an unknown guide'}: no checked-in tour for this guide in the ${REVIEW_MATCH_WINDOW_DAYS} days before it.`,
        fix: FIX.reviews,
      });
    });

  // ── 6. BOOKINGS MISSING DATA (non-cancelled) ──
  bookings.forEach(b => {
    if (isCancelled(b.status)) return;
    const d = day(b.travel_date);
    const missing: string[] = [];
    if (b.gross_revenue == null) missing.push('price');
    if (!b.option_name?.trim()) missing.push('option');
    // Guide: only actionable for TODAY or FUTURE tours (still assignable in Dispatch). Past
    // bookings are history and are never flagged for a missing guide. Price/option flag any date.
    if (d && d >= today && b.status !== 'NO_SHOW') {
      const sids = b.booking_ref ? sessionsByRef.get(b.booking_ref) || [] : [];
      const hasSessionGuide = sids.some(sid => (acceptedGuidesBySession.get(sid) || []).length > 0);
      if (!hasSessionGuide && !b.assigned_guide?.trim()) missing.push('guide');
    }
    if (missing.length) {
      push({ type: 'missing_data', date: d, detail: `${b.booking_ref || '(no ref)'} — ${b.product_name || 'unknown product'} on ${d || 'no date'}: missing ${missing.join(', ')}.`, fix: missing.includes('guide') && missing.length === 1 ? FIX.dispatch : FIX.ledger });
    }
  });

  // ── 7. PAST TOURS STILL UPCOMING ──
  bookings
    .filter(b => !isCancelled(b.status) && (b.status || '').toUpperCase() === 'UPCOMING' && day(b.travel_date) && day(b.travel_date)! < today)
    .sort((a, b) => (b.travel_date || '').localeCompare(a.travel_date || ''))
    .forEach(b => push({ type: 'past_unresolved', date: day(b.travel_date), detail: `${b.booking_ref || '(no ref)'} — ${b.product_name || 'unknown product'} on ${day(b.travel_date)} is still UPCOMING (not DONE or NO_SHOW).`, fix: FIX.ledger }));

  // ── 8. OTHER ──
  sessionBookings.forEach(sb => {
    if (checkinByRef.get(sb.booking_ref)?.status === 'checked_in' && !sb.allotted_guide_id) {
      const s = sessionById.get(sb.session_id);
      push({ type: 'other', date: s?.tour_date ?? null, detail: `${sb.booking_ref} is checked in on ${s ? sessionName(s) : 'a session'} but isn't allotted to any guide.`, fix: FIX.dispatch });
    }
  });
  bookings.forEach(b => {
    if (isCancelled(b.status) && (b.gross_revenue || 0) > 0) {
      push({ type: 'other', date: day(b.travel_date), detail: `${b.booking_ref} is CANCELLED but still shows ${money(b.gross_revenue || 0)} revenue (fine if it's a cancellation fee — otherwise correct it).`, fix: FIX.ledger });
    }
  });
  sessionsByRef.forEach((sids, ref) => {
    const unique = [...new Set(sids)];
    if (unique.length > 1) {
      push({ type: 'other', date: day(bookingByRef.get(ref)?.travel_date ?? null), detail: `${ref} is linked to ${unique.length} sessions at once (${unique.map(id => sessionById.get(id)).filter(Boolean).map(s => sessionName(s!)).join(', ')}).`, fix: FIX.dispatch });
    }
    const b = bookingByRef.get(ref);
    const bd = day(b?.travel_date ?? null);
    unique.forEach(sid => {
      const s = sessionById.get(sid);
      if (b && bd && s && s.tour_date !== bd && !isCancelled(b.status)) {
        push({ type: 'other', date: bd, detail: `${ref} travels on ${bd} but is in ${sessionName(s)} — dates don't match.`, fix: FIX.dispatch });
      }
    });
  });

  return out;
}

/** Small, name-free payload for the AI narrator: per-type counts + a few example lines with
    customer/reviewer names removed (refs, dates, products and amounts only). */
export function summarizeFindingsForAi(findings: AuditFinding[], examplesPerType = 3) {
  return AUDIT_TYPE_ORDER
    .map(type => {
      const items = findings.filter(f => f.type === type);
      return {
        type,
        title: AUDIT_TYPE_TITLES[type],
        count: items.length,
        examples: items.slice(0, examplesPerType).map(f => f.detail.replace(/ from "[^"]*"/g, '').slice(0, 250)),
      };
    })
    .filter(g => g.count > 0);
}
