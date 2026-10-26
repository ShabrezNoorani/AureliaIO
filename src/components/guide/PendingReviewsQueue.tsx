import { useState } from 'react';
import { Star, Check, X } from 'lucide-react';
import type { GuideReviewRow } from '@/lib/guidePerformance';

interface PendingReviewsQueueProps {
  reviews: GuideReviewRow[];
  guides: { id: string; name: string }[];
  onApprove: (r: GuideReviewRow) => Promise<void>;
  onReject: (r: GuideReviewRow) => Promise<void>;
}

/**
 * Owner-only queue of guide-submitted reviews waiting for approval. Nothing here counts toward
 * any score or the leaderboard until it's approved. Approve = counts like an owner-entered review;
 * Reject = discarded. Renders nothing when the queue is empty.
 */
export default function PendingReviewsQueue({ reviews, guides, onApprove, onReject }: PendingReviewsQueueProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (reviews.length === 0) return null;

  const run = async (r: GuideReviewRow, action: (r: GuideReviewRow) => Promise<void>) => {
    setBusyId(r.id);
    try { await action(r); } finally { setBusyId(null); }
  };

  const sorted = [...reviews].sort((a, b) => (b.review_date || '').localeCompare(a.review_date || ''));

  return (
    <section className="aurelia-card p-5 border-l-[3px] border-l-amber-500 space-y-3">
      <div>
        <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
          Reviews awaiting approval ({reviews.length})
        </h2>
        <p className="text-xs text-muted-foreground mt-1">Submitted by guides. They don't count toward any score or the leaderboard until you approve them.</p>
      </div>
      <div className="space-y-2">
        {sorted.map(r => {
          const guideName = guides.find(g => g.id === r.guide_id)?.name || 'Unknown guide';
          const busy = busyId === r.id;
          return (
            <div key={r.id} className="rounded-xl border border-border bg-muted/40 p-3.5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <div className="flex items-center gap-0.5 text-gold">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={12} className={i < r.stars ? 'fill-gold' : 'opacity-20'} />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-foreground">{guideName}</span>
                  {r.platform && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">{r.platform}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground font-mono">{r.review_date}</span>
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-600/15 text-amber-700">Submitted by guide</span>
                </div>
                {r.reviewer_name && <p className="text-xs font-semibold text-foreground/80">{r.reviewer_name}</p>}
                {r.comment && <p className="text-xs text-muted-foreground mt-0.5">{r.comment}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => run(r, onApprove)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase bg-green-600/15 text-green-700 hover:bg-green-600/25 disabled:opacity-50 transition-colors"
                >
                  <Check size={13} /> Approve
                </button>
                <button
                  onClick={() => run(r, onReject)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase bg-red-600/10 text-red-700 hover:bg-red-600/20 disabled:opacity-50 transition-colors"
                >
                  <X size={13} /> Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
