import { useMemo } from 'react';
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

  if (guides.length === 0) {
    return <p className="text-xs text-gray-500 italic py-2">No guides on this session yet.</p>;
  }

  const holdingPax = holding.reduce((s, g) => s + g.pax, 0);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {guides.map(guide => {
          const list = byGuide.get(guide.id) || [];
          const total = list.reduce((s, g) => s + g.pax, 0);
          const isSelf = highlightGuideId === guide.id;

          return (
            <div
              key={guide.id}
              className={`bg-white/5 border rounded-2xl p-4 space-y-2.5 ${isSelf ? 'border-gold/40' : 'border-white/10'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-sm truncate">{guide.name}</span>
                  {isSelf && <span className="text-[9px] font-black uppercase text-gold shrink-0">You</span>}
                  {guide.locked && (
                    <span className="text-[9px] font-black uppercase text-gray-500 bg-white/5 px-1.5 py-0.5 rounded shrink-0">Locked</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-gold flex items-center gap-1">
                    <Users size={12} /> {total} pax
                  </span>
                  {isOwner && onToggleLock && (
                    <button
                      onClick={() => onToggleLock(guide.id, !guide.locked)}
                      title={guide.locked ? 'Unlock (include in Balance)' : 'Lock (exclude from Balance)'}
                      className={`p-1.5 rounded-lg transition-colors ${guide.locked ? 'bg-gold/20 text-gold' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                    >
                      {guide.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                  )}
                </div>
              </div>

              {list.length === 0 ? (
                <p className="text-[11px] text-gray-600 italic">No guests allotted.</p>
              ) : (
                <div className="space-y-1.5">
                  {list.map(g => (
                    <div key={g.bookingRef} className="flex items-center justify-between gap-2 bg-black/20 rounded-lg px-2.5 py-1.5 text-xs">
                      <span className="font-semibold truncate">{g.displayName}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-gold font-bold">{g.pax}</span>
                        {isOwner && onMoveGuest && (
                          <select
                            value={guide.id}
                            onChange={(e) => onMoveGuest(g.bookingRef, e.target.value || null)}
                            className="bg-[#1a1a1f] border border-white/10 rounded-lg text-[10px] py-1 px-1.5 outline-none max-w-[110px]"
                          >
                            {guides.map(gg => <option key={gg.id} value={gg.id}>{gg.name}</option>)}
                            <option value="">Unassign</option>
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* HOLDING AREA — checked-in guests not yet allotted to any guide */}
      <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-gray-400">Unallotted</span>
          <span className="text-xs font-bold text-gray-500">{holdingPax} pax</span>
        </div>
        {holding.length === 0 ? (
          <p className="text-[11px] text-gray-600 italic">Everyone checked in is allotted.</p>
        ) : (
          <div className="space-y-1.5">
            {holding.map(g => (
              <div key={g.bookingRef} className="flex items-center justify-between gap-2 bg-black/20 rounded-lg px-2.5 py-1.5 text-xs">
                <span className="font-semibold truncate">{g.displayName}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-gold font-bold">{g.pax}</span>
                  {isOwner && onMoveGuest && (
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) onMoveGuest(g.bookingRef, e.target.value); }}
                      className="bg-[#1a1a1f] border border-white/10 rounded-lg text-[10px] py-1 px-1.5 outline-none max-w-[120px]"
                    >
                      <option value="">Assign to…</option>
                      {guides.map(gg => <option key={gg.id} value={gg.id}>{gg.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
