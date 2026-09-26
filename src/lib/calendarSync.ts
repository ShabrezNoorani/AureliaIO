// Client for the Google Apps Script web app that puts a real event on the guide's calendar for an
// assigned tour session — the ONE place its URL + shared secret live, so nothing else in the app
// hardcodes them (per the "config/env constant, not scattered" requirement).
//
// SECURITY NOTE: this file ships inside the client bundle, so CALENDAR_SYNC_SECRET is NOT a real
// secret — anyone who opens devtools/view-source on the deployed app can read it. It only gates
// the Apps Script endpoint against random internet traffic, not against an authenticated user of
// this app (unlike e.g. the Bokun keys in lib/bokunProxy.ts, which stay server-side behind a
// Supabase Edge Function). If that boundary ever needs to be real, move this call behind a
// similar Edge Function that holds the secret server-side instead of shipping it to the browser.
export const CALENDAR_SYNC_URL =
  'https://script.google.com/macros/s/AKfycbxxrcyuxBl6fEAwtMRhlegWCs878Hgco0BYnP8KBGc3EoJLY9FMdWzd94ogbH0hnP5YYQ/exec';
const CALENDAR_SYNC_SECRET = 'sztcal2026x7k';

export type CalendarAttendeeResponse = 'accepted' | 'declined' | 'needsAction';

interface CalendarSyncCreateResponse { ok: true; eventId: string }
interface CalendarSyncUpdateResponse { ok: true; eventId: string }
interface CalendarSyncStatusResponse { ok: true; attendees: { email: string; response: CalendarAttendeeResponse }[] }
interface CalendarSyncErrorResponse { ok: false; error?: string }

async function callCalendarSync<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(CALENDAR_SYNC_URL, {
      method: 'POST',
      // text/plain (not application/json) avoids a CORS preflight — a JSON content-type would
      // trigger an OPTIONS request first, which Apps Script web apps can't answer. Apps Script's
      // doPost reads the raw body as JSON via e.postData.contents regardless of this header.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: CALENDAR_SYNC_SECRET, ...body }),
    });
  } catch {
    throw new Error('Could not reach the calendar service — check your connection and try again.');
  }
  if (!res.ok) throw new Error(`Calendar service returned an error (${res.status}).`);
  let data: (T & { ok: true }) | CalendarSyncErrorResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error('Calendar service returned an unexpected response.');
  }
  if (!data || data.ok !== true) {
    throw new Error(('error' in data && data.error) || 'Calendar service reported a failure.');
  }
  return data as T;
}

// Paris's UTC offset (in ms, positive) AT a given UTC instant — CET (+1h) or CEST (+2h) — read
// straight from the platform's IANA tz data via Intl, so the CET/CEST transition dates are always
// correct without a date-timezone library dependency.
function parisOffsetMsAt(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asIfUtcMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asIfUtcMs - utcMs;
}

// Europe/Paris local wall-clock time (a YYYY-MM-DD date + an HH:MM time) → the exact UTC instant,
// as an ISO 8601 string. Two fixed-point passes: a single pass (offset read at the NAIVE guess)
// can land a couple of hours wrong right around a DST transition, because the naive guess can sit
// on the opposite side of the jump from the real target; re-deriving the offset from the
// corrected candidate converges on the right one. Away from a transition both passes agree.
function parisLocalToUtcIso(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  const hh = match ? Number(match[1]) : 0;
  const mm = match ? Number(match[2]) : 0;
  const naiveUtcMs = Date.UTC(y, (m || 1) - 1, d || 1, hh, mm, 0);

  let candidateMs = naiveUtcMs;
  for (let i = 0; i < 2; i++) {
    candidateMs = naiveUtcMs - parisOffsetMsAt(candidateMs);
  }
  return new Date(candidateMs).toISOString();
}

// The session's [start, start+60min) window as UTC ISO instants, given its LOCAL (Europe/Paris)
// tour_date + start_time — the one place session scheduling gets turned into calendar-event times.
export function tourSessionWindowIso(tourDate: string, startTime: string): { startISO: string; endISO: string } {
  const startISO = parisLocalToUtcIso(tourDate, startTime);
  const endISO = new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
  return { startISO, endISO };
}

export interface CreateCalendarEventInput {
  title: string;
  description: string;
  startISO: string;
  endISO: string;
  guideEmail: string;
}

export async function createCalendarEvent(input: CreateCalendarEventInput): Promise<string> {
  const data = await callCalendarSync<CalendarSyncCreateResponse>({ action: 'create', ...input });
  return data.eventId;
}

export interface UpdateCalendarEventInput {
  eventId: string;
  title: string;
  description: string;
  startISO: string;
  endISO: string;
}

export async function updateCalendarEvent(input: UpdateCalendarEventInput): Promise<void> {
  await callCalendarSync<CalendarSyncUpdateResponse>({ action: 'update', ...input });
}

export async function getCalendarEventStatus(eventId: string): Promise<{ email: string; response: CalendarAttendeeResponse }[]> {
  const data = await callCalendarSync<CalendarSyncStatusResponse>({ action: 'status', eventId });
  return data.attendees;
}
