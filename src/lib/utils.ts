import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Local calendar date as YYYY-MM-DD. Unlike `d.toISOString().split('T')[0]` (which converts to
// UTC first), this reads the date the way the user's own clock shows it — use this anywhere a
// date-only value (travel_date, a date picker, "today") needs to match what's on screen. Never
// use this for timestamptz columns (checked_in_at, created_at, etc.) — those genuinely want UTC.
export const localDateStr = (d: Date = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export type DatePresetKey = 'today' | 'yesterday' | 'tomorrow' | 'thisWeek' | 'thisMonth';

export interface InclusiveDateRange {
  /** Inclusive YYYY-MM-DD bounds. */
  start: string;
  end: string;
}

/** Inclusive YYYY-MM-DD bounds for a named relative-date preset (used by the Ledger filter bar's
    date presets), anchored to `now` (defaults to the real current moment). Always computed from
    the LOCAL calendar day via localDateStr — never `new Date().toISOString()`, which would shift
    by a day near midnight in timezones ahead of UTC. "This week" is Monday-to-Sunday of the week
    containing `now`; "this month" is the 1st to the last day of `now`'s calendar month. */
export function datePresetRange(preset: DatePresetKey, now: Date = new Date()): InclusiveDateRange {
  switch (preset) {
    case 'today': {
      const s = localDateStr(now);
      return { start: s, end: s };
    }
    case 'yesterday': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      const s = localDateStr(d);
      return { start: s, end: s };
    }
    case 'tomorrow': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      const s = localDateStr(d);
      return { start: s, end: s };
    }
    case 'thisWeek': {
      const dow = now.getDay(); // 0=Sun..6=Sat
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(now);
      monday.setDate(monday.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { start: localDateStr(monday), end: localDateStr(sunday) };
    }
    case 'thisMonth': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: localDateStr(first), end: localDateStr(last) };
    }
  }
}

// The ONE definition of "is this booking cancelled?" — bookings.status only ever stores the bare
// "CANCELLED" value now (the old CANCELLED_EARLY/CANCELLED_LATE split was normalized away at the
// DB level), matched case-insensitively so a stray lowercase value can't silently slip through.
// startsWith (not an exact match) stays defensive against any not-yet-normalized legacy row
// still carrying "CANCELLED_EARLY"/"CANCELLED_LATE" — functionally identical to an exact match
// for the bare value, zero behavior difference either way. Use this everywhere the app asks "is
// this cancelled?" — never compare a status string directly.
export function isCancelled(status: string | null | undefined): boolean {
  return !!status && status.toUpperCase().startsWith('CANCELLED');
}

// The standard guide check-in point — 15 minutes before a tour's start_time. Pure string/integer
// math on "HH:MM" (never a Date), so it's immune to any timezone/DST edge case a Date-based
// subtraction could introduce. Clamps at 00:00 rather than wrapping to the previous day for a
// tour scheduled before 00:15 — an edge case that shouldn't occur in practice, but a wrapped
// negative time would be a more confusing failure than a clamp. Reused everywhere a tour time is
// shown (guide tour cards, session headers) so "check-in = tour − 15 min" is defined exactly once.
export function checkinTime(startTime: string | null | undefined): string | null {
  if (!startTime) return null;
  const match = startTime.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const totalMinutes = Math.max(0, Number(match[1]) * 60 + Number(match[2]) - 15);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Normalizes any reasonably-shaped time string — "9:00:00 AM", "9 AM", "9:00", "09:00", "16:30:00"
// — to a strict 24-hour "HH:MM" string. This is the ONE place time values get parsed on their way
// into travel_time/start_time/checkin_time, so a 12-hour-formatted source (a sheet, an API, a CSV)
// can never reintroduce a non-"HH:MM" value into columns that grouping/merging/auto-populate all
// key off. Returns null for anything unparseable (a blank cell, "No Time", "TBD") — callers decide
// the fallback; this never guesses.
export function normalizeTime(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) return null;

  let h = Number(match[1]);
  const m = match[2] !== undefined ? Number(match[2]) : 0;
  const ampm = match[3]?.toLowerCase();

  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  // No AM/PM suffix and hour > 23 isn't a valid 24h time at all (e.g. garbage like "99:00").
  if (!ampm && h > 23) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// bookings.product_code comes in two shapes depending on source: older gsheet rows store just the
// short OTA code ("P13"), newer bokun_email rows store it prefixed with the numeric Bokun product
// id ("5591586P13"). Always display the trailing short code — never the raw column value or
// product_name — so the two sources read identically everywhere a product code is shown.
export function shortProductCode(code: string | null | undefined): string {
  if (!code) return '';
  const match = code.match(/([PG]\d+)$/i);
  return match ? match[1].toUpperCase() : code;
}
