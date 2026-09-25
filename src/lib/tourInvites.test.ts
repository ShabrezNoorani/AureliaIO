import { describe, it, expect } from 'vitest';
import { buildGuideInviteLinks, buildGoogleCalendarUrl, buildWhatsAppUrl } from './tourInvites';

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

  it('folds session notes into the event description alongside the option name', () => {
    const withNotes = { ...session, notes: 'Meet at the fountain' };
    const { calendarUrl } = buildGuideInviteLinks(withNotes, { name: 'Maria', whatsapp: null }, 4, 'AURELIA Tours');
    const details = new URL(calendarUrl).searchParams.get('details');
    expect(details).toBe('Old Town Walk\nMeet at the fountain');
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
});
