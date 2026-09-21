import { X } from 'lucide-react';
import type { CompanyGuide } from '@/lib/guideTransfer';

interface TransferTourModalProps {
  sessionLabel: string;
  guides: CompanyGuide[];
  targetId: string;
  onTargetChange: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}

/** Shared "Transfer to another guide" confirm dialog — reused verbatim by GuideHome.tsx and
    GuideCheckin.tsx so a guide sees the exact same hand-off flow wherever they trigger it from. */
export default function TransferTourModal({
  sessionLabel, guides, targetId, onTargetChange, onConfirm, onCancel, submitting,
}: TransferTourModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted">
          <h2 className="font-black text-lg text-foreground">Transfer to another guide</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            {sessionLabel} will move to the guide you pick — it leaves your dashboard and appears on theirs immediately.
          </p>
          {guides.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No other active guides at your company yet.</p>
          ) : (
            <select
              value={targetId}
              onChange={e => onTargetChange(e.target.value)}
              className="aurelia-input w-full bg-muted text-foreground"
            >
              <option value="">-- Choose a guide --</option>
              {guides.map(g => (
                <option key={g.id} value={g.id}>{g.name}{g.guide_number ? ` (${g.guide_number})` : ''}</option>
              ))}
            </select>
          )}
        </div>
        <div className="p-6 border-t border-border bg-muted flex justify-end gap-3">
          <button onClick={onCancel} className="aurelia-ghost-btn px-5 py-2 border border-border text-foreground/80">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!targetId || submitting}
            className="bg-gold text-black px-5 py-2 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50"
          >
            {submitting ? 'Transferring…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
