import { BellRing } from 'lucide-react';
import type { CheckinReminder } from '@/lib/checkinReminder';

/** Friendly in-app nudge on the guide's Today's Check-in view. Renders nothing once every guest is
    checked in (or marked no-show). Needs no notification permission — purely in-page. */
export default function CheckinReminderBanner({ reminder }: { reminder: CheckinReminder | null }) {
  if (!reminder) return null;
  const { guests } = reminder;
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/10 p-4">
      <BellRing size={18} className="shrink-0 mt-0.5 text-gold" />
      <div className="text-sm">
        <p className="font-bold text-foreground">
          You have {guests} guest{guests === 1 ? '' : 's'} not checked in yet
        </p>
        <p className="mt-0.5 text-muted-foreground">Don't forget to check them in when they arrive 👋</p>
      </div>
    </div>
  );
}
