import { describe, it, expect, afterEach } from 'vitest';
import { buildGuideInviteLinks, buildGoogleCalendarUrl, buildWhatsAppUrl, buildSharedGuideInviteLink, forceBrowserUrl } from './tourInvites';

describe('buildGuideInviteLinks', () => {
  const session = { label: 'Old Town Walk', start_time: '09:00', tour_date: '2026-06-15' };

  it('builds a calendar link scoped to the session title/date/time', () => {
    const { calendarUrl } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: null }, 4, 'AURELIA Tours');
    expect(calendarUrl).toContain('calendar.google.com');
    expect(calendarUrl).toContain('Old+Town+Walk');
  });

  it('returns no whatsappUrl when the guide has no WhatsApp number', () => {
    const { whatsappUrl } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: null }, 4, 'AURELIA Tours');
    expect(whatsappUrl).toBeNull();
  });

  it('returns no whatsappUrl for a guide with no phone number at all', () => {
    const { whatsappUrl } = buildGuideInviteLinks(session, null, 4, 'AURELIA Tours');
    expect(whatsappUrl).toBeNull();
  });

  it('builds a WhatsApp link when the guide has a usable number', () => {
    const { whatsappUrl } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: '+34 600 123 456' }, 4, 'AURELIA Tours');
    expect(whatsappUrl).toContain('https://wa.me/34600123456');
  });

  it('includes the guide name, pax count and company name in the WhatsApp message', () => {
    const { whatsappUrl } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: '+34600123456' }, 4, 'AURELIA Tours');
    const decoded = decodeURIComponent(whatsappUrl!);
    expect(decoded).toContain('Hi Maria');
    expect(decoded).toContain('4 guests');
    expect(decoded).toContain('AURELIA Tours');
    expect(decoded).toContain('Old Town Walk');
  });

  it('singularizes "guest" for a single pax', () => {
    const { whatsappUrl } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: '+34600123456' }, 1, 'AURELIA Tours');
    expect(decodeURIComponent(whatsappUrl!)).toContain('(1 guest)');
  });

  it('falls back gracefully when the guide/company are unknown', () => {
    const { whatsappUrl } = buildGuideInviteLinks(session, undefined, 2, undefined);
    expect(decodeURIComponent(whatsappUrl ?? '')).toBe('');
  });

  it('falls back to "your tour"/"time TBD" when the session has no label/start_time', () => {
    const bare = { label: null, start_time: null, tour_date: '2026-06-15' };
    const { calendarUrl, whatsappUrl } = buildGuideInviteLinks(bare, { name: 'Maria', whatsapp: '+34600123456' }, 2, 'AURELIA Tours');
    expect(calendarUrl).toContain('your+tour');
    expect(decodeURIComponent(whatsappUrl!)).toContain('time TBD');
  });

  it('puts the check-in (tour minus 15 min) and tour time in the event title', () => {
    const { calendarUrl } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: null }, 4, 'AURELIA Tours');
    const text = new URL(calendarUrl).searchParams.get('text');
    expect(text).toBe('Old Town Walk · Check-in 08:45 (Tour 09:00)');
  });

  it('omits the check-in/tour suffix when the start time is unparsable', () => {
    const noTime = { label: 'Old Town Walk', start_time: null, tour_date: '2026-06-15' };
    const { calendarUrl } = buildGuideInviteLinks(noTime, { name: 'Maria', whatsapp: null }, 4, 'AURELIA Tours');
    const text = new URL(calendarUrl).searchParams.get('text');
    expect(text).toBe('Old Town Walk');
  });

  it('pre-fills the guide email as a calendar guest when one is on file', () => {
    const { calendarUrl, hasGuestEmail } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: null, email: 'maria@example.com' }, 4, 'AURELIA Tours');
    expect(hasGuestEmail).toBe(true);
    expect(new URL(calendarUrl).searchParams.get('add')).toBe('maria@example.com');
  });

  it('reports no guest email and adds no `add` param when the guide has none on file', () => {
    const { calendarUrl, hasGuestEmail } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: null }, 4, 'AURELIA Tours');
    expect(hasGuestEmail).toBe(false);
    expect(new URL(calendarUrl).searchParams.has('add')).toBe(false);
  });

  it('folds option name, date, check-in and session notes into the event description', () => {
    const withNotes = { ...session, notes: 'Meet at the fountain' };
    const { calendarUrl } = buildGuideInviteLinks(withNotes, { name: 'Maria', whatsapp: null }, 4, 'AURELIA Tours');
    const details = new URL(calendarUrl).searchParams.get('details');
    expect(details).toBe('Old Town Walk\nMonday, 15 June 2026\nCheck-in 08:45\nMeet at the fountain');
  });

  it('uses the passed-in optionName over the session label in the description', () => {
    const { calendarUrl } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: null }, 4, 'AURELIA Tours', {
      optionName: 'Guided Tour & Cathedral Visit',
    });
    const details = new URL(calendarUrl).searchParams.get('details');
    expect(details).toBe('Guided Tour & Cathedral Visit\nMonday, 15 June 2026\nCheck-in 08:45');
  });

  it('prefers the guide\'s own checkinTimeOverride over the computed tour-minus-15 default', () => {
    const { calendarUrl } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: null }, 4, 'AURELIA Tours', {
      checkinTimeOverride: '08:30',
    });
    const text = new URL(calendarUrl).searchParams.get('text');
    const details = new URL(calendarUrl).searchParams.get('details');
    expect(text).toBe('Old Town Walk · Check-in 08:30 (Tour 09:00)');
    expect(details).toContain('Check-in 08:30');
  });

  it('includes this guide\'s own base pay + bonus + total in the description', () => {
    const { calendarUrl } = buildGuideInviteLinks(session, { name: 'Kamini', whatsapp: null, base_pay: 60, bonus: 10 }, 4, 'AURELIA Tours');
    const details = new URL(calendarUrl).searchParams.get('details');
    expect(details).toContain('Guide: Kamini · €60 base + €10 bonus = €70');
  });

  it('omits the "+ bonus" clause when bonus is zero/absent, but still shows base pay', () => {
    const { calendarUrl } = buildGuideInviteLinks(session, { name: 'Kamini', whatsapp: null, base_pay: 60, bonus: 0 }, 4, 'AURELIA Tours');
    const details = new URL(calendarUrl).searchParams.get('details');
    expect(details).toContain('Guide: Kamini · €60 base');
    expect(details).not.toContain('bonus');
  });

  it('omits the pay line entirely when no pay figure is known at all', () => {
    const { calendarUrl } = buildGuideInviteLinks(session, { name: 'Maria', whatsapp: null }, 4, 'AURELIA Tours');
    const details = new URL(calendarUrl).searchParams.get('details');
    expect(details).not.toContain('Guide:');
  });

  it('never leaks a different guide\'s pay — only whatever is passed for THIS guide is shown', () => {
    const { calendarUrl } = buildGuideInviteLinks(session, { name: 'Solo Guide', whatsapp: null, base_pay: 40, bonus: null }, 2, 'AURELIA Tours');
    const details = new URL(calendarUrl).searchParams.get('details');
    expect(details).toContain('Guide: Solo Guide · €40 base');
    expect(details).not.toContain('Guide: Kamini');
  });
});

