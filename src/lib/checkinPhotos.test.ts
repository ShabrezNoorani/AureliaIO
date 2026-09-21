import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock of the shared supabase client — checkinPhotos.ts only ever touches
// supabase.storage.from(BUCKET).createSignedUrl(...)/.upload(...), so that's all this fakes.
// vi.mock's factory is hoisted above top-level declarations, so the mock fns it references must
// be created via vi.hoisted() rather than plain consts.
const { createSignedUrl, upload, storageFrom } = vi.hoisted(() => {
  const createSignedUrl = vi.fn();
  const upload = vi.fn();
  const storageFrom = vi.fn(() => ({ createSignedUrl, upload }));
  return { createSignedUrl, upload, storageFrom };
});
vi.mock('./supabase', () => ({
  supabase: {
    storage: { from: storageFrom },
  },
}));

import {
  isBase64Photo, buildCheckinPhotoPath, resolveCheckinPhotoSrc, uploadCheckinPhoto, CHECKIN_PHOTOS_BUCKET,
} from './checkinPhotos';

beforeEach(() => {
  createSignedUrl.mockReset();
  upload.mockReset();
  storageFrom.mockClear();
});

describe('isBase64Photo', () => {
  it('recognizes a legacy base64 data URL', () => {
    expect(isBase64Photo('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
  });

  it('does not mistake a Storage path for base64', () => {
    expect(isBase64Photo('user-1/2026-01-01/BR-1-1737000000000.jpg')).toBe(false);
  });

  it('treats an empty string as not base64', () => {
    expect(isBase64Photo('')).toBe(false);
  });
});

describe('buildCheckinPhotoPath', () => {
  it('follows ${user_id}/${travel_date}/${booking_ref}-${timestamp}.jpg', () => {
    const path = buildCheckinPhotoPath('user-1', '2026-01-15', 'BR-1234');
    expect(path).toMatch(/^user-1\/2026-01-15\/BR-1234-\d+\.jpg$/);
  });

  it('produces a different path for the same booking checked in again later (no collision)', async () => {
    const first = buildCheckinPhotoPath('user-1', '2026-01-15', 'BR-1234');
    await new Promise((r) => setTimeout(r, 2));
    const second = buildCheckinPhotoPath('user-1', '2026-01-15', 'BR-1234');
    expect(first).not.toBe(second);
  });
});

describe('resolveCheckinPhotoSrc', () => {
  it('returns null for a null/undefined/empty value without calling Storage', async () => {
    expect(await resolveCheckinPhotoSrc(null)).toBeNull();
    expect(await resolveCheckinPhotoSrc(undefined)).toBeNull();
    expect(await resolveCheckinPhotoSrc('')).toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns a legacy base64 value unchanged, with no Storage call', async () => {
    const b64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(await resolveCheckinPhotoSrc(b64)).toBe(b64);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('signs a Storage path against the checkin-photos bucket and returns the signed URL', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/photo.jpg' }, error: null });
    const path = 'user-1/2026-01-15/BR-1234-1737000000000.jpg';

    const result = await resolveCheckinPhotoSrc(path);

    expect(result).toBe('https://signed.example/photo.jpg');
    expect(storageFrom).toHaveBeenCalledWith(CHECKIN_PHOTOS_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith(path, expect.any(Number));
  });

  it('returns null (never throws) when signing fails, e.g. a deleted object', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    const result = await resolveCheckinPhotoSrc('user-1/2026-01-15/gone.jpg');
    expect(result).toBeNull();
  });
});

describe('uploadCheckinPhoto', () => {
  it('uploads to a path under the given user/date/booking and returns that path', async () => {
    upload.mockResolvedValue({ data: { path: 'whatever' }, error: null });
    const photo = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' });

    const path = await uploadCheckinPhoto({ userId: 'user-1', travelDate: '2026-01-15', bookingRef: 'BR-1234', photo });

    expect(path).toMatch(/^user-1\/2026-01-15\/BR-1234-\d+\.jpg$/);
    expect(storageFrom).toHaveBeenCalledWith(CHECKIN_PHOTOS_BUCKET);
    expect(upload).toHaveBeenCalledWith(path, photo, expect.objectContaining({ contentType: 'image/jpeg', upsert: false }));
  });

  it('throws when the upload fails, so the caller (the retry queue) retries it', async () => {
    upload.mockResolvedValue({ data: null, error: { message: 'network drop' } });
    const photo = new Blob(['x'], { type: 'image/jpeg' });

    await expect(
      uploadCheckinPhoto({ userId: 'user-1', travelDate: '2026-01-15', bookingRef: 'BR-1234', photo })
    ).rejects.toBeTruthy();
  });
});
