import { useMemo, useState } from 'react';
import { Lock, Unlock, Users, Shuffle, Undo2, CheckCircle2 } from 'lucide-react';
import type { AllocationGuide } from './AllocationBoard';

// Guide-only allocation view — a separate component from AllocationBoard.tsx (which the owner's
// TodayToursPage also renders) so this phone-first layout (full names, wrapped option text,
// vertically-scrolling columns that stack on narrow screens) can't change the owner's board.
// Same move/lock/balance handlers and data as the owner side — this file is presentation only.
export interface GuideAllocationGuest {
  bookingRef: string;
  displayName: string;
  pax: number;
  optionName: string;
  allottedGuideId: string | null;
  /** Checked-in guests are locked to their current guide (safety rule: check-in = ownership) —
      Balance skips them entirely. Manual move/unassign still works; only the Undo/"send back"
      control below is gated on this, since there's nothing to send back for a guest who was
      never checked in. */
  isCheckedIn: boolean;
}

interface GuideAllocationBoardProps {
  guides: AllocationGuide[];
  /** Every guest currently in the session — checked-in AND not (auto-populated / pre-allotted
      guests included), so Balance has the not-yet-arrived pool to distribute and the board shows
      the full picture. Callers must still exclude cancelled bookings. */
  guests: GuideAllocationGuest[];
  /** Highlights this guide's own column so they can find themselves at a glance. */
  highlightGuideId?: string;
  onMoveGuest: (bookingRef: string, newGuideId: string | null) => void;
  onToggleLock: (guideId: string, locked: boolean) => void;
  onBalance: () => void;
  balancing: boolean;
  /** "Send back" — reverts a wrongly checked-in guest to not-checked-in, same control as the
      Check-in tab's Reset button, surfaced here too so a guide never has to leave the Allocation
      view to undo a mistaken check-in. */
  onUndoCheckin: (bookingRef: string) => void;
}

