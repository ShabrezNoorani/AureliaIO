import { Lightbulb } from 'lucide-react';
import { getGuideTips } from '@/lib/guideTips';
import type { GuideOwnScore } from '@/hooks/use-guide-own-score';

/** Short, encouraging tips from this guide's OWN stats only (see lib/guideTips.ts). Deliberately
    ignores rank/topScore — tips never reference other guides. */
export default function GuideTipsCard({ data }: { data: GuideOwnScore }) {
  if (data.loading) return null;
  const tips = getGuideTips({
    unlocked: data.unlocked,
    bookingsCount: data.bookingsCount,
    reviewCount: data.reviewCount,
    band: data.band,
    countedArrivals: data.countedArrivals,
    onTimePct: data.onTimePct,
  });
  if (tips.length === 0) return null;
  return (
    <section className="aurelia-card p-4 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Lightbulb size={14} className="text-gold" />
        <h2 className="text-xs font-bold text-gold uppercase tracking-widest">Tips for you</h2>
      </div>
      <ul className="space-y-2">
        {tips.map(t => (
          <li key={t.id} className="text-sm leading-snug flex gap-2">
            <span className="text-gold shrink-0">•</span>
            <span>{t.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
