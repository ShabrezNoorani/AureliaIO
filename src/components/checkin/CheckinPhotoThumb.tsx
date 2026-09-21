import { useEffect, useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { resolveCheckinPhotoSrc } from '@/lib/checkinPhotos';

interface CheckinPhotoThumbProps {
  /** Raw checkins.ticket_photo value — a legacy base64 data URL or a Storage path (see
      isBase64Photo). Renders nothing when null/undefined. */
  photo: string | null | undefined;
}

/**
 * A small clickable thumbnail that opens the full ticket photo in a lightbox. Resolves `photo`
 * into a displayable src once on mount (a legacy base64 value resolves instantly with no network
 * call; a Storage path resolves via a short-lived signed URL, since the bucket is private) and
 * reuses that same resolved src for both the thumbnail and the expanded view.
 */
export default function CheckinPhotoThumb({ photo }: CheckinPhotoThumbProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    if (!photo) return;

    resolveCheckinPhotoSrc(photo).then((resolved) => {
      if (cancelled) return;
      if (resolved) setSrc(resolved);
      else setFailed(true);
    });

    return () => { cancelled = true; };
  }, [photo]);

  // A legacy/broken photo (signed URL failed, e.g. the object was deleted) is skipped entirely
  // rather than shown as a permanently-loading or broken thumbnail.
  if (!photo || failed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title="View ticket photo"
        className="w-7 h-7 rounded-md overflow-hidden border border-border shrink-0 bg-muted flex items-center justify-center hover:border-gold/50 transition-colors"
      >
        {src ? (
          <img src={src} alt="Ticket" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={12} className="text-muted-foreground animate-pulse" />
        )}
      </button>

      {expanded && src && (
        <div
          className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in"
          onClick={() => setExpanded(false)}
        >
          <button
            onClick={() => setExpanded(false)}
            className="absolute top-6 right-6 text-white/80 hover:text-white p-2"
            title="Close"
          >
            <X size={24} />
          </button>
          <img
            src={src}
            alt="Ticket photo"
            className="max-w-full max-h-full rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
