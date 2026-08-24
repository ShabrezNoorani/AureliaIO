import { X, CalendarRange } from 'lucide-react';
import {
  PNL_DATE_PRESETS, PNL_STATUS_BUCKETS,
  type PnlDatePreset, type PnlStatusBucket,
} from '@/lib/monthlyPnl';

// The shared filter-bar UI for every P&L-style page in the app — date-range presets, status
// multi-select, channel multi-select, and removable active-filter chips. Originally built inline
// for the Analytics page's now-removed Monthly P&L section; extracted here so BreakdownPnlPage.tsx
// (and any future P&L view) reuses the exact same component instead of re-implementing it.

export function TogglePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
        active
          ? 'bg-gold/15 border-gold/40 text-gold'
          : 'bg-muted border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
      }`}
    >
      {children}
    </button>
  );
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold text-[11px] font-bold whitespace-nowrap">
      {label}
      <button onClick={onRemove} className="hover:bg-gold/20 rounded-full p-0.5 transition-colors" title="Remove filter">
        <X size={10} />
      </button>
    </span>
  );
}

export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

const statusLabel = (s: PnlStatusBucket) => (s === 'NO_SHOW' ? 'No Show' : s.charAt(0) + s.slice(1).toLowerCase());

export interface PnlFilterBarProps {
  preset: PnlDatePreset;
  onPresetChange: (p: PnlDatePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
  selectedStatuses: Set<PnlStatusBucket>;
  onToggleStatus: (s: PnlStatusBucket) => void;
  defaultStatuses: PnlStatusBucket[];
  uniqueChannels: string[];
  selectedChannels: Set<string>;
  onToggleChannel: (c: string) => void;
  onClearAll: () => void;
}

export default function PnlFilterBar({
  preset, onPresetChange, customStart, customEnd, onCustomStartChange, onCustomEndChange,
  selectedStatuses, onToggleStatus, defaultStatuses,
  uniqueChannels, selectedChannels, onToggleChannel, onClearAll,
}: PnlFilterBarProps) {
  const dateChipLabel = (() => {
    if (preset === 'all') return null;
    if (preset === 'custom') {
      if (!customStart && !customEnd) return null;
      return `${customStart || '…'} → ${customEnd || '…'}`;
    }
    return PNL_DATE_PRESETS.find((p) => p.value === preset)?.label || null;
  })();

  const statusesAreDefault = setsEqual(selectedStatuses, new Set(defaultStatuses));
  const channelsAreAll = selectedChannels.size === uniqueChannels.length;
  const hasActiveFilters = !!dateChipLabel || !statusesAreDefault || !channelsAreAll;

  return (
    <div className="aurelia-card p-4 mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <CalendarRange size={14} className="text-muted-foreground shrink-0" />
          <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-xl border border-border">
            {PNL_DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => onPresetChange(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                  preset === p.value ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-xs animate-fade-in">
            <input
              type="date"
              className="aurelia-input w-auto py-1.5"
              value={customStart}
              max={customEnd || undefined}
              onChange={(e) => onCustomStartChange(e.target.value)}
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="date"
              className="aurelia-input w-auto py-1.5"
              value={customEnd}
              min={customStart || undefined}
              onChange={(e) => onCustomEndChange(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Status</span>
          <div className="flex flex-wrap gap-1.5">
            {PNL_STATUS_BUCKETS.map((s) => (
              <TogglePill key={s} active={selectedStatuses.has(s)} onClick={() => onToggleStatus(s)}>
                {statusLabel(s)}
              </TogglePill>
            ))}
          </div>
        </div>

        {uniqueChannels.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Channel</span>
            <div className="flex flex-wrap gap-1.5">
              {uniqueChannels.map((c) => (
                <TogglePill key={c} active={selectedChannels.has(c)} onClick={() => onToggleChannel(c)}>
                  {c}
                </TogglePill>
              ))}
            </div>
          </div>
        )}
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
          {dateChipLabel && <FilterChip label={dateChipLabel} onRemove={() => onPresetChange('all')} />}
          {!statusesAreDefault && Array.from(selectedStatuses).map((s) => (
            <FilterChip key={s} label={statusLabel(s)} onRemove={() => onToggleStatus(s)} />
          ))}
          {!channelsAreAll && Array.from(selectedChannels).map((c) => (
            <FilterChip key={c} label={c} onRemove={() => onToggleChannel(c)} />
          ))}
          <button onClick={onClearAll} className="text-[11px] font-bold text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-1">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
