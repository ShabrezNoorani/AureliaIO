import { useRef, useState } from 'react';
import { Camera, Check } from 'lucide-react';

interface CheckinConfirmModalProps {
  customerName: string;
  pax: {
    adult?: number | null;
    youth?: number | null;
    child?: number | null;
    infant?: number | null;
  };
  onConfirm: (photoBase64: string | null) => void;
  onCancel: () => void;
}

export default function CheckinConfirmModal({ customerName, pax, onConfirm, onCancel }: CheckinConfirmModalProps) {
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const total = (pax.adult || 0) + (pax.youth || 0) + (pax.child || 0) + (pax.infant || 0);

  const handleCapturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
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
          {photoBase64 ? (
            <img src={photoBase64} className="w-full h-full object-cover" />
          ) : (
            <>
              <Camera size={32} className="text-muted-foreground group-hover:text-gold transition-colors" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ticket Photo (Optional)</span>
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
            onClick={() => onConfirm(photoBase64)}
            className="w-full py-5 bg-gold text-black rounded-2xl font-black text-sm uppercase tracking-[0.1em] shadow-xl shadow-gold/20 active:scale-95 transition-all flex items-center justify-center gap-2"
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
