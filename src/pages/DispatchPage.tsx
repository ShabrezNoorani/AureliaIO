import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, Clock, AlertTriangle, Pencil, Check, X, Trash2, CalendarPlus, MessageCircle } from 'lucide-react';
import { buildGoogleCalendarUrl, buildWhatsAppUrl } from '@/lib/tourInvites';
import { reassignSessionBookings } from '@/lib/sessionMoves';
import { localDateStr } from '@/lib/utils';

interface Booking {
  id: string;
  booking_ref: string;
  customer_name: string;
  travel_date: string;
  travel_time: string;
  product_code: string;
  product_name: string;
  option_name: string;
  status: string;
  pax_adult: number;
  pax_youth: number;
  pax_child: number;
  pax_infant: number;
}

interface TourSession {
  id: string;
  user_id: string;
  tour_date: string;
  label: string | null;
  start_time: string | null;
  notes: string | null;
}

interface SessionBookingRow {
  session_id: string;
  booking_ref: string;
  user_id: string;
}

interface SessionGuideRow {
  session_id: string;
  guide_id: string;
  user_id: string;
  status: string;
  offered_at: string | null;
  responded_at: string | null;
  reassigned_from: string | null;
}

interface Guide {
  id: string;
  name: string;
  guide_number: string;
  status: string;
  whatsapp: string | null;
}

interface NaturalGroup {
  key: string;
  travel_time: string;
  product_code: string;
  product_name: string;
  option_name: string;
  bookings: Booking[];
}

const paxTotal = (b: Booking) =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  offered: { label: 'Offered', className: 'bg-amber-500/15 text-amber-400' },
  accepted: { label: 'Accepted', className: 'bg-green-500/15 text-green-400' },
  declined: { label: 'Declined', className: 'bg-red-500/15 text-red-400' },
  reassigned: { label: 'Reassigned', className: 'bg-white/10 text-muted-foreground' },
};