describe('buildWhatsAppUrl', () => {
  it('strips non-digit characters from the phone number', () => {
    expect(buildWhatsAppUrl('+34 (600) 123-456', 'hi')).toBe('https://wa.me/34600123456?text=hi');
  });

  it('rejects a number that is too short to be real', () => {
    expect(buildWhatsAppUrl('12345', 'hi')).toBeNull();
  });

  it('returns null for no number', () => {
    expect(buildWhatsAppUrl(null, 'hi')).toBeNull();
    expect(buildWhatsAppUrl(undefined, 'hi')).toBeNull();
  });
});

describe('buildGoogleCalendarUrl', () => {
  it('always returns a link even with an unparsable start time', () => {
    const url = buildGoogleCalendarUrl({ title: 'Tour', tourDate: '2026-06-15', startTime: 'garbage' });
    expect(url).toContain('calendar.google.com');
  });

  it('adds the guest as an `add` param when guestEmail is given', () => {
    const url = buildGoogleCalendarUrl({ title: 'Tour', tourDate: '2026-06-15', startTime: '09:00', guestEmail: 'guide@example.com' });
    expect(new URL(url).searchParams.get('add')).toBe('guide@example.com');
  });

  it('omits the `add` param when no guestEmail is given', () => {
    const url = buildGoogleCalendarUrl({ title: 'Tour', tourDate: '2026-06-15', startTime: '09:00' });
    expect(new URL(url).searchParams.has('add')).toBe(false);
  });

  it('repeats the `add` param for every email in guestEmails', () => {
    const url = buildGoogleCalendarUrl({
      title: 'Tour', tourDate: '2026-06-15', startTime: '09:00',
      guestEmails: ['a@example.com', 'b@example.com'],
    });
    expect(new URL(url).searchParams.getAll('add')).toEqual(['a@example.com', 'b@example.com']);
  });

  it('skips blank/missing entries in guestEmails', () => {
    const url = buildGoogleCalendarUrl({
      title: 'Tour', tourDate: '2026-06-15', startTime: '09:00',
      guestEmails: ['a@example.com', null, undefined, ''],
    });
    expect(new URL(url).searchParams.getAll('add')).toEqual(['a@example.com']);
  });
});

