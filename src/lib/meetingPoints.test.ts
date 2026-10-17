import { describe, it, expect } from 'vitest';
import { haversineDistanceMeters, parseLatLngFromInput, evaluateArrivalGate } from './meetingPoints';

describe('haversineDistanceMeters', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistanceMeters(48.8530, 2.3499, 48.8530, 2.3499)).toBe(0);
  });

  it('returns a small, realistic distance for two nearby points (~111m apart — 0.001 deg latitude)', () => {
    const d = haversineDistanceMeters(48.8530, 2.3499, 48.8540, 2.3499);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it('returns a large, realistic distance for two far-apart cities (Paris ↔ London, ~340km)', () => {
    const d = haversineDistanceMeters(48.8566, 2.3522, 51.5072, -0.1276);
    expect(d).toBeGreaterThan(330000);
    expect(d).toBeLessThan(350000);
  });

  it('is symmetric', () => {
    const a = haversineDistanceMeters(48.8530, 2.3499, 40.4168, -3.7038);
    const b = haversineDistanceMeters(40.4168, -3.7038, 48.8530, 2.3499);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('parseLatLngFromInput — Google Maps link formats', () => {
  it('parses a plain "@lat,long,zoom" link', () => {
    expect(parseLatLngFromInput('https://www.google.com/maps/@48.8530,2.3499,17z')).toEqual({ lat: 48.8530, lng: 2.3499 });
  });

  it('parses a "/place/Name/@lat,long,zoom" link', () => {
    const url = 'https://www.google.com/maps/place/Notre-Dame+de+Paris/@48.852968,2.3499,17z/data=!3m1!4b1';
    expect(parseLatLngFromInput(url)).toEqual({ lat: 48.852968, lng: 2.3499 });
  });

  it('parses a "?q=lat,long" link', () => {
    expect(parseLatLngFromInput('https://maps.google.com/maps?q=48.8530,2.3499')).toEqual({ lat: 48.8530, lng: 2.3499 });
  });

  it('parses a "&q=lat,long" link (q is not the first query param)', () => {
    expect(parseLatLngFromInput('https://maps.google.com/maps?z=15&q=48.8530,2.3499')).toEqual({ lat: 48.8530, lng: 2.3499 });
  });

  it('parses raw "lat,long" text with no URL at all', () => {
    expect(parseLatLngFromInput('48.8530,2.3499')).toEqual({ lat: 48.8530, lng: 2.3499 });
  });

  it('parses raw "lat, long" text with a space after the comma', () => {
    expect(parseLatLngFromInput('48.8530, 2.3499')).toEqual({ lat: 48.8530, lng: 2.3499 });
  });

  it('handles negative coordinates (southern/western hemisphere)', () => {
    expect(parseLatLngFromInput('-33.8688,151.2093')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  it('prefers the "@lat,long" segment over an unrelated "q=" style fragment when both could match', () => {
    const url = 'https://www.google.com/maps/@48.8530,2.3499,17z?entry=ttu';
    expect(parseLatLngFromInput(url)).toEqual({ lat: 48.8530, lng: 2.3499 });
  });

  it('returns null for a link with no parsable coordinates', () => {
    expect(parseLatLngFromInput('https://www.google.com/maps/place/Notre-Dame+de+Paris')).toBeNull();
  });

  it('returns null for empty/whitespace input', () => {
    expect(parseLatLngFromInput('')).toBeNull();
    expect(parseLatLngFromInput('   ')).toBeNull();
  });

  it('returns null for out-of-range values', () => {
    expect(parseLatLngFromInput('200,2.3499')).toBeNull();
    expect(parseLatLngFromInput('48.8530,-250')).toBeNull();
  });

  it('returns null for garbage text', () => {
    expect(parseLatLngFromInput('not a location at all')).toBeNull();
  });
});

describe('evaluateArrivalGate — geo-verified "I\'ve arrived"', () => {
  const meetingPoint = { name: 'Notre-Dame — Statue of Charlemagne', latitude: 48.8530, longitude: 2.3499, radius_m: 120 };

  it('accepts unconditionally when the session has no meeting point (fallback behavior)', () => {
    const result = evaluateArrivalGate(null, null);
    expect(result).toEqual({ accepted: true, distanceM: null, message: null });
  });

  it('accepts with no GPS fix when there is no meeting point to verify against', () => {
    const result = evaluateArrivalGate(null, null);
    expect(result.accepted).toBe(true);
  });

  it('rejects when a meeting point is configured but GPS is unavailable/denied — never silently accepts', () => {
    const result = evaluateArrivalGate(null, meetingPoint);
    expect(result.accepted).toBe(false);
    expect(result.distanceM).toBeNull();
    expect(result.message).toContain('Location is required');
    expect(result.message).toContain(meetingPoint.name);
  });

  it('accepts when well within the radius', () => {
    const result = evaluateArrivalGate({ latitude: 48.8530, longitude: 2.3499 }, meetingPoint);
    expect(result.accepted).toBe(true);
    expect(result.distanceM).toBe(0);
    expect(result.message).toBeNull();
  });

  it('accepts a small, nonzero in-radius distance (not just the dead-center 0m case above)', () => {
    // ~0.00009 deg latitude ≈ 10m — comfortably inside a 120m radius.
    const result = evaluateArrivalGate({ latitude: 48.85309, longitude: 2.3499 }, meetingPoint);
    expect(result.accepted).toBe(true);
    expect(result.distanceM).toBeGreaterThan(0);
    expect(result.distanceM).toBeLessThan(120);
  });

  it('rejects when outside the radius, with a clear distance-and-name message', () => {
    // ~0.01 deg latitude ≈ 1110m away — well outside a 120m radius.
    const result = evaluateArrivalGate({ latitude: 48.8630, longitude: 2.3499 }, meetingPoint);
    expect(result.accepted).toBe(false);
    expect(result.distanceM).toBeGreaterThan(120);
    expect(result.message).toContain('m from');
    expect(result.message).toContain(meetingPoint.name);
  });
});
