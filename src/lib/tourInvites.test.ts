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
});
