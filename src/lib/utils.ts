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

// bookings.product_code comes in two shapes depending on source: older gsheet rows store just the
// short OTA code ("P13"), newer bokun_email rows store it prefixed with the numeric Bokun product
// id ("5591586P13"). Always display the trailing short code — never the raw column value or
// product_name — so the two sources read identically everywhere a product code is shown.
export function shortProductCode(code: string | null | undefined): string {
  if (!code) return '';
  const match = code.match(/([PG]\d+)$/i);
  return match ? match[1].toUpperCase() : code;
}