export default function DispatchPage() {
  const { user, profile } = useAuth();

  const [selectedDate, setSelectedDate] = useState(() => localDateStr());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [sessions, setSessions] = useState<TourSession[]>([]);
  const [sessionBookings, setSessionBookings] = useState<SessionBookingRow[]>([]);
  const [sessionGuides, setSessionGuides] = useState<SessionGuideRow[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [newSessionLabel, setNewSessionLabel] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const [bRes, sRes, gRes] = await Promise.all([
      supabase.from('bookings').select('*')
        .eq('user_id', user.id).eq('travel_date', selectedDate)
        .not('status', 'in', '("CANCELLED_EARLY","CANCELLED_LATE")')
        .order('travel_time', { ascending: true }),
      supabase.from('tour_sessions').select('*')
        .eq('user_id', user.id).eq('tour_date', selectedDate)
        .order('start_time', { ascending: true }),
      supabase.from('guides').select('id, name, guide_number, status, whatsapp')
        .eq('user_id', user.id).eq('status', 'active').order('name'),
    ]);

    setBookings(bRes.data || []);
    const sessionsData = sRes.data || [];
    setSessions(sessionsData);
    setGuides(gRes.data || []);

    const sessionIds = sessionsData.map((s: TourSession) => s.id);
    if (sessionIds.length > 0) {
      const [sbRes, sgRes] = await Promise.all([
        supabase.from('session_bookings').select('*').eq('user_id', user.id).in('session_id', sessionIds),
        supabase.from('session_guides').select('*').eq('user_id', user.id).in('session_id', sessionIds),
      ]);
      setSessionBookings(sbRes.data || []);
      setSessionGuides(sgRes.data || []);
    } else {
      setSessionBookings([]);
      setSessionGuides([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    setSelectedGroupKeys(new Set());
    setExpandedGroups(new Set());
  }, [user, selectedDate]);

  const naturalGroups = useMemo<NaturalGroup[]>(() => {
    const map = new Map<string, NaturalGroup>();
    bookings.forEach(b => {
      const time = b.travel_time || 'No Time';
      const code = b.product_code || b.product_name || 'Unknown';
      const opt = b.option_name || 'Standard';
      const key = `${time}|${code}|${opt}`;
      if (!map.has(key)) {
        map.set(key, { key, travel_time: time, product_code: code, product_name: b.product_name || code, option_name: opt, bookings: [] });
      }
      map.get(key)!.bookings.push(b);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.travel_time === 'No Time') return 1;
      if (b.travel_time === 'No Time') return -1;
      return a.travel_time.localeCompare(b.travel_time);
    });
  }, [bookings]);

  const bookingRefToSessionId = useMemo(() => {
    const m = new Map<string, string>();
    sessionBookings.forEach(sb => m.set(sb.booking_ref, sb.session_id));
    return m;
  }, [sessionBookings]);

  const sessionIdToGuideRows = useMemo(() => {
    const m = new Map<string, SessionGuideRow[]>();
    sessionGuides.forEach(sg => {
      const arr = m.get(sg.session_id) || [];
      arr.push(sg);
      m.set(sg.session_id, arr);
    });
    return m;
  }, [sessionGuides]);

  const guideById = useMemo(() => new Map(guides.map(g => [g.id, g])), [guides]);

  const sessionIdToBookings = useMemo(() => {
    const bookingByRef = new Map(bookings.map(b => [b.booking_ref, b]));
    const m = new Map<string, Booking[]>();
    sessionBookings.forEach(sb => {
      const b = bookingByRef.get(sb.booking_ref);
      if (!b) return;
      const arr = m.get(sb.session_id) || [];
      arr.push(b);
      m.set(sb.session_id, arr);
    });
    return m;
  }, [sessionBookings, bookings]);

  const sessionById = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions]);

  const getGroupAssignmentInfo = (group: NaturalGroup) => {
    const assignedSessionIds = group.bookings.map(b => bookingRefToSessionId.get(b.booking_ref));
    const assignedCount = assignedSessionIds.filter(Boolean).length;
    const uniqueSessionIds = Array.from(new Set(assignedSessionIds.filter(Boolean))) as string[];
    return { assignedCount, uniqueSessionIds };
  };

  const toggleGroupSelection = (key: string) => {
    setSelectedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleExpand = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectedGroups = naturalGroups.filter(g => selectedGroupKeys.has(g.key));
  const selectedBookingsFlat = selectedGroups.flatMap(g => g.bookings);
  const selectedTotalPax = selectedBookingsFlat.reduce((s, b) => s + paxTotal(b), 0);
  const selectedDistinctTimes = new Set(selectedGroups.map(g => g.travel_time));
  const selectedDistinctProducts = new Set(selectedGroups.map(g => `${g.product_name} — ${g.option_name}`));

  const defaultLabel = useMemo(() => {
    if (selectedGroups.length === 0) return '';
    if (selectedGroups.length === 1) {
      const g = selectedGroups[0];
      return `${g.product_name} — ${g.option_name}`;
    }
    return selectedGroups.map(g => g.product_name).join(' + ');
  }, [selectedGroups]);

  const reassignBookings = async (refs: string[], targetSessionId: string | null) => {
    if (!user) return;
    await reassignSessionBookings(supabase, user.id, refs, targetSessionId);
  };

  const handleCreateSession = async () => {
    if (!user || selectedGroups.length === 0) return;
    setCreating(true);
    try {
      const refs = selectedBookingsFlat.map(b => b.booking_ref);
      const earliestTime = selectedGroups
        .map(g => g.travel_time)
        .filter(t => t !== 'No Time')
        .sort((a, b) => a.localeCompare(b))[0] || selectedGroups[0].travel_time;

      const label = newSessionLabel.trim() || defaultLabel;

      const { data: newSession, error: sessErr } = await supabase
        .from('tour_sessions')
        .insert({ user_id: user.id, tour_date: selectedDate, label, start_time: earliestTime })
        .select()
        .single();
      if (sessErr || !newSession) throw sessErr || new Error('No session returned');

      await reassignBookings(refs, newSession.id);

      setSelectedGroupKeys(new Set());
      setNewSessionLabel('');
      toast.success(`Session "${label}" created with ${refs.length} booking${refs.length !== 1 ? 's' : ''}`);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleMoveGroupToSession = async (group: NaturalGroup, targetSessionId: string | null) => {
    await reassignBookings(group.bookings.map(b => b.booking_ref), targetSessionId);
    await loadData();
  };

  const handleMoveBookingToSession = async (bookingRef: string, targetSessionId: string | null) => {
    await reassignBookings([bookingRef], targetSessionId);
    await loadData();
  };

  const handleSaveLabel = async (sessionId: string) => {
    await supabase.from('tour_sessions').update({ label: labelDraft.trim() || null }).eq('id', sessionId);
    setEditingLabelId(null);
    await loadData();
  };

  const handleDeleteSession = async (session: TourSession) => {
    if (!confirm(`Delete session "${session.label || 'Untitled Session'}"? Its bookings will become unassigned.`)) return;
    await supabase.from('tour_sessions').delete().eq('id', session.id);
    await loadData();
  };

  // A fresh assignment always starts as an offer the guide must accept or decline.
  const handleOfferGuide = async (sessionId: string, guideId: string) => {
    if (!user) return;
    await supabase.from('session_guides').insert({
      session_id: sessionId,
      guide_id: guideId,
      user_id: user.id,
      status: 'offered',
    });
    await loadData();
  };

  const handleRemoveGuide = async (sessionId: string, guideId: string) => {
    if (!user) return;
    await supabase.from('session_guides').delete().eq('user_id', user.id).eq('session_id', sessionId).eq('guide_id', guideId);
    await loadData();
  };

  // Puts a declined offer back in front of the guide.
  const handleReofferGuide = async (sessionId: string, guideId: string) => {
    if (!user) return;
    await supabase.from('session_guides')
      .update({ status: 'offered', offered_at: new Date().toISOString(), responded_at: null })
      .eq('user_id', user.id).eq('session_id', sessionId).eq('guide_id', guideId);
    await loadData();
  };

  // Builds the calendar invite + a matching WhatsApp confirmation for a confirmed ('accepted') guide.
  // Pure client-side link generation — nothing is sent automatically, no customer names or money involved.
  const buildInviteLinks = (session: TourSession, guide: Guide | undefined, pax: number) => {
    const sessionLabel = session.label || 'your tour';
    const timeLabel = session.start_time || 'time TBD';
    const paxLabel = `${pax} guest${pax !== 1 ? 's' : ''}`;

    const calendarUrl = buildGoogleCalendarUrl({
      title: sessionLabel,
      details: `${sessionLabel} — ${timeLabel} — ${paxLabel}`,
      location: sessionLabel,
      tourDate: session.tour_date,
      startTime: session.start_time,
    });

    const formattedDate = new Date(`${session.tour_date}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
    });
    const message = `Hi ${guide?.name || 'there'}, you're confirmed for ${sessionLabel} on ${formattedDate} at ${timeLabel} (${paxLabel}) with ${profile?.company_name || 'us'}. Calendar invite: ${calendarUrl}`;

    return { calendarUrl, whatsappUrl: buildWhatsAppUrl(guide?.whatsapp, message) };
  };

  return (
    <div className="p-4 md:p-8 pb-32 max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-border/50">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Dispatch</h1>
          <p className="text-muted-foreground text-sm">Build tour sessions from today's bookings and assign guides.</p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarIcon size={16} className="text-gold" />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="aurelia-input w-auto"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>
      ) : (
        <>
          {/* NATURAL GROUPS */}
          <section className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Today's Tours ({naturalGroups.length})</h2>
            {naturalGroups.length === 0 ? (
              <div className="aurelia-card p-12 text-center text-muted-foreground">No bookings for this date.</div>
            ) : (
              <div className="space-y-3">
                {naturalGroups.map(group => {
                  const info = getGroupAssignmentInfo(group);
                  const isSelected = selectedGroupKeys.has(group.key);
                  const isExpanded = expandedGroups.has(group.key);
                  const groupPax = group.bookings.reduce((s, b) => s + paxTotal(b), 0);

                  return (
                    <div key={group.key} className={`aurelia-card p-4 border transition-colors ${isSelected ? 'border-gold/50 bg-gold/5' : 'border-white/5'}`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleGroupSelection(group.key)}
                          className="mt-1.5 w-4 h-4 accent-gold shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gold bg-gold/10 px-2 py-0.5 rounded-full border border-gold/20">{group.travel_time}</span>
                              <span className="font-bold text-sm">
                                {group.product_name} <span className="text-muted-foreground font-normal">—</span> <span className="text-gold">{group.option_name}</span>
                              </span>
                            </div>
                            {info.assignedCount === 0 ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground shrink-0">Unassigned</span>
                            ) : info.assignedCount === group.bookings.length && info.uniqueSessionIds.length === 1 ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 shrink-0">
                                In {sessionById.get(info.uniqueSessionIds[0])?.label || 'Session'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 shrink-0">
                                {info.assignedCount}/{group.bookings.length} assigned
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
                            <span>{group.bookings.length} booking{group.bookings.length !== 1 ? 's' : ''}</span>
                            <span className="text-gold font-bold">{groupPax} pax</span>
                            <button onClick={() => toggleExpand(group.key)} className="text-gold hover:underline font-bold">
                              {isExpanded ? 'Hide' : 'Show'} bookings
                            </button>
                          </div>

                          <div className="flex items-center gap-2 mt-3">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">Move group:</label>
                            <select
                              value=""
                              onChange={e => {
                                const v = e.target.value;
                                if (!v) return;
                                handleMoveGroupToSession(group, v === '__unassign__' ? null : v);
                              }}
                              className="aurelia-input w-auto text-xs py-1"
                            >
                              <option value="">-- choose session --</option>
                              <option value="__unassign__">— Unassign —</option>
                              {sessions.map(s => <option key={s.id} value={s.id}>{s.label || 'Untitled Session'}</option>)}
                            </select>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                              {group.bookings.map(b => {
                                const sid = bookingRefToSessionId.get(b.booking_ref) || '';
                                return (
                                  <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white/[0.02] rounded-lg p-2">
                                    <div className="min-w-0 truncate">
                                      <span className="font-bold text-foreground">{b.customer_name}</span>
                                      <span className="text-muted-foreground font-mono ml-2">{b.booking_ref}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-gold font-bold">{paxTotal(b)} pax</span>
                                      <select
                                        value={sid}
                                        onChange={e => handleMoveBookingToSession(b.booking_ref, e.target.value || null)}
                                        className="aurelia-input w-auto text-[10px] py-1"
                                      >
                                        <option value="">Unassigned</option>
                                        {sessions.map(s => <option key={s.id} value={s.id}>{s.label || 'Untitled Session'}</option>)}
                                      </select>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* CREATE SESSION BAR */}
          {selectedGroupKeys.size > 0 && (
            <div className="sticky bottom-4 z-30 aurelia-card p-4 border border-gold/30 shadow-2xl space-y-3" style={{ backgroundColor: 'hsl(var(--theme-sidebar))' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold">
                  {selectedGroupKeys.size} group{selectedGroupKeys.size !== 1 ? 's' : ''} selected &middot; <span className="text-gold">{selectedTotalPax} total pax</span>
                </div>
                <button onClick={() => setSelectedGroupKeys(new Set())} className="text-xs text-muted-foreground hover:text-white">Clear</button>
              </div>

              {selectedGroupKeys.size > 1 && (
                <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg p-2.5">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    Merging {selectedDistinctTimes.size > 1 ? `${selectedDistinctTimes.size} different times` : 'the same time'}
                    {' '}and {selectedDistinctProducts.size > 1 ? `${selectedDistinctProducts.size} different tours` : 'the same tour'} into one session.
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={newSessionLabel}
                  onChange={e => setNewSessionLabel(e.target.value)}
                  placeholder={defaultLabel || 'Session label'}
                  className="aurelia-input flex-1"
                />
                <button
                  onClick={handleCreateSession}
                  disabled={creating}
                  className="aurelia-gold-btn px-6 py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
                >
                  {creating ? 'Creating…' : 'Create Tour Session'}
                </button>
              </div>
            </div>
          )}

          {/* SESSIONS */}
          <section className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Sessions ({sessions.length})</h2>
            {sessions.length === 0 ? (
              <div className="aurelia-card p-12 text-center text-muted-foreground">No sessions yet — select tours above and create one.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {sessions.map(session => {
                  const sBookings = sessionIdToBookings.get(session.id) || [];
                  const sPax = sBookings.reduce((s, b) => s + paxTotal(b), 0);
                  const sGuideRows = sessionIdToGuideRows.get(session.id) || [];
                  const assignedGuideIds = sGuideRows.map(r => r.guide_id);
                  const isEditingLabel = editingLabelId === session.id;

                  return (
                    <div key={session.id} className="aurelia-card p-5 border border-white/5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {isEditingLabel ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={labelDraft}
                                onChange={e => setLabelDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveLabel(session.id);
                                  if (e.key === 'Escape') setEditingLabelId(null);
                                }}
                                className="aurelia-input text-sm font-bold flex-1"
                              />
                              <button onClick={() => handleSaveLabel(session.id)} className="text-green-400 p-1 shrink-0"><Check size={16} /></button>
                              <button onClick={() => setEditingLabelId(null)} className="text-muted-foreground p-1 shrink-0"><X size={16} /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group/label">
                              <h3 className="font-extrabold text-lg truncate">{session.label || 'Untitled Session'}</h3>
                              <button
                                onClick={() => { setEditingLabelId(session.id); setLabelDraft(session.label || ''); }}
                                className="opacity-100 md:opacity-0 md:group-hover/label:opacity-100 text-muted-foreground hover:text-gold transition-opacity p-0.5 shrink-0"
                                title="Rename session"
                              >
                                <Pencil size={13} />
                              </button>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mt-1">
                            <Clock size={12} />
                            <span>{session.start_time || '—'}</span>
                            <span>&middot;</span>
                            <span>{sBookings.length} booking{sBookings.length !== 1 ? 's' : ''}</span>
                            <span>&middot;</span>
                            <span className="text-gold font-bold">{sPax} pax</span>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteSession(session)} className="text-muted-foreground hover:text-red-400 p-1.5 shrink-0" title="Delete session">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">Assigned Guide(s)</label>
                        <div className="space-y-1.5">
                          {sGuideRows.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No guides offered yet.</p>
                          ) : sGuideRows.map(sg => {
                            const guide = guideById.get(sg.guide_id);
                            const fromGuide = sg.reassigned_from ? guideById.get(sg.reassigned_from) : null;
                            const badge = STATUS_BADGE[sg.status] || STATUS_BADGE.offered;
                            const { calendarUrl, whatsappUrl } = sg.status === 'accepted'
                              ? buildInviteLinks(session, guide, sPax)
                              : { calendarUrl: '', whatsappUrl: null as string | null };
                            return (
                              <div key={sg.guide_id} className="flex flex-wrap items-center justify-between gap-2 bg-white/[0.02] rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className="text-sm font-bold text-foreground truncate">{guide?.name || 'Unknown guide'}</span>
                                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${badge.className}`}>
                                    {badge.label}{sg.status === 'reassigned' ? ` from ${fromGuide?.name || 'another guide'}` : ''}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {sg.status === 'declined' && (
                                    <button
                                      onClick={() => handleReofferGuide(session.id, sg.guide_id)}
                                      className="text-[10px] font-bold text-gold hover:underline px-1.5 py-1"
                                    >
                                      Re-offer
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleRemoveGuide(session.id, sg.guide_id)}
                                    title="Remove guide"
                                    className="text-muted-foreground hover:text-red-400 p-1"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                                {sg.status === 'accepted' && (
                                  <div className="w-full flex flex-wrap items-center gap-2 pt-1.5 mt-0.5 border-t border-white/5">
                                    <a
                                      href={calendarUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-white/10 text-muted-foreground hover:text-gold hover:border-gold/30 transition-colors inline-flex items-center gap-1"
                                    >
                                      <CalendarPlus size={11} /> Add to Calendar
                                    </a>
                                    {whatsappUrl ? (
                                      <a
                                        href={whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-green-500/20 text-green-400 hover:bg-green-500/10 transition-colors inline-flex items-center gap-1"
                                      >
                                        <MessageCircle size={11} /> Send WhatsApp
                                      </a>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5">
                                        <button
                                          disabled
                                          title="This guide has no WhatsApp number on file"
                                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-white/10 text-muted-foreground/40 cursor-not-allowed inline-flex items-center gap-1"
                                        >
                                          <MessageCircle size={11} /> Send WhatsApp
                                        </button>
                                        <span className="text-[9px] text-muted-foreground italic">no WhatsApp number</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <select
                          value=""
                          onChange={e => { const v = e.target.value; if (v) handleOfferGuide(session.id, v); }}
                          className="aurelia-input w-auto text-xs py-1.5 mt-2"
                        >
                          <option value="">+ Offer a guide…</option>
                          {guides.filter(g => !assignedGuideIds.includes(g.id)).map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5 max-h-56 overflow-y-auto aurelia-scrollbar">
                        {sBookings.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No bookings in this session.</p>
                        ) : sBookings.map(b => (
                          <div key={b.id} className="flex items-center justify-between gap-2 text-xs bg-white/[0.02] rounded-lg p-2">
                            <div className="min-w-0 truncate">
                              <span className="font-bold text-foreground">{b.customer_name}</span>
                              <span className="text-muted-foreground font-mono ml-2">{b.booking_ref}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-gold font-bold">{paxTotal(b)}</span>
                              <button onClick={() => handleMoveBookingToSession(b.booking_ref, null)} title="Remove from session" className="text-muted-foreground hover:text-red-400 p-1">
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
