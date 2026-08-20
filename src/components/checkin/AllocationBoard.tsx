import { useState, useMemo } from 'react';
import { Lock, Unlock, Users, Shuffle } from 'lucide-react';

export interface AllocationGuide {
  id: string;
  name: string;
  locked: boolean;
}

export interface AllocationGuest {
  bookingRef: string;
  displayName: string;
  pax: number;
  /** Current guide this guest is allotted to, or null while sitting in the holding area. */
  allottedGuideId: string | null;
}

interface AllocationBoardProps {
  guides: AllocationGuide[];
  /** Checked-in guests only — callers must pre-filter to checked-in bookings. */
  guests: AllocationGuest[];
  /** Owner-only controls (move / lock / balance) — omit entirely for a guide's read-only view. */
  isOwner?: boolean;
  onMoveGuest?: (bookingRef: string, newGuideId: string | null) => void;
  onToggleLock?: (guideId: string, locked: boolean) => void;
  onBalance?: () => void;
  balancing?: boolean;
  /** Guide's own view — highlights their column so they can find themselves at a glance. */
  highlightGuideId?: string;
}

export default function AllocationBoard({
  guides,
  guests,
  isOwner,
  onMoveGuest,
  onToggleLock,
  onBalance,
  balancing,
  highlightGuideId,
}: AllocationBoardProps) {
  // Tap-to-move: tap a guest to select it, then tap a different column to drop it there. Tapping
  // the same guest again (or committing a move) clears the selection. The select dropdown next to
  // each guest keeps working the same way alongside this — neither interaction excludes the other.
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  const canMove = !!(isOwner && onMoveGuest);

  const { byGuide, holding } = useMemo(() => {
    const m = new Map<string, AllocationGuest[]>();
    guides.forEach(g => m.set(g.id, []));
    const unassigned: AllocationGuest[] = [];
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
    return <p className="text-xs text-gray-500 italic py-2">No guides on this session yet.</p>;
  }

  const holdingPax = holding.reduce((s, g) => s + g.pax, 0);

  const handleGuestTap = (bookingRef: string) => {
    if (!canMove) return;
    setSelectedRef(prev => (prev === bookingRef ? null : bookingRef));
  };

  const handleColumnTap = (targetGuideId: string | null) => {
    if (!canMove || !selectedGuest) return;
    if (selectedGuest.allottedGuideId === targetGuideId) {
      setSelectedRef(null);
      return;
    }
    onMoveGuest!(selectedGuest.bookingRef, targetGuideId);
    setSelectedRef(null);
  };

  const renderGuestRow = (g: AllocationGuest, columnGuideId: string | null) => {
    const isSelected = selectedRef === g.bookingRef;
    return (
      <div
        key={g.bookingRef}
        onClick={(e) => { e.stopPropagation(); handleGuestTap(g.bookingRef); }}
        className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs transition-all ${
          isSelected ? 'bg-gold/20 ring-2 ring-gold' : 'bg-black/20'
        } ${canMove ? 'cursor-pointer active:scale-[0.98]' : ''}`}
      >
        <span className="font-semibold truncate">{g.displayName}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-gold font-bold">{g.pax}</span>
          {canMove && (
            <select
              value={columnGuideId || ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { onMoveGuest!(g.bookingRef, e.target.value || null); setSelectedRef(null); }}
              className="bg-[#1a1a1f] border border-white/10 rounded-lg text-[10px] py-1 px-1.5 outline-none max-w-[90px]"
            >
              <option value="">Unassign</option>
              {guides.map(gg => <option key={gg.id} value={gg.id}>{gg.name}</option>)}
            </select>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {isOwner && onBalance && (
        <div className="flex justify-end">
          <button
            onClick={onBalance}
            disabled={balancing}
            className="bg-gold text-black px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-gold/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 shrink-0"
          >
            <Shuffle size={14} /> {balancing ? 'Balancing…' : 'Balance'}
          </button>
        </div>
      )}

      {canMove && selectedGuest && (
        <p className="text-[11px] text-gold font-bold px-1">
          Moving {selectedGuest.displayName} — tap a column to drop them there.
        </p>
      )}

      {/* Side-by-side guide columns — scrolls horizontally on narrow screens instead of wrapping. */}
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
        {guides.map(guide => {
          const list = byGuide.get(guide.id) || [];
          const total = list.reduce((s, g) => s + g.pax, 0);
          const isSelf = highlightGuideId === guide.id;
          const isValidDropTarget = canMove && !!selectedGuest && selectedGuest.allottedGuideId !== guide.id;

          return (
            <div
              key={guide.id}
              onClick={() => handleColumnTap(guide.id)}
              className={`w-[250px] shrink-0 snap-start flex flex-col rounded-2xl p-4 space-y-2.5 border transition-all ${
                isSelf ? 'border-gold/40' : 'border-white/10'
              } ${
                isValidDropTarget ? 'ring-2 ring-gold/40 bg-gold/[0.04] cursor-pointer' : 'bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-sm truncate">{guide.name}</span>
                  {isSelf && <span className="text-[9px] font-black uppercase text-gold shrink-0">You</span>}
                </div>
                {isOwner && onToggleLock && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleLock(guide.id, !guide.locked); }}
                    title={guide.locked ? 'Unlock (include in Balance)' : 'Lock (exclude from Balance)'}
                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${guide.locked ? 'bg-gold/20 text-gold' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                  >
                    {guide.locked ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gold flex items-center gap-1">
                  <Users size={12} /> {total} pax
                </span>
                {guide.locked && (
                  <span className="text-[9px] font-black uppercase text-gray-400 bg-white/10 px-2 py-0.5 rounded-full shrink-0">
                    Locked
                  </span>
                )}
              </div>

              <div className="space-y-1.5 overflow-y-auto max-h-[420px] aurelia-scrollbar">
                {list.length === 0 ? (
                  <p className="text-[11px] text-gray-600 italic">No guests allotted.</p>
                ) : (
                  list.map(g => renderGuestRow(g, guide.id))
                )}
              </div>
            </div>
          );
        })}

        {/* HOLDING COLUMN — checked-in guests not yet allotted to any guide */}
        <div
          onClick={() => handleColumnTap(null)}
          className={`w-[250px] shrink-0 snap-start flex flex-col rounded-2xl p-4 space-y-2.5 border border-dashed transition-all ${
            canMove && selectedGuest && selectedGuest.allottedGuideId !== null
              ? 'ring-2 ring-gold/40 bg-gold/[0.04] border-gold/30 cursor-pointer'
              : 'bg-white/[0.03] border-white/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-gray-400">Unallotted</span>
            <span className="text-xs font-bold text-gray-500">{holdingPax} pax</span>
          </div>
          <div className="space-y-1.5 overflow-y-auto max-h-[420px] aurelia-scrollbar">
            {holding.length === 0 ? (
              <p className="text-[11px] text-gray-600 italic">Everyone checked in is allotted.</p>
            ) : (
              holding.map(g => renderGuestRow(g, null))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