export default function GuideAllocationBoard({
  guides,
  guests,
  highlightGuideId,
  onMoveGuest,
  onToggleLock,
  onBalance,
  balancing,
  onUndoCheckin,
}: GuideAllocationBoardProps) {
  // Same tap-guest-then-tap-column interaction as AllocationBoard: select a guest, then tap a
  // different column (or the dropdown on the guest's own row) to drop them there.
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  const { byGuide, holding } = useMemo(() => {
    const m = new Map<string, GuideAllocationGuest[]>();
    guides.forEach(g => m.set(g.id, []));
    const unassigned: GuideAllocationGuest[] = [];
    guests.forEach(g => {
      if (g.allottedGuideId && m.has(g.allottedGuideId)) {
        m.get(g.allottedGuideId)!.push(g);
      } else {
        unassigned.push(g);
      }
    });
    return { byGuide: m, holding: unassigned };
  }, [guides, guests]);

  const selectedGuest = selectedRef ? guests.find(g => g.bookingRef === selectedRef) || null : null;

  if (guides.length === 0) {
    return <p className="text-xs text-muted-foreground italic py-2">No guides on this session yet.</p>;
  }

  const holdingPax = holding.reduce((s, g) => s + g.pax, 0);

  const handleGuestTap = (bookingRef: string) => {
    setSelectedRef(prev => (prev === bookingRef ? null : bookingRef));
  };

  const handleColumnTap = (targetGuideId: string | null) => {
    if (!selectedGuest) return;
    if (selectedGuest.allottedGuideId === targetGuideId) {
      setSelectedRef(null);
      return;
    }
    onMoveGuest(selectedGuest.bookingRef, targetGuideId);
    setSelectedRef(null);
  };

  const renderGuestRow = (g: GuideAllocationGuest, columnGuideId: string | null) => {
    const isSelected = selectedRef === g.bookingRef;
    return (
      <div
        key={g.bookingRef}
        onClick={(e) => { e.stopPropagation(); handleGuestTap(g.bookingRef); }}
        className={`rounded-xl px-3 py-2.5 text-xs transition-all cursor-pointer active:scale-[0.99] ${
          isSelected ? 'bg-gold/20 ring-2 ring-gold' : 'bg-muted'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1 min-w-0">
            {g.isCheckedIn && <CheckCircle2 size={13} className="text-green-700 shrink-0" />}
            <span className="font-semibold text-foreground leading-snug break-words">{g.displayName}</span>
          </span>
          <span className="text-gold font-bold shrink-0">{g.pax}</span>
        </div>
        {g.optionName && (
          <p className="text-[10px] text-muted-foreground mt-1 leading-snug break-words">{g.optionName}</p>
        )}
        <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
          <select
            value={columnGuideId || ''}
            onChange={(e) => { onMoveGuest(g.bookingRef, e.target.value || null); setSelectedRef(null); }}
            className="flex-1 min-w-0 min-h-11 bg-background border border-border text-foreground rounded-lg text-[11px] px-2 outline-none"
          >
            <option value="">Unassign</option>
            {guides.map(gg => <option key={gg.id} value={gg.id}>{gg.name}</option>)}
          </select>
          {g.isCheckedIn && (
            <button
              onClick={() => onUndoCheckin(g.bookingRef)}
              title="Send back to not-checked-in"
              className="shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-background border border-border text-muted-foreground hover:text-red-600 hover:border-red-300 active:scale-95 transition-colors"
            >
              <Undo2 size={15} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={onBalance}
          disabled={balancing}
          className="min-h-11 bg-gold text-black px-4 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-gold/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          <Shuffle size={14} /> {balancing ? 'Balancing…' : 'Balance'}
        </button>
      </div>

      {selectedGuest && (
        <p className="text-[11px] text-gold font-bold px-1">
          Moving {selectedGuest.displayName} — tap a column to drop them there, or use its dropdown.
        </p>
      )}

      {/* 1 column on phone (stacked, full width — reads far better than a 250px horizontal-scroll
          strip once names/options wrap to multiple lines), 2 on tablet, 3 on desktop. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {guides.map(guide => {
          const list = byGuide.get(guide.id) || [];
          const total = list.reduce((s, g) => s + g.pax, 0);
          const isSelf = highlightGuideId === guide.id;
          const isValidDropTarget = !!selectedGuest && selectedGuest.allottedGuideId !== guide.id;

          return (
            <div
              key={guide.id}
              onClick={() => handleColumnTap(guide.id)}
              className={`flex flex-col rounded-2xl p-4 space-y-2.5 border transition-all min-w-0 ${
                isSelf ? 'border-gold/40' : 'border-border'
              } ${
                isValidDropTarget ? 'ring-2 ring-gold/40 bg-gold/[0.04] cursor-pointer' : 'bg-card shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-sm truncate text-foreground">{guide.name}</span>
                  {isSelf && <span className="text-[9px] font-black uppercase text-gold shrink-0">You</span>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleLock(guide.id, !guide.locked); }}
                  title={guide.locked ? 'Unlock (include in Balance)' : 'Lock (exclude from Balance)'}
                  className={`min-h-11 min-w-11 flex items-center justify-center rounded-lg transition-colors shrink-0 ${guide.locked ? 'bg-gold/20 text-gold' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                >
                  {guide.locked ? <Lock size={15} /> : <Unlock size={15} />}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gold flex items-center gap-1">
                  <Users size={12} /> {total} pax
                </span>
                {guide.locked && (
                  <span className="text-[9px] font-black uppercase text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                    Locked
                  </span>
                )}
              </div>

              {/* Bounded, always-scrollable — every guest in this column stays reachable no
                  matter how many are allotted, instead of getting cut off at a fixed row count. */}
              <div className="space-y-2 overflow-y-auto max-h-[50vh] sm:max-h-[420px] aurelia-scrollbar">
                {list.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">No guests allotted.</p>
                ) : (
                  list.map(g => renderGuestRow(g, guide.id))
                )}
              </div>
            </div>
          );
        })}

        {/* HOLDING COLUMN — every guest not yet allotted to a guide, checked in or not (e.g. a
            freshly auto-populated late booking, sitting here until someone checks them in or runs
            Balance) */}
        <div
          onClick={() => handleColumnTap(null)}
          className={`flex flex-col rounded-2xl p-4 space-y-2.5 border border-dashed transition-all min-w-0 ${
            selectedGuest && selectedGuest.allottedGuideId !== null
              ? 'ring-2 ring-gold/40 bg-gold/[0.04] border-gold/30 cursor-pointer'
              : 'bg-muted/50 border-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Unallotted</span>
            <span className="text-xs font-bold text-muted-foreground">{holdingPax} pax</span>
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[50vh] sm:max-h-[420px] aurelia-scrollbar">
            {holding.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">Nobody unallotted right now.</p>
            ) : (
              holding.map(g => renderGuestRow(g, null))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
