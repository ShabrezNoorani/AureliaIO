import { MapPin, CheckCircle2, CloudAlert } from 'lucide-react';

interface GuideArrivalCardProps {
  /** Formatted status once recorded ("Arrived 8:58 — on time"); null until the guide arrives. */
  status: string | null;
  /** True while the location fix / write is in flight, straight after the tap. */
  pending: boolean;
  /** True when this arrival's write has been retrying in the background for several minutes. */
  syncStuck?: boolean;
  onArrive: () => void;
}

export default function GuideArrivalCard({ status, pending, syncStuck, onArrive }: GuideArrivalCardProps) {
  if (status) {
    return (
      <div className="flex items-center gap-2.5 bg-green-600/10 border border-green-600/20 rounded-2xl px-4 py-3">
        <CheckCircle2 size={18} className="text-green-700 shrink-0" />
        <span className="text-sm font-black text-green-700">{status}</span>
        {syncStuck && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
            <CloudAlert size={12} /> Syncing
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onArrive}
      disabled={pending}
      className="w-full bg-gold text-black py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-all"
    >
      <MapPin size={16} />
      {pending ? 'Recording…' : "I've arrived"}
    </button>
  );
}
