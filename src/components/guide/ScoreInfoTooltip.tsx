import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';
import { SCORE_BAND_TOOLTIP_ROWS, SCORE_FORMULA_TOOLTIP_TEXT } from '@/lib/guidePerformance';

/**
 * The "i" info button next to a score, on BOTH the guide's own dashboard and the admin dashboard —
 * one shared component so the two can never drift out of sync with each other, or with
 * getScoreBand's actual thresholds (SCORE_BAND_TOOLTIP_ROWS is generated from the same source).
 * Desktop: hover opens it (CSS group, no JS needed for that path). Mobile: tap opens it, tap
 * anywhere outside closes it — plain hover doesn't exist on a touchscreen, so the click handler
 * below is what makes it usable there at all.
 */
export default function ScoreInfoTooltip() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  return (
    // Named group ("scoreinfo") — deliberately NOT the plain Tailwind `group` class. A guide card
    // elsewhere on the page also uses the plain `group` class (for its own unrelated
    // group-hover:text-gold icon effect), and `group-hover:` matches ANY ancestor with that exact
    // class name, nearest or not — so hovering anywhere on the card was quietly opening this
    // tooltip too. Scoping to a uniquely-named group means only THIS tiny wrapper (i.e. the "i"
    // icon itself) can ever trigger the hover-open.
    <div ref={rootRef} className="relative inline-flex group/scoreinfo">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-muted-foreground/60 hover:text-foreground transition-colors"
        aria-label="How the score works"
      >
        <Info size={13} />
      </button>
      <div
        className={`absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-xl border border-border bg-card shadow-2xl p-3.5 text-left transition-opacity ${
          open ? 'opacity-100 visible' : 'opacity-0 invisible group-hover/scoreinfo:opacity-100 group-hover/scoreinfo:visible'
        }`}
      >
        <ul className="space-y-1">
          {SCORE_BAND_TOOLTIP_ROWS.map(row => (
            <li key={row.range} className="text-[11px] leading-snug">
              <span className="font-bold text-foreground">{row.range}</span>
              <span className="text-muted-foreground"> → {row.note}</span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border leading-snug">
          {SCORE_FORMULA_TOOLTIP_TEXT}
        </p>
      </div>
    </div>
  );
}
