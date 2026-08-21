import { useEffect, useState } from 'react';
import { CloudUpload, CheckCircle2, CloudAlert } from 'lucide-react';
import { useRetryQueueItems } from '@/lib/retryQueue';

/** Small, unobtrusive top-of-screen pill: "N syncing" while the retry queue has work outstanding,
    briefly "All changes saved" right after it drains, then disappears. Never blocks the UI. */
export default function SyncStatusIndicator() {
  const items = useRetryQueueItems();
  const pending = items.length;
  const stuck = items.some((i) => i.stuck);

  const [showSaved, setShowSaved] = useState(false);
  const [everHadPending, setEverHadPending] = useState(false);

  useEffect(() => {
    if (pending > 0) {
      setEverHadPending(true);
      setShowSaved(false);
      return;
    }
    if (!everHadPending) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (pending === 0 && !showSaved) return null;

  if (pending === 0) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-600/10 text-green-700 text-[10px] font-bold uppercase tracking-widest animate-fade-in">
        <CheckCircle2 size={12} /> All changes saved
      </div>
    );
  }

  return (
    <div
      title={items.map((i) => i.label).join(', ')}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
        stuck ? 'bg-red-600/10 text-red-700' : 'bg-amber-600/10 text-amber-700'
      }`}
    >
      {stuck ? <CloudAlert size={12} /> : <CloudUpload size={12} className="animate-pulse" />}
      {pending} syncing{stuck ? ' — check connection' : ''}
    </div>
  );
}
