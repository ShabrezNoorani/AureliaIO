import { useState } from 'react';
import { Star, X, Trash2, Pencil, Check } from 'lucide-react';
import { computeRatingStats, type GuideRatingRow } from '@/lib/guidePerformance';
import type { RatingEditPayload } from '@/lib/guideRatingActions';

function StarRow({ count, size = 12 }: { count: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5 text-gold shrink-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} className={i < count ? 'fill-gold' : 'opacity-20'} />
      ))}
    </div>
  );
}

interface GuideRatingsPanelProps {
  guideName: string;
  ratings: GuideRatingRow[];
  /** Number of completed tours — only needed to show the review-rate stat alongside average
      rating; omit to hide that stat entirely. */
  toursDoneCount?: number;
  isOwner: boolean;
  onVerify?: (rating: GuideRatingRow) => void | Promise<void>;
  onDelete?: (rating: GuideRatingRow) => void | Promise<void>;
  onEdit?: (rating: GuideRatingRow, next: RatingEditPayload) => void | Promise<void>;
  onAdd?: (payload: RatingEditPayload) => void | Promise<void>;
  /** true = render as an inline section (used inside the owner Guide Detail panel). false/omitted
      = render as a self-contained modal with its own backdrop (used from the Guides page). */
  embedded?: boolean;
  onClose?: () => void;
}

export default function GuideRatingsPanel({
  guideName, ratings, toursDoneCount, isOwner, onVerify, onDelete, onEdit, onAdd, embedded, onClose,
}: GuideRatingsPanelProps) {
  const stats = computeRatingStats(ratings, toursDoneCount ?? 0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const content = (
    <>
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Average Rating</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold">{stats.avgRating != null ? stats.avgRating.toFixed(1) : '—'}</span>
            {stats.avgRating != null && <Star size={16} className="text-gold fill-gold" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{stats.verifiedReviewCount} verified review{stats.verifiedReviewCount !== 1 ? 's' : ''}</p>
        </div>
        {toursDoneCount != null && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Review Rate</p>
            <span className="text-2xl font-extrabold">{stats.reviewRatePct != null ? `${stats.reviewRatePct.toFixed(0)}%` : '—'}</span>
            <p className="text-xs text-muted-foreground mt-0.5">guests who reviewed</p>
          </div>
        )}
      </div>

      {isOwner && onAdd && <AddRatingForm onAdd={onAdd} />}

      <div className="space-y-2">
        {ratings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No ratings yet.</p>
        ) : ratings.map((r) => (
          editingId === r.id ? (
            <EditRatingForm
              key={r.id}
              rating={r}
              onCancel={() => setEditingId(null)}
              onSave={async (next) => { await onEdit?.(r, next); setEditingId(null); }}
            />
          ) : (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 bg-muted rounded-xl p-3">
              <div className="flex items-center gap-3 min-w-0">
                <StarRow count={r.stars} />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">
                    {r.quantity > 1 ? `×${r.quantity} · ` : ''}{r.source || 'General'}
                  </p>
                  {r.note && <p className="text-[10px] text-muted-foreground truncate max-w-[220px]">{r.note}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.verified ? (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-green-600/15 text-green-700">Verified</span>
                ) : isOwner && onVerify ? (
                  <button
                    onClick={() => onVerify(r)}
                    className="text-[9px] font-black uppercase px-2 py-1 rounded-full bg-amber-600/15 text-amber-700 hover:bg-amber-600/25 transition-colors"
                  >
                    Verify
                  </button>
                ) : (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-600/15 text-amber-700">Pending</span>
                )}
                {isOwner && onEdit && (
                  <button onClick={() => setEditingId(r.id)} className="text-muted-foreground hover:text-gold p-1">
                    <Pencil size={13} />
                  </button>
                )}
                {isOwner && onDelete && (
                  <button onClick={() => onDelete(r)} className="text-muted-foreground hover:text-red-700 p-1">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          )
        ))}
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-[24px] w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted shrink-0">
          <h2 className="text-xl font-black">{guideName}'s Reviews</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 aurelia-scrollbar">{content}</div>
      </div>
    </div>
  );
}

function AddRatingForm({ onAdd }: { onAdd: (payload: RatingEditPayload) => void | Promise<void> }) {
  const [stars, setStars] = useState(5);
  const [quantity, setQuantity] = useState(1);
  const [source, setSource] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    setAdding(true);
    await onAdd({ stars, quantity, source: source.trim() || null, note: note.trim() || null });
    setStars(5);
    setQuantity(1);
    setSource('');
    setNote('');
    setAdding(false);
  };

  return (
    <div className="bg-muted p-4 rounded-2xl border border-border space-y-3">
      <h3 className="text-[10px] font-bold text-gold uppercase tracking-widest">Add a Rating</h3>
      <div className="grid grid-cols-2 gap-3">
        <select value={stars} onChange={(e) => setStars(Number(e.target.value))} className="aurelia-input bg-muted appearance-none">
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n !== 1 ? 's' : ''}</option>)}
        </select>
        <input
          type="number" min={1} value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          className="aurelia-input" placeholder="Qty"
        />
      </div>
      <input value={source} onChange={(e) => setSource(e.target.value)} className="aurelia-input text-xs" placeholder="Source (e.g. Viator)" />
      <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="aurelia-input text-xs resize-none" placeholder="Note (optional)" />
      <button onClick={handleAdd} disabled={adding} className="aurelia-gold-btn w-full py-2 text-xs font-bold disabled:opacity-50">
        {adding ? 'Adding…' : 'Add Rating (verified)'}
      </button>
    </div>
  );
}

function EditRatingForm({
  rating, onSave, onCancel,
}: {
  rating: GuideRatingRow;
  onSave: (next: RatingEditPayload) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [stars, setStars] = useState(rating.stars);
  const [quantity, setQuantity] = useState(rating.quantity);
  const [source, setSource] = useState(rating.source || '');
  const [note, setNote] = useState(rating.note || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ stars, quantity, source: source.trim() || null, note: note.trim() || null });
    setSaving(false);
  };

  return (
    <div className="bg-muted rounded-xl p-3 space-y-2 border border-gold/30">
      <div className="grid grid-cols-2 gap-2">
        <select value={stars} onChange={(e) => setStars(Number(e.target.value))} className="aurelia-input text-xs bg-background appearance-none">
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n !== 1 ? 's' : ''}</option>)}
        </select>
        <input
          type="number" min={1} value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          className="aurelia-input text-xs" placeholder="Qty"
        />
      </div>
      <input value={source} onChange={(e) => setSource(e.target.value)} className="aurelia-input text-xs" placeholder="Source" />
      <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="aurelia-input text-xs resize-none" placeholder="Note" />
      <div className="flex gap-2">
        <button onClick={onCancel} disabled={saving} className="flex-1 py-1.5 rounded-lg border border-border text-xs font-bold hover:bg-background transition-colors disabled:opacity-50">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-gold text-black text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50">
          <Check size={12} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