describe('buildSharedGuideInviteLink', () => {
  const session = { label: 'Old Town Walk', start_time: '09:00', tour_date: '2026-06-15' };

  it('invites every guide with an email via repeated `add` params', () => {
    const { calendarUrl, invitedCount, allHaveEmail } = buildSharedGuideInviteLink(session, [
      { name: 'Maria', email: 'maria@example.com' },
      { name: 'Kamini', email: 'kamini@example.com' },
    ]);
    expect(new URL(calendarUrl).searchParams.getAll('add')).toEqual(['maria@example.com', 'kamini@example.com']);
    expect(invitedCount).toBe(2);
    expect(allHaveEmail).toBe(true);
  });

  it('skips a guide with no email and reports allHaveEmail: false', () => {
    const { calendarUrl, invitedCount, allHaveEmail } = buildSharedGuideInviteLink(session, [
      { name: 'Maria', email: 'maria@example.com' },
      { name: 'Kamini', email: null },
    ]);
    expect(new URL(calendarUrl).searchParams.getAll('add')).toEqual(['maria@example.com']);
    expect(invitedCount).toBe(1);
    expect(allHaveEmail).toBe(false);
  });

  it('lists every guide name in the description but NEVER any pay figure', () => {
    const { calendarUrl } = buildSharedGuideInviteLink(session, [
      { name: 'Maria', email: 'maria@example.com' },
      { name: 'Kamini', email: 'kamini@example.com' },
    ]);
    const details = new URL(calendarUrl).searchParams.get('details');
    expect(details).toContain('Guides: Maria, Kamini');
    expect(details).not.toContain('€');
    expect(details).not.toContain('base');
    expect(details).not.toContain('bonus');
  });

});

describe('forceBrowserUrl', () => {
  const originalUserAgent = navigator.userAgent;
  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
  });

  it('leaves the URL unchanged on a non-Android user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', configurable: true,
    });
    const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tour';
    expect(forceBrowserUrl(url)).toBe(url);
  });

  it('wraps the URL in a Chrome-targeted intent:// on Android, preserving it as a fallback', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', configurable: true,
    });
    const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tour';
    const wrapped = forceBrowserUrl(url);
    expect(wrapped).toMatch(/^intent:\/\/calendar\.google\.com/);
    expect(wrapped).toContain('package=com.android.chrome');
    expect(wrapped).toContain(encodeURIComponent(url));
  });
});
