import { supabase } from './supabase';

export const CHECKIN_PHOTOS_BUCKET = 'checkin-photos';

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.7;
// How long a generated view link stays valid. Short relative to a public URL that never expires
// (the bucket is private) — long enough that a thumbnail's signed URL doesn't need re-signing on
// every re-render within the same viewing session.
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Resizes to at most MAX_DIMENSION on the long edge and re-encodes as JPEG at JPEG_QUALITY, so a
 * multi-MB phone-camera photo becomes a small (roughly 100-300KB) upload. Runs entirely
 * client-side via canvas — no server round-trip needed just to shrink the file before it's sent.
 * Images already smaller than MAX_DIMENSION are re-encoded at JPEG_QUALITY but not upscaled.
 */
export async function compressCheckinPhoto(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode compressed photo'))),
        'image/jpeg',
        JPEG_QUALITY
      );
    });
  } finally {
    bitmap.close();
  }
}

/** `${user_id}/${travel_date}/${booking_ref}-${timestamp}.jpg` — timestamped so re-checking in
    the same guest (after a Reset) never collides with a still-referenced older upload. */
export function buildCheckinPhotoPath(userId: string, travelDate: string, bookingRef: string): string {
  return `${userId}/${travelDate}/${bookingRef}-${Date.now()}.jpg`;
}

/** Uploads an already-compressed photo and returns the STORAGE PATH (never a public URL — the
    bucket is private) to persist in checkins.ticket_photo. */
export async function uploadCheckinPhoto(params: {
  userId: string;
  travelDate: string;
  bookingRef: string;
  photo: Blob;
}): Promise<string> {
  const path = buildCheckinPhotoPath(params.userId, params.travelDate, params.bookingRef);
  const { error } = await supabase.storage
    .from(CHECKIN_PHOTOS_BUCKET)
    .upload(path, params.photo, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/** checkins.ticket_photo holds either a legacy base64 data URL (rows written before this Storage
    migration) or a Storage path (current rows) — this is the ONE place that tells them apart, so
    every reader stays in agreement about which is which. Never migrated in place (out of scope —
    both formats are read forever, only new writes go to Storage). */
export function isBase64Photo(value: string): boolean {
  return value.startsWith('data:');
}

/**
 * Resolves whatever's in ticket_photo into something an <img> can load:
 *   - legacy base64  -> the value itself, unchanged, no network call.
 *   - a Storage path -> a short-lived signed URL (the bucket is private, so there is no
 *                       permanent public URL to hand back).
 * Never throws — returns null for anything falsy or on a signed-URL failure (e.g. the object was
 * deleted), so a broken/legacy photo never breaks the guest card it's rendered inside.
 */
export async function resolveCheckinPhotoSrc(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (isBase64Photo(value)) return value;

  const { data, error } = await supabase.storage
    .from(CHECKIN_PHOTOS_BUCKET)
    .createSignedUrl(value, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error('Failed to sign check-in photo URL:', error);
    return null;
  }
  return data.signedUrl;
}
