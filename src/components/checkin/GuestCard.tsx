import { useState } from 'react';
import { CheckCircle2, XCircle, Phone, Calendar, Tag, Users, Pencil, Check, X } from 'lucide-react';

export interface GuestCardBooking {
  id: string;
  booking_ref: string;
  customer_name: string;
  customer_phone?: string | null;
  travel_date: string;
  product_name?: string | null;
  product_code?: string | null;
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
  /** Inline passenger-name correction — omit to disable (keeps CheckinApp's public appearance unchanged). */
  editableName?: boolean;
  onSaveName?: (newName: string) => void | Promise<void>;
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
    <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-6 space-y-5 shadow-xl">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black bg-white/10 px-2 py-0.5 rounded text-gold uppercase">{booking.channel || 'OTA'}</span>
            <span className="text-[10px] font-mono text-gray-500 font-bold">{booking.booking_ref}</span>
          </div>

          {editableName ? (
            isEditingName ? (
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveName();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  disabled={savingName}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-lg font-black text-white w-full max-w-[220px] focus:border-gold/50 outline-none disabled:opacity-50"
                />
                <button onClick={saveName} disabled={savingName} className="text-green-400 hover:text-green-300 p-1.5 disabled:opacity-50 shrink-0">
                  <Check size={18} />
                </button>
                <button onClick={() => setIsEditingName(false)} disabled={savingName} className="text-gray-500 hover:text-white p-1.5 disabled:opacity-50 shrink-0">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group/name">
                <h3 className="text-xl font-black leading-tight truncate">{name}</h3>
                <button
                  onClick={startEditing}
                  className="opacity-100 md:opacity-0 md:group-hover/name:opacity-100 text-gray-500 hover:text-gold transition-opacity p-0.5 shrink-0"
                  title="Edit displayed name"
                >
                  <Pencil size={14} />
                </button>
              </div>
            )
          ) : (
            <h3 className="text-xl font-black leading-tight">{name}</h3>
          )}
        </div>
        {isCheckedIn && <div className="bg-green-500/20 p-2 rounded-full"><CheckCircle2 className="text-green-500" size={24} /></div>}
        {isNoShow && <div className="bg-red-500/20 p-2 rounded-full"><XCircle className="text-red-500" size={24} /></div>}
      </div>

      <div className="grid grid-cols-2 gap-y-4 text-[13px] font-bold">
        <div className="flex items-center gap-3 text-gray-400">
          <Phone size={16} />
          <a href={`tel:${booking.customer_phone}`} className="text-white">{booking.customer_phone || 'No phone'}</a>
        </div>
        <div className="flex items-center gap-3 text-gray-400 justify-end">
          <Calendar size={16} />
          <span className="text-white">
            {new Date(booking.travel_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>
        <div className="flex items-center gap-3 text-gray-400">
          <Tag size={16} />
          <span className="text-white truncate max-w-[120px]">{booking.product_name || booking.product_code}</span>
        </div>
        <div className="flex items-center gap-3 text-gray-400 justify-end">
          <Users size={16} />
          <span className="text-white">A:{booking.pax_adult || 0} Y:{booking.pax_youth || 0} C:{booking.pax_child || 0} I:{booking.pax_infant || 0}</span>
        </div>
      </div>

      {guides && onSelectGuide && (
        <div className="pt-2">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2 px-1">Lead Guide</label>
          <select
            value={selectedGuideId || ''}
            onChange={(e) => onSelectGuide(e.target.value)}
            className="w-full bg-white/5 border border-white/10 p-3 rounded-2xl text-sm font-bold focus:border-gold/50 outline-none appearance-none"
            disabled={locked}
          >
            <option value="">-- No guide assigned --</option>
            {guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      {sessions && onMoveToSession && (
        <div className="pt-2">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2 px-1">Move to Session</label>
          <select
            value={currentSessionId || ''}
            onChange={(e) => onMoveToSession(e.target.value || null)}
            className="w-full bg-white/5 border border-white/10 p-3 rounded-2xl text-sm font-bold focus:border-gold/50 outline-none appearance-none"
          >
            <option value="">-- Unassigned --</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {!locked ? (
        <div className="grid grid-cols-2 gap-4 pt-2">
          <button
            onClick={onCheckIn}
            className="bg-gold text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-gold/20 active:scale-95"
          >
            Check In
          </button>
          {onNoShow && (
            <button
              onClick={onNoShow}
              className="bg-red-500/10 border border-red-500/20 text-red-500 py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95"
            >
              No Show
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 py-3 px-4 bg-white/[0.02] rounded-2xl border border-white/5">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
            {isCheckedIn ? 'Checked In' : 'No Show Entry'} &middot; {checkedInAt ? new Date(checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
          {onReset && (
            <button
              onClick={onReset}
              className="text-[10px] font-black uppercase tracking-widest text-red-400/80 hover:text-red-400 shrink-0 py-1 px-2 -my-1 -mr-2"
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
