import { useState } from 'react';
import { CheckCircle2, XCircle, Phone, MessageCircle, Pencil, Check, X } from 'lucide-react';

export interface GuestCardBooking {
  id: string;
  booking_ref: string;
  customer_name: string;
  customer_phone?: string | null;
  travel_date: string;
  product_name?: string | null;
  product_code?: string | null;
  /** The specific tour option the guest booked — real column: bookings.option_name. */
  option_name?: string | null;
  channel?: string | null;
  pax_adult?: number | null;
  pax_youth?: number | null;
  pax_child?: number | null;
  pax_infant?: number | null;
}

interface GuideOption {
  id: string;
  name: string;
}

interface SessionOption {
  id: string;
  name: string;
}

interface GuestCardProps {
  booking: GuestCardBooking;
  /** Overrides the displayed name when set and non-empty; falls back to booking.customer_name. */
  displayName?: string | null;
  isCheckedIn: boolean;
  isNoShow: boolean;
  checkedInAt?: string | null;
  onCheckIn: () => void;
  onNoShow?: () => void;
  /** Lead-guide reassignment control — omit entirely to hide it (e.g. for a guide's own view). */
  guides?: GuideOption[];
  selectedGuideId?: string;
  onSelectGuide?: (guideId: string) => void;
  /**
   * Inline passenger-name correction — requires BOTH editableName and isOwner, so a guide-facing
   * caller can't accidentally enable it by only setting one. Omit either to keep CheckinApp's and
   * GuideCheckin's appearance unchanged (name is always read-only there).
   */
  editableName?: boolean;
  onSaveName?: (newName: string) => void | Promise<void>;
  /** Owner-only gate — pass true from owner surfaces (Today's Tours). Guides must never pass this. */
  isOwner?: boolean;
  /** Owner-only: move this booking to a different tour session — omit entirely to hide it. */
  sessions?: SessionOption[];
  currentSessionId?: string;
  onMoveToSession?: (sessionId: string | null) => void;
  /** Owner-only: revert a wrongly checked-in/no-show guest back to not-checked-in — omit to hide. */
  onReset?: () => void;
}

export default function GuestCard({
  booking,
  displayName,
  isCheckedIn,
  isNoShow,
  checkedInAt,
  onCheckIn,
  onNoShow,
  guides,
  selectedGuideId,
  onSelectGuide,
  editableName,
  onSaveName,
  isOwner,
  sessions,
  currentSessionId,
  onMoveToSession,
  onReset,
}: GuestCardProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const name = displayName && displayName.trim() ? displayName : booking.customer_name;
  const locked = isCheckedIn || isNoShow;
  const canEditName = !!(editableName && isOwner);

  const startEditing = () => {
    setNameDraft(name);
    setIsEditingName(true);
  };

  const saveName = async () => {
    if (!onSaveName) return;
    setSavingName(true);
    await onSaveName(nameDraft.trim());
    setSavingName(false);
    setIsEditingName(false);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 space-y-px">
      {/* LINE 1 — check state + name (+ owner-only edit pencil) */}
      <div className="flex items-center gap-1.5">
        {isCheckedIn ? (
          <CheckCircle2 size={14} className="text-green-500 shrink-0" />
        ) : isNoShow ? (
          <XCircle size={14} className="text-red-500 shrink-0" />
        ) : (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-600 shrink-0" />
        )}

        {canEditName && isEditingName ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              disabled={savingName}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm font-bold text-white flex-1 min-w-0 focus:border-gold/50 outline-none disabled:opacity-50"
            />
            <button onClick={saveName} disabled={savingName} className="text-green-400 hover:text-green-300 p-1 disabled:opacity-50 shrink-0">
              <Check size={14} />
            </button>
            <button onClick={() => setIsEditingName(false)} disabled={savingName} className="text-gray-500 hover:text-white p-1 disabled:opacity-50 shrink-0">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-1 min-w-0 group/name">
            <span
              className={`text-sm font-bold truncate ${
                isCheckedIn ? 'line-through text-gray-500' : isNoShow ? 'text-gray-500' : 'text-white'
              }`}
            >
              {name}
            </span>
            {canEditName && (
              <button
                onClick={startEditing}
                className="opacity-100 md:opacity-0 md:group-hover/name:opacity-100 text-gray-500 hover:text-gold transition-opacity p-0.5 shrink-0"
                title="Edit displayed name"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* LINE 2 — pax · full tour option (never truncated) · phone */}
      <p className="text-[10px] text-gray-400 leading-tight pl-[19px]">
        <span className="text-gray-300 font-semibold">
          {booking.pax_adult || 0}A {booking.pax_youth || 0}Y {booking.pax_child || 0}C {booking.pax_infant || 0}I
        </span>
        <span className="mx-1 text-gray-600">&middot;</span>
        <span>{booking.option_name || booking.product_name || 'No option'}</span>
        {booking.customer_phone && (
          <>
            <span className="mx-1 text-gray-600">&middot;</span>
            <span>{booking.customer_phone}</span>
          </>
        )}
      </p>

      {/* ACTIONS — compact icons, not full-width bars; checking in toggles this row in place */}
      <div className="flex flex-wrap items-center gap-1 pl-[19px]">
        {booking.customer_phone && (
          <>
            <a
              href={`tel:${booking.customer_phone}`}
              className="p-1 bg-green-500/10 hover:bg-green-500/20 active:scale-95 rounded-md text-green-400 transition-all"
              title="Call"
            >
              <Phone size={12} />
            </a>
            <a
              href={`sms:${booking.customer_phone}`}
              className="p-1 bg-blue-500/10 hover:bg-blue-500/20 active:scale-95 rounded-md text-blue-400 transition-all"
              title="Message"
            >
              <MessageCircle size={12} />
            </a>
          </>
        )}

        {guides && onSelectGuide && (
          <select
            value={selectedGuideId || ''}
            onChange={(e) => onSelectGuide(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-md text-[9px] py-0.5 px-1 outline-none max-w-[84px] disabled:opacity-50"
            disabled={locked}
          >
            <option value="">No guide</option>
            {guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}

        {sessions && onMoveToSession && (
          <select
            value={currentSessionId || ''}
            onChange={(e) => onMoveToSession(e.target.value || null)}
            className="bg-white/5 border border-white/10 rounded-md text-[9px] py-0.5 px-1 outline-none max-w-[92px]"
          >
            <option value="">Unassigned</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        <div className="ml-auto flex items-center gap-1">
          {!locked ? (
            <>
              <button
                onClick={onCheckIn}
                className="flex items-center gap-1 px-2 py-1 bg-gold text-black rounded-md font-black text-[9px] uppercase tracking-wide active:scale-95 transition-all"
              >
                <Check size={11} /> In
              </button>
              {onNoShow && (
                <button
                  onClick={onNoShow}
                  className="p-1 bg-red-500/10 hover:bg-red-500/20 active:scale-95 rounded-md text-red-400 transition-all"
                  title="No Show"
                >
                  <XCircle size={12} />
                </button>
              )}
            </>
          ) : (
            <>
              <span className="text-[9px] font-bold uppercase text-gray-500 tracking-wide whitespace-nowrap">
                {isCheckedIn ? 'Checked in' : 'No show'}
                {checkedInAt ? ` · ${new Date(checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
              {onReset && (
                <button
                  onClick={onReset}
                  className="text-[10px] font-bold uppercase text-red-400/80 hover:text-red-400 transition-colors whitespace-nowrap"
                >
                  Reset
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
