import { describe, it, expect, afterEach, vi } from 'vitest';
import { computeMinutesLate, formatArrivalStatus, buildArrivalPayload, getArrivalCoords } from './guideArrivals';

// Local-time constructor — mirrors how a session's meeting time is derived (tour_date +
// start_time in the app's own timezone), so these assertions hold in any TZ the suite runs in.
const at = (y: number, m: number, d: number, h: number, min: number, s = 0) =>
  new Date(y, m - 1, d, h, min, s);

describe('computeMinutesLate', () => {
  it('is negative when the guide is early', () => {
    expect(computeMinutesLate(at(2026, 9, 21, 8, 58), '2026-09-21', '09:00')).toBe(-2);
  });

  it('is 0 when the guide arrives exactly on the meeting time', () => {
    expect(computeMinutesLate(at(2026, 9, 21, 9, 0), '2026-09-21', '09:00')).toBe(0);
  });

  it('is positive when the guide is late', () => {
    expect(computeMinutesLate(at(2026, 9, 21, 9, 7), '2026-09-21', '09:00')).toBe(7);
  });

  it('floors partial minutes so the number matches the displayed clock time', () => {
    // 9:07:45 displays as "9:07", so lateness must read 7 — not 8.
    expect(computeMinutesLate(at(2026, 9, 21, 9, 7, 45), '2026-09-21', '09:00')).toBe(7);
  });

  it('handles afternoon 24h times', () => {
    expect(computeMinutesLate(at(2026, 9, 21, 14, 35), '2026-09-21', '14:30')).toBe(5);
  });

  it('handles am/pm start times', () => {
    expect(computeMinutesLate(at(2026, 9, 21, 14, 35), '2026-09-21', '2:30 PM')).toBe(5);
  });

  it('handles start times stored with seconds', () => {
    expect(computeMinutesLate(at(2026, 9, 21, 9, 5), '2026-09-21', '09:00:00')).toBe(5);
  });

  it('counts a big overrun correctly', () => {
    expect(computeMinutesLate(at(2026, 9, 21, 10, 30), '2026-09-21', '09:00')).toBe(90);
  });

  it('returns null when the session has no scheduled time', () => {
    expect(computeMinutesLate(at(2026, 9, 21, 9, 7), '2026-09-21', null)).toBeNull();
    expect(computeMinutesLate(at(2026, 9, 21, 9, 7), '2026-09-21', '')).toBeNull();
    expect(computeMinutesLate(at(2026, 9, 21, 9, 7), '2026-09-21', 'No Time')).toBeNull();
  });
});

describe('formatArrivalStatus', () => {
  it('reads as on time when early or exact', () => {
    expect(formatArrivalStatus(at(2026, 9, 21, 8, 58).toISOString(), -2)).toBe('Arrived 8:58 — on time');
    expect(formatArrivalStatus(at(2026, 9, 21, 9, 0).toISOString(), 0)).toBe('Arrived 9:00 — on time');
  });

  it('reads as late with the minute count', () => {
    expect(formatArrivalStatus(at(2026, 9, 21, 9, 7).toISOString(), 7)).toBe('Arrived 9:07 — 7 min late');
  });

  it('omits punctuality when there was no scheduled time', () => {
    expect(formatArrivalStatus(at(2026, 9, 21, 9, 7).toISOString(), null)).toBe('Arrived 9:07');
  });

  it('supports the owner-side comma separator', () => {
    expect(formatArrivalStatus(at(2026, 9, 21, 8, 58).toISOString(), -2, ', ')).toBe('Arrived 8:58, on time');
    expect(formatArrivalStatus(at(2026, 9, 21, 9, 7).toISOString(), 7, ', ')).toBe('Arrived 9:07, 7 min late');
  });
});

describe('getArrivalCoords', () => {
  const setGeolocation = (value: unknown) => {
    Object.defineProperty(navigator, 'geolocation', { value, configurable: true, writable: true });
  };

  afterEach(() => {
    setGeolocation(undefined);
    vi.useRealTimers();
  });

  it('returns the fix when the guide allows location', async () => {
    setGeolocation({
      getCurrentPosition: (onSuccess: PositionCallback) =>
        onSuccess({ coords: { latitude: 48.8584, longitude: 2.2945 } } as GeolocationPosition),
    });

    await expect(getArrivalCoords()).resolves.toEqual({ latitude: 48.8584, longitude: 2.2945 });
  });

  it('resolves null (never rejects) when the guide DENIES permission', async () => {
    setGeolocation({
      getCurrentPosition: (_onSuccess: PositionCallback, onError: PositionErrorCallback) =>
        onError({ code: 1, message: 'User denied Geolocation' } as GeolocationPositionError),
    });

    await expect(getArrivalCoords()).resolves.toBeNull();
  });

  it('resolves null when the device has no geolocation at all', async () => {
    setGeolocation(undefined);
    await expect(getArrivalCoords()).resolves.toBeNull();
  });

  it('resolves null rather than hanging when the fix never calls back', async () => {
    vi.useFakeTimers();
    setGeolocation({ getCurrentPosition: () => { /* never settles */ } });

    const pending = getArrivalCoords(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toBeNull();
  });
});

describe('buildArrivalPayload', () => {
  const base = {
    ownerUserId: 'owner-1',
    sessionId: 'session-1',
    guideId: 'guide-1',
    tourDate: '2026-09-21',
    startTime: '09:00',
    arrivedAt: at(2026, 9, 21, 9, 7),
  };

  it('includes coordinates when GPS succeeded', () => {
    const payload = buildArrivalPayload({ ...base, coords: { latitude: 48.8584, longitude: 2.2945 } });
    expect(payload).toMatchObject({
      user_id: 'owner-1',
      session_id: 'session-1',
      guide_id: 'guide-1',
      latitude: 48.8584,
      longitude: 2.2945,
      meeting_time: '09:00',
      minutes_late: 7,
    });
    expect(payload.arrived_at).toBe(base.arrivedAt.toISOString());
  });

  it('still records the arrival with null coordinates when GPS was denied or failed', () => {
    const payload = buildArrivalPayload({ ...base, coords: null });
    expect(payload.latitude).toBeNull();
    expect(payload.longitude).toBeNull();
    // The parts that matter for punctuality are unaffected by the missing fix.
    expect(payload.arrived_at).toBe(base.arrivedAt.toISOString());
    expect(payload.minutes_late).toBe(7);
  });

  it('records an arrival with no punctuality when the session has no start time', () => {
    const payload = buildArrivalPayload({ ...base, startTime: null, coords: null });
    expect(payload.meeting_time).toBeNull();
    expect(payload.minutes_late).toBeNull();
    expect(payload.arrived_at).toBe(base.arrivedAt.toISOString());
  });
});
