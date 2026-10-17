import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localDateStr } from '@/lib/utils';
import {
  LEADERBOARD_METRICS, ADMIN_DEFAULT_FILTER_START, getLeaderboardPeriodBounds,
  getLeaderboardPeriodLabel, stepLeaderboardPeriod,
  type LeaderboardMetric, type LeaderboardPeriod,
} from '@/lib/guidePerformance';

interface LeaderboardControlsProps {
  metric: LeaderboardMetric;
  onMetricChange: (m: LeaderboardMetric) => void;
  period: LeaderboardPeriod;
  onPeriodChange: (p: LeaderboardPeriod) => void;
  /** Tighter sizing for the guide's own compact score-card context (vs. the owner's full-width
      Leaderboard page). */
  compact?: boolean;
}

const PERIOD_MODE_OPTIONS: { mode: LeaderboardPeriod['mode']; label: string }[] = [
  { mode: 'sinceStart', label: 'Since Oct 1' },
  { mode: 'day', label: 'Day' },
  { mode: 'week', label: 'Week' },
  { mode: 'month', label: 'Month' },
];

/**
 * The metric + time-period toggle — one shared component so the owner Leaderboard and a guide's
 * own score card can never drift into offering different options or computing periods
 * differently. Pure controlled component: all state (metric/period) lives in the caller, which
 * also owns re-fetching/recomputing via lib/guidePerformance.ts's getLeaderboardPeriodBounds et al.
 */
export default function LeaderboardControls({
  metric, onMetricChange, period, onPeriodChange, compact,
}: LeaderboardControlsProps) {
  const todayStr = localDateStr();

  const setMode = (mode: LeaderboardPeriod['mode']) => {
    if (mode === period.mode) return;
    onPeriodChange({ mode });
  };

  const canStepForward = (direction: 1) => {
    const next = stepLeaderboardPeriod(period, direction);
    return getLeaderboardPeriodBounds(next).start <= todayStr;
  };

  const pillBase = `font-bold uppercase tracking-widest rounded-lg transition-all ${compact ? 'text-[9px] px-2 py-1' : 'text-[10px] px-3 py-1.5'}`;

  return (
    <div className="space-y-2">
      {/* METRIC */}
      <div className="flex flex-wrap gap-1.5">
        {LEADERBOARD_METRICS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onMetricChange(m.value)}
            className={`${pillBase} ${metric === m.value ? 'bg-gold text-black' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* TIME PERIOD */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIOD_MODE_OPTIONS.map((p) => (
          <button
            key={p.mode}
            type="button"
            onClick={() => setMode(p.mode)}
            className={`${pillBase} ${period.mode === p.mode ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {p.label}
          </button>
        ))}

        {period.mode === 'day' && (
          <input
            type="date"
            min={ADMIN_DEFAULT_FILTER_START}
            max={todayStr}
            value={period.date || todayStr}
            onChange={(e) => onPeriodChange({ mode: 'day', date: e.target.value })}
            className={`aurelia-input appearance-none bg-muted ${compact ? 'text-[10px] py-1 px-1.5' : 'text-xs py-1.5 px-2'}`}
          />
        )}

        {(period.mode === 'week' || period.mode === 'month') && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPeriodChange(stepLeaderboardPeriod(period, -1))}
              className="p-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Earlier ${period.mode}`}
            >
              <ChevronLeft size={compact ? 12 : 14} />
            </button>
            <span className={`font-bold whitespace-nowrap ${compact ? 'text-[9px]' : 'text-xs'}`}>
              {getLeaderboardPeriodLabel(period)}
            </span>
            <button
              type="button"
              disabled={!canStepForward(1)}
              onClick={() => onPeriodChange(stepLeaderboardPeriod(period, 1))}
              className="p-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
              aria-label={`Later ${period.mode}`}
            >
              <ChevronRight size={compact ? 12 : 14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
