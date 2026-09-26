// Pure, client-side link builders for confirming a guide's tour — no network calls, no state.

import { checkinTime } from './utils';

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
  /** Invited as a guest on the event (Google's `add` param) when present — lets the owner send
   *  the invite in one click instead of typing the guide's email in manually. */
  guestEmail?: string | null;
  /** Multiple guests at once (Google's `add` param, repeated) — used for the shared multi-guide
   *  invite. Blank/missing entries are skipped. Combined with guestEmail above if both are given. */
  guestEmails?: (string | null | undefined)[];
}

export function buildGoogleCalendarUrl({ title, details, location, tourDate, startTime, guestEmail, guestEmails }: GoogleCalendarEventInput): string {
  const start = deriveSessionStart(tourDate, startTime);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', title);
  params.set('dates', `${toGoogleDateUtc(start)}/${toGoogleDateUtc(end)}`);
  if (details) params.set('details', details);
  if (location) params.set('location', location);
  if (guestEmail) params.append('add', guestEmail);
  (guestEmails || []).forEach((email) => { if (email) params.append('add', email); });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Android's Google Calendar app registers itself as the verified App Link handler for
// calendar.google.com, so a plain <a href> tap (even with target="_blank") gets hijacked into the
// native app — which doesn't reliably parse the TEMPLATE action's pre-filled fields and drops
// straight to an empty "today" view. Routing through an explicit Chrome intent bypasses that
// hijack and forces the same URL to render as a normal, pre-filled web page instead. iOS/desktop
// links are returned unchanged — this is an Android-only, Chrome-recognized URI scheme; using it
// anywhere else would just be a broken link.
export function forceBrowserUrl(url: string): string {
  if (typeof navigator === 'undefined' || !/Android/i.test(navigator.userAgent)) return url;
  const withoutScheme = url.replace(/^https?:\/\//, '');
  return `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
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
  /** Session notes, if any — folded into the calendar event description alongside the option name. */
  notes?: string | null;
}

export interface GuideInviteTarget {
  name?: string | null;
  whatsapp?: string | null;
  /** Invited as a guest on the calendar event when present — see hasGuestEmail below. */
  email?: string | null;
  /** This guide's OWN pay for this session (session_guides.base_pay/bonus) — folded into the
   *  calendar event's description, since that invite is emailed straight to this guide. NEVER
   *  populate this with another guide's figures; every caller must pass one guide's own row. */
  base_pay?: number | null;
  bonus?: number | null;
}

export interface GuideInviteLinks {
  calendarUrl: string;
  /** null when the guide has no usable WhatsApp number on file. */
  whatsappUrl: string | null;
  /** false when the guide has no email on file — calendarUrl still opens, just without a
   *  pre-filled guest; callers should show a small "add guide email to auto-invite" note. */
  hasGuestEmail: boolean;
}

export interface GuideInviteOptions {
  /** This guide's own check-in-time override for the session (session_guides.checkin_time), if
   *  the owner set one — falls back to the computed tour-minus-15 default when absent/null. Never
   *  another guide's check-in time. */
  checkinTimeOverride?: string | null;
  /** The linked booking's own option name, when known (e.g. "Guided Tour & Cathedral Visit") —
   *  falls back to the session label when omitted. */
  optionName?: string | null;
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
  companyName?: string | null,
  options?: GuideInviteOptions
): GuideInviteLinks {
  const sessionLabel = session.label || 'your tour';
  const timeLabel = session.start_time || 'time TBD';
  const paxLabel = `${pax} guest${pax !== 1 ? 's' : ''}`;
  const optionName = options?.optionName || sessionLabel;

  // Check-in is always 15 min before the tour by default, but the owner can override it per guide
  // (Layer A) — that override always wins here. Only appended when a check-in time is actually
  // available; an unparsable/missing start time (and no override) falls back to the plain label.
  const checkin = options?.checkinTimeOverride || checkinTime(session.start_time);
  const title = checkin ? `${sessionLabel} · Check-in ${checkin} (Tour ${timeLabel})` : sessionLabel;

  // Base+bonus for THIS guide only (never another guide's — see GuideInviteTarget above). Omitted
  // entirely when no pay figure is known at all, rather than showing a fabricated "€0".
  const payLine = (() => {
    if (guide?.base_pay == null && guide?.bonus == null) return null;
    const base = Number(guide?.base_pay) || 0;
    const bonus = Number(guide?.bonus) || 0;
    const guideName = guide?.name || 'Guide';
    return bonus > 0
      ? `Guide: ${guideName} · €${base} base + €${bonus} bonus = €${base + bonus}`
      : `Guide: ${guideName} · €${base} base`;
  })();

  const longDate = new Date(`${session.tour_date}T00:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const details = [
    optionName,
    longDate,
    checkin ? `Check-in ${checkin}` : null,
    payLine,
    session.notes,
  ].filter(Boolean).join('\n');

  const calendarUrl = buildGoogleCalendarUrl({
    title,
    details,
    location: sessionLabel,
    tourDate: session.tour_date,
    startTime: session.start_time,
    guestEmail: guide?.email,
  });

  const shortDate = new Date(`${session.tour_date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  const message = `Hi ${guide?.name || 'there'}, you're confirmed for ${sessionLabel} on ${shortDate} at ${timeLabel} (${paxLabel}) with ${companyName || 'us'}. Calendar invite: ${calendarUrl}`;

  return {
    calendarUrl,
    whatsappUrl: buildWhatsAppUrl(guide?.whatsapp, message),
    hasGuestEmail: !!guide?.email,
  };
}

export interface SharedInviteGuide {
  name?: string | null;
  email?: string | null;
}

export interface SharedInviteLink {
  calendarUrl: string;
  /** How many of the passed-in guides actually had an email on file and got added as a guest. */
  invitedCount: number;
  /** true when every guide had an email — false means some guides were silently skipped and the
   *  owner should be told which ones need an email added. */
  allHaveEmail: boolean;
}

/**
 * Builds ONE shared Google Calendar event covering every guide assigned to a session — every
 * guide with an email on file is added as a guest via a repeated `add` param, so the owner sends
 * a single invite instead of one per guide. Deliberately takes no pay figures at all (unlike
 * buildGuideInviteLinks) — every invited guest would see the exact same description, so a
 * multi-guide invite can NEVER carry anyone's pay. Use buildGuideInviteLinks instead for a
 * session with exactly one assigned guide, where that guide's own pay is safe to include.
 */
export function buildSharedGuideInviteLink(
  session: GuideInviteSession,
  guides: SharedInviteGuide[],
  options?: { optionName?: string | null }
): SharedInviteLink {
  const sessionLabel = session.label || 'your tour';
  const timeLabel = session.start_time || 'time TBD';
  const optionName = options?.optionName || sessionLabel;
  const checkin = checkinTime(session.start_time);
  const title = checkin ? `${sessionLabel} · Check-in ${checkin} (Tour ${timeLabel})` : sessionLabel;

  const guideNames = guides.map((g) => g.name).filter(Boolean).join(', ');
  const longDate = new Date(`${session.tour_date}T00:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const details = [
    optionName,
    longDate,
    checkin ? `Check-in ${checkin}` : null,
    guideNames ? `Guides: ${guideNames}` : null,
    session.notes,
  ].filter(Boolean).join('\n');

  const guestEmails = guides.map((g) => g.email).filter((e): e is string => !!e);

  const calendarUrl = buildGoogleCalendarUrl({
    title,
    details,
    location: sessionLabel,
    tourDate: session.tour_date,
    startTime: session.start_time,
    guestEmails,
  });

  return {
    calendarUrl,
    invitedCount: guestEmails.length,
    allHaveEmail: guestEmails.length === guides.length,
  };
}
