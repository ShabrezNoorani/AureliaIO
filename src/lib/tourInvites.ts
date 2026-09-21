// Pure, client-side link builders for confirming a guide's tour — no network calls, no state.

const pad2 = (n: number): string => String(n).padStart(2, '0');

const toGoogleDateUtc = (date: Date): string =>
  `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
  `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;

// tour_sessions.start_time is free text (normally "HH:MM" 24h, optionally with seconds or an
// AM/PM suffix) — and can also be a non-time placeholder like "No Time". Returns the scheduled
// start as a LOCAL Date on tourDate, or null when there is no real time to derive one from.
// Callers that need a definite Date use deriveSessionStart() below; callers measuring against
// the schedule (punctuality) must use this and treat null as "no scheduled time to compare to",
// never a fabricated default.
export const parseSessionStart = (tourDate: string, startTime?: string | null): Date | null => {
  const match = startTime?.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  const start = new Date(`${tourDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;

  start.setHours(h, m, 0, 0);
  return start;
};

// Same parse, but always yields a Date: anything unparsable falls back to 9:00 local on
// tourDate, which the calendar/WhatsApp invites need so a link is always produced.
const deriveSessionStart = (tourDate: string, startTime?: string | null): Date => {
  const parsed = parseSessionStart(tourDate, startTime);
  if (parsed) return parsed;

  const start = new Date(`${tourDate}T00:00:00`);
  start.setHours(9, 0, 0, 0);
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

export interface GuideInviteSession {
  label: string | null;
  start_time: string | null;
  /** YYYY-MM-DD */
  tour_date: string;
}

export interface GuideInviteTarget {
  name?: string | null;
  whatsapp?: string | null;
}

export interface GuideInviteLinks {
  calendarUrl: string;
  /** null when the guide has no usable WhatsApp number on file. */
  whatsappUrl: string | null;
}

/**
 * The ONE place that builds a guide's "you're confirmed" calendar + WhatsApp links, for any
 * surface that assigns/reassigns a guide to a session (DispatchPage, TodayToursPage) — so an
 * owner sees the exact same wording and links no matter where they send them from.
 */
export function buildGuideInviteLinks(
  session: GuideInviteSession,
  guide: GuideInviteTarget | null | undefined,
  pax: number,
  companyName?: string | null
): GuideInviteLinks {
  const sessionLabel = session.label || 'your tour';
  const timeLabel = session.start_time || 'time TBD';
  const paxLabel = `${pax} guest${pax !== 1 ? 's' : ''}`;

  const calendarUrl = buildGoogleCalendarUrl({
    title: sessionLabel,
    details: `${sessionLabel} — ${timeLabel} — ${paxLabel}`,
    location: sessionLabel,
    tourDate: session.tour_date,
    startTime: session.start_time,
  });

  const formattedDate = new Date(`${session.tour_date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  const message = `Hi ${guide?.name || 'there'}, you're confirmed for ${sessionLabel} on ${formattedDate} at ${timeLabel} (${paxLabel}) with ${companyName || 'us'}. Calendar invite: ${calendarUrl}`;

  return { calendarUrl, whatsappUrl: buildWhatsAppUrl(guide?.whatsapp, message) };
}
