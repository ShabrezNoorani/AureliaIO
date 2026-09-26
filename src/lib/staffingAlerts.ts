// Pure capacity/staffing-alert logic — no I/O, so it's independently testable. Used by
// DispatchPage/TodayToursPage (per-session red flag) and LiveDashboardPage (the "Staffing
// alerts" next-5-days overview), so the definition of "this session needs another guide" is
// computed exactly once and can never drift between those three surfaces.

import { isCancelled, shortProductCode } from './utils';

export interface SessionCapacityInput {
  maxPaxPerGuide: number | null;
  needsGuide: boolean;
  assignedGuideCount: number;
  totalPax: number;
}

export interface SessionCapacityResult {
  /** assignedGuideCount * maxPaxPerGuide — null when no limit is set (no capacity ceiling at all). */
  capacity: number | null;
  isFlagged: boolean;
  /** Human-readable reason(s) — both can apply at once (over capacity AND manually flagged). */
  reasons: string[];
}

// capacity = (assigned guides) × max pax/guide. A session with a limit set but ZERO guides
// assigned has a capacity of 0 — any pax at all correctly flags it red, which is the intended
// "needs a guide" signal, not an edge-case bug. A session with no limit set (maxPaxPerGuide null)
// can only ever be flagged via the manual needs_guide toggle.
export function computeSessionCapacity({
  maxPaxPerGuide, needsGuide, assignedGuideCount, totalPax,
}: SessionCapacityInput): SessionCapacityResult {
  const capacity = maxPaxPerGuide != null ? assignedGuideCount * maxPaxPerGuide : null;
  const overCapacity = capacity !== null && totalPax > capacity;

  const reasons: string[] = [];
  if (overCapacity) reasons.push(`over capacity: ${totalPax} pax / ${capacity} cap`);
  if (needsGuide) reasons.push('manually flagged');

  return { capacity, isFlagged: reasons.length > 0, reasons };
}

export interface StaffingAlertSessionInput {
  id: string;
  tour_date: string;
  label: string | null;
  start_time: string | null;
  max_pax_per_guide: number | null;
  needs_guide: boolean;
}

export interface StaffingAlertBookingInput {
  booking_ref: string;
  pax_adult: number | null;
  pax_youth: number | null;
  pax_child: number | null;
  pax_infant: number | null;
  status: string | null;
  option_name: string | null;
  product_code: string | null;
}

export interface StaffingAlert {
  sessionId: string;
  tourDate: string;
  /** "{short product code} — {option name}", falling back to the session's own label when no
   *  booking is linked yet to derive a code/option from. */
  label: string;
  startTime: string | null;
  guideCount: number;
  totalPax: number;
  capacity: number | null;
  reasons: string[];
}

const paxTotal = (b: StaffingAlertBookingInput): number =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);

/**
 * Builds the "Staffing alerts" list: every session in `sessions` that is flagged (over capacity
 * or manually needs_guide), sorted by tour_date then start_time — the caller is responsible for
 * only passing in sessions within whatever date window it cares about (e.g. today..+5 days).
 * Cancelled bookings never count toward a session's pax total, same as every other pax
 * computation in the app.
 */
export function buildStaffingAlerts(
  sessions: StaffingAlertSessionInput[],
  sessionBookings: { session_id: string; booking_ref: string }[],
  sessionGuides: { session_id: string; guide_id: string; status: string }[],
  bookings: StaffingAlertBookingInput[]
): StaffingAlert[] {
  const bookingByRef = new Map(bookings.map((b) => [b.booking_ref, b]));

  const paxBySession = new Map<string, number>();
  const optionBySession = new Map<string, { code: string; option: string }>();
  sessionBookings.forEach((sb) => {
    const b = bookingByRef.get(sb.booking_ref);
    if (!b) return;
    if (!optionBySession.has(sb.session_id)) {
      optionBySession.set(sb.session_id, { code: shortProductCode(b.product_code) || 'Unknown', option: b.option_name || 'Standard' });
    }
    if (isCancelled(b.status)) return;
    paxBySession.set(sb.session_id, (paxBySession.get(sb.session_id) || 0) + paxTotal(b));
  });

  const guideCountBySession = new Map<string, number>();
  sessionGuides.forEach((sg) => {
    if (sg.status !== 'accepted') return;
    guideCountBySession.set(sg.session_id, (guideCountBySession.get(sg.session_id) || 0) + 1);
  });

  const alerts: StaffingAlert[] = [];
  sessions.forEach((s) => {
    const totalPax = paxBySession.get(s.id) || 0;
    const guideCount = guideCountBySession.get(s.id) || 0;
    const { capacity, isFlagged, reasons } = computeSessionCapacity({
      maxPaxPerGuide: s.max_pax_per_guide,
      needsGuide: s.needs_guide,
      assignedGuideCount: guideCount,
      totalPax,
    });
    if (!isFlagged) return;

    const opt = optionBySession.get(s.id);
    const label = opt ? `${opt.code} — ${opt.option}` : (s.label || 'Untitled Session');
    alerts.push({ sessionId: s.id, tourDate: s.tour_date, label, startTime: s.start_time, guideCount, totalPax, capacity, reasons });
  });

  return alerts.sort((a, b) => {
    const d = a.tourDate.localeCompare(b.tourDate);
    if (d !== 0) return d;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
}
