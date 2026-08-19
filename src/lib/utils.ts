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
