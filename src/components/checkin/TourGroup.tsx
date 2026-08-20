import { ReactNode } from 'react';
import { Clock } from 'lucide-react';

interface TourGroupProps {
  time: string;
  code: string;
  bookingsCount: number;
  totalPax: number;
  sharedGuideName?: string | null;
  children: ReactNode;
}

export default function TourGroup({ time, code, bookingsCount, totalPax, sharedGuideName, children }: TourGroupProps) {
  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-40 bg-background/80 backdrop-blur-md py-2 px-3 rounded-2xl border border-border flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-gold" />
          <span className="text-foreground">{time}</span>
          <span className="text-muted-foreground/60">·</span>
          <span>{code}</span>
        </div>
        <div>
          {bookingsCount} Bookings &middot; {totalPax} Pax
          {sharedGuideName && (
            <span className="ml-2 text-gold">&middot; {sharedGuideName}</span>
          )}
        </div>
      </div>

      {/* Tight gap between guest rows — the rows themselves are compact now, a generous gap here
          would undo that density. */}
      <div className="space-y-1.5">
        {children}
      </div>
    </div>
  );
}
