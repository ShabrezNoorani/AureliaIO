// Pure, client-side link builders for confirming a guide's tour — no network calls, no state.

const pad2 = (n: number): string => String(n).padStart(2, '0');

const toGoogleDateUtc = (date: Date): string =>
  `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
  `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;

// tour_sessions.start_time is free text (normally "HH:MM" 24h, optionally with an AM/PM suffix).
// Anything that doesn't match falls back to a 2-hour block starting at 9:00 local time.
const deriveSessionStart = (tourDate: string, startTime?: string | null): Date => {
  const start = new Date(`${tourDate}T00:00:00`);
  let hours = 9;
  let minutes = 0;

  const match = startTime?.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const ampm = match[3]?.toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      hours = h;
      minutes = m;
    }
  }

  start.setHours(hours, minutes, 0, 0);
  return start;
};

export interface GoogleCalendarEventInput {
  title: string;
  details?: string;
  location?: string;
  /** YYYY-MM-DD */
  tourDate: string;
  /** Free-text session start time; falls back to 9:00 local if unparsable. */
  startTime?: string | null;
}

export function buildGoogleCalendarUrl({ title, details, location, tourDate, startTime }: GoogleCalendarEventInput): string {
  const start = deriveSessionStart(tourDate, startTime);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', title);
  params.set('dates', `${toGoogleDateUtc(start)}/${toGoogleDateUtc(end)}`);
  if (details) params.set('details', details);
  if (location) params.set('location', location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
