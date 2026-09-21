import { useEffect, useRef, useState } from 'react';
import { Camera, Check } from 'lucide-react';
import { compressCheckinPhoto } from '@/lib/checkinPhotos';

interface CheckinConfirmModalProps {
  customerName: string;
  pax: {
    adult?: number | null;
    youth?: number | null;
    child?: number | null;
    infant?: number | null;
  };
  /** The compressed photo, ready to upload — never the raw camera file/base64 (see
      compressCheckinPhoto). null if no photo was captured. */
  onConfirm: (photo: Blob | null) => void;
  onCancel: () => void;
}

export default function CheckinConfirmModal({ customerName, pax, onConfirm, onCancel }: CheckinConfirmModalProps) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const total = (pax.adult || 0) + (pax.youth || 0) + (pax.child || 0) + (pax.infant || 0);

  // object URLs are per-Blob and must be revoked once superseded/unmounted, or they leak.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const handleCapturePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets picking the same file twice in a row still fire onChange
    if (!file) return;

    setCompressing(true);
    try {
      // Compressed once, here, at capture time — not on every retry attempt later, and not the
      // full multi-MB camera original, which would otherwise sit in the retry queue's closure
      // across however many attempts a bad connection needs.
      const compressed = await compressCheckinPhoto(file);
      setPhoto(compressed);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(compressed);
      });
    } catch (err) {
      console.error('Failed to process check-in photo:', err);
    } finally {
      setCompressing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-fade-in">
      <div className="bg-card border border-border rounded-[3rem] w-full max-w-sm shadow-2xl p-8 space-y-8 animate-slide-up">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-foreground">Confirm Check-in</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Customer: {customerName}</p>
          <div className="flex flex-col items-center gap-1 pt-2">
            <div className="flex items-center gap-2 text-foreground font-bold">
              <span className="text-lg">👥</span>
              <span>A:{pax.adult || 0} Y:{pax.youth || 0} C:{pax.child || 0} I:{pax.infant || 0}</span>
            </div>
            <p className="text-[10px] font-black uppercase text-gold">({total} total)</p>
          </div>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="aspect-square bg-muted border-2 border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center gap-3 cursor-pointer overflow-hidden relative group"
        >
          {previewUrl ? (
            <img src={previewUrl} className="w-full h-full object-cover" />
          ) : (
            <>
              <Camera size={32} className="text-muted-foreground group-hover:text-gold transition-colors" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {compressing ? 'Processing…' : 'Ticket Photo (Optional)'}
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            className="hidden"
            onChange={handleCapturePhoto}
          />
        </div>

        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => onConfirm(photo)}
            disabled={compressing}
            className="w-full py-5 bg-gold text-black rounded-2xl font-black text-sm uppercase tracking-[0.1em] shadow-xl shadow-gold/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Check size={20} /> Confirm Check-in
          </button>
          <button
            onClick={onCancel}
            className="w-full py-5 bg-muted border border-border rounded-2xl font-bold text-xs uppercase tracking-widest text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
