import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, Clock, AlertTriangle, Pencil, Check, X, Trash2, CalendarPlus, MessageCircle, Repeat } from 'lucide-react';
import { buildGuideInviteLinks } from '@/lib/tourInvites';
import { reassignSessionBookings } from '@/lib/sessionMoves';
import { localDateStr, shortProductCode, isCancelled, checkinTime } from '@/lib/utils';

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
  base_pay: number | null;
  bonus: number | null;
  checkin_time: string | null;
}

interface Guide {
  id: string;
  name: string;
  guide_number: string;
  status: string;
  whatsapp: string | null;
  email: string | null;
  base_rate: number | null;
}

interface NaturalGroup {
  key: string;
  travel_time: string;
  // RAW booking.product_code — may be null when a booking genuinely has none. Never the long
  // product_name; always run through shortProductCode() (see groupLabel below) before display.
  product_code: string | null;
  option_name: string;
  bookings: Booking[];
}

const paxTotal = (b: Booking) =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);

// The ONE way a tour/group/session gets labeled on this page: short product code (never the long
// product_name) + " — " + option name. shortProductCode() already falls back to the raw
// product_code when it doesn't match the trailing P/G+digits pattern — 'Unknown' only covers a
// genuinely missing product_code, never a substitution of product_name for the code. Exported
// purely so it's independently testable (see DispatchPage.groupLabel.test.ts).
export const groupLabel = (g: { product_code: string | null; option_name: string }) =>
  `${shortProductCode(g.product_code) || 'Unknown'} — ${g.option_name}`;

// 'offered'/'declined'/'reassigned' can still appear as a STATUS on rows created before
// assignment became immediate — kept here purely so any such historical row still renders
// sensibly, never produced by this page anymore. A row this page DOES produce can still carry
// reassigned_from (set by handleReassignGuide, or by a guide's own reassign_my_slot transfer)
// while its status stays 'accepted' — every other page filters strictly on status === 'accepted'
// to mean "actively assigned", so a status of 'reassigned' would make the new guide invisible to
// their own dashboard. See the reassigned_from check below the badge for how that's shown instead.
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  offered: { label: 'Offered', className: 'bg-amber-600/15 text-amber-700' },
  accepted: { label: 'Assigned', className: 'bg-green-600/15 text-green-700' },
  declined: { label: 'Declined', className: 'bg-red-600/15 text-red-700' },
  reassigned: { label: 'Reassigned', className: 'bg-muted text-muted-foreground' },
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

  // Which guide row currently has its inline "Reassign to…" picker open — keyed
  // `${sessionId}:${guideId}` so two sessions' rows never collide.
  const [reassigningKey, setReassigningKey] = useState<string | null>(null);

  // Guards every setState below against firing after this page has unmounted, or after the
  // selected date has moved on mid-fetch.
  const mountedRef = useRef(true);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const [bRes, sRes, gRes] = await Promise.all([
      // Cancelled bookings are fetched too (not filtered out) — Dispatch shows them, struck
      // through and unselectable, rather than making them silently disappear from the day.
      supabase.from('bookings').select('*')
        .eq('user_id', user.id).eq('travel_date', selectedDate)
        .order('travel_time', { ascending: true }),
      supabase.from('tour_sessions').select('*')
        .eq('user_id', user.id).eq('tour_date', selectedDate)
        .order('start_time', { ascending: true }),
      supabase.from('guides').select('id, name, guide_number, status, whatsapp, email, base_rate')
        .eq('user_id', user.id).eq('status', 'active').order('name'),
    ]);
    if (!mountedRef.current) return;

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
      if (!mountedRef.current) return;
      setSessionBookings(sbRes.data || []);
      setSessionGuides(sgRes.data || []);
    } else {
      setSessionBookings([]);
      setSessionGuides([]);
    }

    setLoading(false);
  };

  // Lightweight, silent refresh of just the guide roster — used as the target of the realtime
  // subscription below. Session composition (which sessions exist) never depends on
  // session_guides, only on tour_sessions/bookings, so a targeted refetch is correct here (unlike
  // the guide-facing pages, where a guide's own session SET can change).
  const refreshSessionGuides = async () => {
    if (!user) return;
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) {
      setSessionGuides([]);
      return;
    }
    const { data } = await supabase.from('session_guides').select('*').eq('user_id', user.id).in('session_id', sessionIds);
    if (!mountedRef.current) return;
    setSessionGuides(data || []);
  };

  // Keeps the realtime subscription below always calling the LATEST refresher — it closes over
  // `sessions`, which changes on every date switch, far more often than the subscription itself
  // needs to re-establish.
  const refreshSessionGuidesRef = useRef(refreshSessionGuides);
  refreshSessionGuidesRef.current = refreshSessionGuides;

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    setSelectedGroupKeys(new Set());
    setExpandedGroups(new Set());
    return () => {
      mountedRef.current = false;
    };
  }, [user, selectedDate]);

  // Live: an assignment, reassignment or guide-initiated transfer (reassign_my_slot) reflects
  // here without a manual refresh — whether it came from this owner, another browser tab, or a
  // guide transferring their own tour away.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`dispatch-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_guides', filter: `user_id=eq.${user.id}` },
        () => { refreshSessionGuidesRef.current(); })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const naturalGroups = useMemo<NaturalGroup[]>(() => {
    const map = new Map<string, NaturalGroup>();
    bookings.forEach(b => {
      const time = b.travel_time || 'No Time';
      // The GROUPING key still falls back to product_name when product_code is missing, purely so
      // two genuinely different tours that both lack a code don't get merged into one "Unknown"
      // bucket — but the group's own product_code field (below, what actually gets displayed) is
      // always the raw value, never product_name.
      const groupingKeyCode = b.product_code || b.product_name || 'Unknown';
      const opt = b.option_name || 'Standard';
      const key = `${time}|${groupingKeyCode}|${opt}`;
      if (!map.has(key)) {
        map.set(key, { key, travel_time: time, product_code: b.product_code || null, option_name: opt, bookings: [] });
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
    // Assignment status is computed over assignable (non-cancelled) bookings only, so a group
    // that's fully assigned except for a cancelled guest still reads as fully assigned.
    const assignableBookings = group.bookings.filter(b => !isCancelled(b.status));
    const assignedSessionIds = assignableBookings.map(b => bookingRefToSessionId.get(b.booking_ref));
    const assignedCount = assignedSessionIds.filter(Boolean).length;
    const uniqueSessionIds = Array.from(new Set(assignedSessionIds.filter(Boolean))) as string[];
    return { assignedCount, assignableCount: assignableBookings.length, uniqueSessionIds };
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
  // Cancelled bookings never get built into a session — filtered out here so both the "create
  // session" refs and the displayed total pax exclude them.
  const selectedBookingsFlat = selectedGroups.flatMap(g => g.bookings.filter(b => !isCancelled(b.status)));
  const selectedTotalPax = selectedBookingsFlat.reduce((s, b) => s + paxTotal(b), 0);
  const selectedDistinctTimes = new Set(selectedGroups.map(g => g.travel_time));
  const selectedDistinctProducts = new Set(selectedGroups.map(g => groupLabel(g)));

  const defaultLabel = useMemo(() => {
    if (selectedGroups.length === 0) return '';
    if (selectedGroups.length === 1) {
      return groupLabel(selectedGroups[0]);
    }
    return selectedGroups.map(g => shortProductCode(g.product_code) || 'Unknown').join(' + ');
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
    // Assigning to a session excludes cancelled bookings (never added); unassigning clears the
    // whole group, including any cancelled booking left over from before it was cancelled.
    const refs = targetSessionId
      ? group.bookings.filter(b => !isCancelled(b.status)).map(b => b.booking_ref)
      : group.bookings.map(b => b.booking_ref);
    await reassignBookings(refs, targetSessionId);
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

  // Clears any session_bookings.allotted_guide_id pointing at this guide, for this session —
  // called whenever a guide leaves a session's roster (removed, or reassigned away) so no guest
  // is ever left pointing at a guide who's no longer on the tour. The guest becomes unallotted,
  // not deleted — still checkinable/re-allottable via the normal Allocation board afterward.
  const unallotGuideFromSession = async (sessionId: string, guideId: string) => {
    if (!user) return;
    await supabase.from('session_bookings')
      .update({ allotted_guide_id: null })
      .eq('user_id', user.id).eq('session_id', sessionId).eq('allotted_guide_id', guideId);
  };

  // Assignment is immediate — no accept/decline step. The guide is on the hook for this tour
  // the moment the owner picks them; 'accepted' is the status every other query (Today's Tours,
  // guide check-in, the guide dashboard) already treats as "actively working this session".
  // base_pay pre-fills from the guide's own base_rate (0 if they don't have one set) — the owner
  // can override it, and bonus, right there in the roster row afterward (see handleUpdateGuidePay).
  const handleAssignGuide = async (sessionId: string, guideId: string) => {
    if (!user) return;
    const guide = guideById.get(guideId);
    const session = sessions.find(s => s.id === sessionId);
    await supabase.from('session_guides').insert({
      session_id: sessionId,
      guide_id: guideId,
      user_id: user.id,
      status: 'accepted',
      responded_at: new Date().toISOString(),
      base_pay: guide?.base_rate ?? 0,
      bonus: 0,
      checkin_time: checkinTime(session?.start_time ?? null),
    });
    await loadData();
  };

  const handleRemoveGuide = async (sessionId: string, guideId: string) => {
    if (!user) return;
    await unallotGuideFromSession(sessionId, guideId);
    await supabase.from('session_guides').delete().eq('user_id', user.id).eq('session_id', sessionId).eq('guide_id', guideId);
    await loadData();
  };

  // Moves a session from one guide straight to another in one action — remove-then-add would
  // leave a moment where the session shows no guide at all, and would need two separate confirms.
  // The new row lands with status 'accepted' just like a fresh assignment (base_pay pre-filled
  // from the NEW guide's own base_rate, same as a plain assignment), so the calendar/WhatsApp send
  // below renders for the new guide immediately, no extra step required.
  const handleReassignGuide = async (sessionId: string, fromGuideId: string, toGuideId: string) => {
    if (!user || fromGuideId === toGuideId) return;
    await unallotGuideFromSession(sessionId, fromGuideId);
    await supabase.from('session_guides').delete().eq('user_id', user.id).eq('session_id', sessionId).eq('guide_id', fromGuideId);
    const toGuide = guideById.get(toGuideId);
    const session = sessions.find(s => s.id === sessionId);
    await supabase.from('session_guides').insert({
      session_id: sessionId,
      guide_id: toGuideId,
      user_id: user.id,
      status: 'accepted',
      responded_at: new Date().toISOString(),
      reassigned_from: fromGuideId,
      base_pay: toGuide?.base_rate ?? 0,
      bonus: 0,
      checkin_time: checkinTime(session?.start_time ?? null),
    });
    await loadData();
  };

  // Owner can edit a guide's pay at any time, not just at assignment — a small single-row write,
  // awaited directly (same pattern as the lock toggle elsewhere in this app), then a targeted
  // roster refetch so the edit reflects immediately without a full page reload.
  const handleUpdateGuidePay = async (sessionId: string, guideId: string, field: 'base_pay' | 'bonus', value: number) => {
    if (!user) return;
    await supabase.from('session_guides')
      .update({ [field]: value })
      .eq('user_id', user.id).eq('session_id', sessionId).eq('guide_id', guideId);
    await refreshSessionGuides();
  };

  // Owner override of one guide's own check-in time on this session (e.g. a coordinator arriving
  // earlier than the rest of the team). Same small-write-then-targeted-refetch pattern as pay.
  const handleUpdateGuideCheckinTime = async (sessionId: string, guideId: string, value: string) => {
    if (!user) return;
    await supabase.from('session_guides')
      .update({ checkin_time: value || null })
      .eq('user_id', user.id).eq('session_id', sessionId).eq('guide_id', guideId);
    await refreshSessionGuides();
  };

  // Owner can change the session's tour time anytime, from a plain phone-friendly time input.
  // Any guide whose check-in time still matches the OLD default (tour − 15, computed via
  // checkinTime()) — or who was never given one at all — is offered a one-tap recompute to the
  // NEW default. A guide the owner has manually overridden (checkin_time present and NOT equal to
  // the old default) is deliberately left untouched, per the "never overwrite an override" rule.
  const handleUpdateSessionTourTime = async (sessionId: string, newStartTime: string) => {
    if (!user) return;
    const session = sessions.find(s => s.id === sessionId);
    const oldStartTime = session?.start_time ?? null;
    if (!newStartTime || newStartTime === oldStartTime) return;

    await supabase.from('tour_sessions').update({ start_time: newStartTime }).eq('id', sessionId);

    const oldDefault = checkinTime(oldStartTime);
    const newDefault = checkinTime(newStartTime);
    const onDefault = sessionGuides.filter(sg =>
      sg.session_id === sessionId && sg.status === 'accepted' && (!sg.checkin_time || sg.checkin_time === oldDefault)
    );

    if (newDefault && onDefault.length > 0 && confirm(
      `Update check-in time for ${onDefault.length} guide${onDefault.length !== 1 ? 's' : ''} still on the default (tour − 15 min) to match the new tour time? Guides with a manually-set check-in time won't be touched.`
    )) {
      await Promise.all(onDefault.map(sg =>
        supabase.from('session_guides').update({ checkin_time: newDefault })
          .eq('user_id', user.id).eq('session_id', sessionId).eq('guide_id', sg.guide_id)
      ));
    }
    await loadData();
  };

  // Builds the calendar invite + a matching WhatsApp confirmation for a confirmed ('accepted')
  // guide — thin wrapper around the shared builder (lib/tourInvites.ts) so TodayToursPage.tsx
  // sends the exact same wording/links from its own assigned-guide view.
  const buildInviteLinks = (session: TourSession, guide: Guide | undefined, pax: number) =>
    buildGuideInviteLinks(session, guide, pax, profile?.company_name);

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
                  const cancelledCount = group.bookings.filter(b => isCancelled(b.status)).length;
                  // Cancelled pax never counts toward the total used to build/balance a session.
                  const groupPax = group.bookings.reduce((s, b) => s + (isCancelled(b.status) ? 0 : paxTotal(b)), 0);
                  const groupSelectable = info.assignableCount > 0;

                  return (
                    <div key={group.key} className={`aurelia-card p-4 border transition-colors ${isSelected ? 'border-gold/50 bg-gold/5' : 'border-border'}`}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleGroupSelection(group.key)}
                          disabled={!groupSelectable}
                          title={!groupSelectable ? 'All bookings in this group are cancelled' : undefined}
                          className="mt-1.5 w-4 h-4 accent-gold shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gold bg-gold/10 px-2 py-0.5 rounded-full border border-gold/20">{group.travel_time}</span>
                              <span className="font-bold text-sm">
                                {shortProductCode(group.product_code) || 'Unknown'} <span className="text-muted-foreground font-normal">—</span> <span className="text-gold">{group.option_name}</span>
                              </span>
                            </div>
                            {info.assignableCount === 0 ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">All cancelled</span>
                            ) : info.assignedCount === 0 ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">Unassigned</span>
                            ) : info.assignedCount === info.assignableCount && info.uniqueSessionIds.length === 1 ? (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-600/15 text-green-700 shrink-0">
                                In {sessionById.get(info.uniqueSessionIds[0])?.label || 'Session'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-600/15 text-amber-700 shrink-0">
                                {info.assignedCount}/{info.assignableCount} assigned
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
                            <span>{group.bookings.length} booking{group.bookings.length !== 1 ? 's' : ''}</span>
                            <span className="text-gold font-bold">{groupPax} pax</span>
                            {cancelledCount > 0 && (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-600/10 text-red-700/80">
                                {cancelledCount} cancelled
                              </span>
                            )}
                            <button onClick={() => toggleExpand(group.key)} className="text-gold hover:underline font-bold">
                              {isExpanded ? 'Hide' : 'Show'} bookings
                            </button>
                          </div>

                          <div className="flex items-center gap-2 mt-3">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">Move group:</label>
                            <select
                              value=""
                              disabled={!groupSelectable}
                              title={!groupSelectable ? 'All bookings in this group are cancelled' : undefined}
                              onChange={e => {
                                const v = e.target.value;
                                if (!v) return;
                                handleMoveGroupToSession(group, v === '__unassign__' ? null : v);
                              }}
                              className="aurelia-input w-auto text-xs py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <option value="">-- choose session --</option>
                              <option value="__unassign__">— Unassign —</option>
                              {sessions.map(s => <option key={s.id} value={s.id}>{s.label || 'Untitled Session'}</option>)}
                            </select>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t border-border pt-3">
                              {group.bookings.map(b => {
                                const sid = bookingRefToSessionId.get(b.booking_ref) || '';
                                const cancelled = isCancelled(b.status);
                                return (
                                  <div key={b.id} className={`flex flex-wrap items-center justify-between gap-2 text-xs rounded-lg p-2 ${cancelled ? 'bg-muted/50' : 'bg-muted'}`}>
                                    <div className="min-w-0 truncate flex items-center gap-2">
                                      <span className={`font-bold ${cancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{b.customer_name}</span>
                                      <span className={`font-mono ${cancelled ? 'line-through text-muted-foreground/70' : 'text-muted-foreground'}`}>{b.booking_ref}</span>
                                      {cancelled && (
                                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-600/10 text-red-700/80 shrink-0">Cancelled</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className={`font-bold ${cancelled ? 'text-muted-foreground line-through' : 'text-gold'}`}>{paxTotal(b)} pax</span>
                                      {cancelled ? (
                                        <span className="text-[10px] text-muted-foreground italic px-1">Not assignable</span>
                                      ) : (
                                        <select
                                          value={sid}
                                          onChange={e => handleMoveBookingToSession(b.booking_ref, e.target.value || null)}
                                          className="aurelia-input w-auto text-[10px] py-1"
                                        >
                                          <option value="">Unassigned</option>
                                          {sessions.map(s => <option key={s.id} value={s.id}>{s.label || 'Untitled Session'}</option>)}
                                        </select>
                                      )}
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
                <button onClick={() => setSelectedGroupKeys(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
              </div>

              {selectedGroupKeys.size > 1 && (
                <div className="flex items-start gap-2 text-xs bg-amber-600/10 border border-amber-600/20 text-amber-700 rounded-lg p-2.5">
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
                  // Defensive: a booking assigned before being cancelled must not count toward
                  // the pax total used to balance/offer guides for this session.
                  const sPax = sBookings.reduce((s, b) => s + (isCancelled(b.status) ? 0 : paxTotal(b)), 0);
                  const sGuideRows = sessionIdToGuideRows.get(session.id) || [];
                  const assignedGuideIds = sGuideRows.map(r => r.guide_id);
                  const isEditingLabel = editingLabelId === session.id;
                  // Owner-visible total (task 5: "show owner totals") — sum of every assigned
                  // guide's base_pay+bonus on this session, regardless of status badge.
                  const sGuideCost = sGuideRows.reduce((s, sg) => s + (Number(sg.base_pay) || 0) + (Number(sg.bonus) || 0), 0);

                  return (
                    <div key={session.id} className="aurelia-card p-5 border border-border space-y-4">
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
                              <button onClick={() => handleSaveLabel(session.id)} className="text-green-700 p-1 shrink-0"><Check size={16} /></button>
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
                            <span>Default check-in {checkinTime(session.start_time) || '—'}</span>
                            <span>&middot;</span>
                            <span className="inline-flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                              Tour
                              <input
                                key={`tour-time-${session.id}-${session.start_time}`}
                                type="time"
                                defaultValue={session.start_time || ''}
                                onBlur={e => {
                                  const v = e.target.value;
                                  if (v) handleUpdateSessionTourTime(session.id, v);
                                }}
                                className="aurelia-input text-xs py-1.5 px-2 min-h-[34px] w-[104px]"
                              />
                            </span>
                            <span>&middot;</span>
                            <span>{sBookings.length} booking{sBookings.length !== 1 ? 's' : ''}</span>
                            <span>&middot;</span>
                            <span className="text-gold font-bold">{sPax} pax</span>
                            {sGuideCost > 0 && (
                              <>
                                <span>&middot;</span>
                                <span className="text-muted-foreground font-bold" title="Total guide pay (base + bonus)">€{sGuideCost.toLocaleString()} guide cost</span>
                              </>
                            )}
                          </div>
                        </div>
                        <button onClick={() => handleDeleteSession(session)} className="text-muted-foreground hover:text-red-700 p-1.5 shrink-0" title="Delete session">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">Assigned Guide(s)</label>
                        <div className="space-y-1.5">
                          {sGuideRows.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No guides assigned yet.</p>
                          ) : sGuideRows.map(sg => {
                            const guide = guideById.get(sg.guide_id);
                            const fromGuide = sg.reassigned_from ? guideById.get(sg.reassigned_from) : null;
                            const badge = STATUS_BADGE[sg.status] || STATUS_BADGE.offered;
                            const { calendarUrl, whatsappUrl, hasGuestEmail } = sg.status === 'accepted'
                              ? buildInviteLinks(session, guide, sPax)
                              : { calendarUrl: '', whatsappUrl: null as string | null, hasGuestEmail: false };
                            return (
                              <div key={sg.guide_id} className="flex flex-wrap items-center justify-between gap-2 bg-muted rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span className="text-sm font-bold text-foreground truncate">{guide?.name || 'Unknown guide'}</span>
                                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${badge.className}`}>
                                    {badge.label}{sg.reassigned_from ? ` — from ${fromGuide?.name || 'another guide'}` : ''}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => setReassigningKey(reassigningKey === `${session.id}:${sg.guide_id}` ? null : `${session.id}:${sg.guide_id}`)}
                                    title="Reassign to another guide"
                                    className="text-muted-foreground hover:text-gold p-1"
                                  >
                                    <Repeat size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveGuide(session.id, sg.guide_id)}
                                    title="Remove guide"
                                    className="text-muted-foreground hover:text-red-700 p-1"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                                {/* Editable pay — pre-filled from guide.base_rate at assignment (see
                                    handleAssignGuide), adjustable here anytime. Uncontrolled inputs
                                    keyed off the current server value so an external change (e.g. a
                                    realtime refresh) remounts them with the fresh figure instead of
                                    silently going stale, without writing on every keystroke. */}
                                <div className="w-full flex items-center gap-2 pt-1.5 mt-0.5 border-t border-border" onClick={e => e.stopPropagation()}>
                                  <label className="text-[9px] font-bold text-muted-foreground uppercase shrink-0">Base</label>
                                  <input
                                    key={`base-${sg.guide_id}-${sg.base_pay}`}
                                    type="number"
                                    defaultValue={sg.base_pay ?? 0}
                                    onBlur={e => {
                                      const v = Number(e.target.value) || 0;
                                      if (v !== (sg.base_pay ?? 0)) handleUpdateGuidePay(session.id, sg.guide_id, 'base_pay', v);
                                    }}
                                    className="aurelia-input w-20 text-xs py-1"
                                  />
                                  <label className="text-[9px] font-bold text-muted-foreground uppercase shrink-0">Bonus</label>
                                  <input
                                    key={`bonus-${sg.guide_id}-${sg.bonus}`}
                                    type="number"
                                    defaultValue={sg.bonus ?? 0}
                                    onBlur={e => {
                                      const v = Number(e.target.value) || 0;
                                      if (v !== (sg.bonus ?? 0)) handleUpdateGuidePay(session.id, sg.guide_id, 'bonus', v);
                                    }}
                                    className="aurelia-input w-16 text-xs py-1"
                                  />
                                  <span className="text-xs font-bold text-gold ml-auto shrink-0">
                                    €{((Number(sg.base_pay) || 0) + (Number(sg.bonus) || 0)).toLocaleString()}
                                  </span>
                                </div>

                                {/* This guide's own check-in time — defaults to tour−15 (see
                                    handleAssignGuide), independently overridable per guide (e.g. a
                                    coordinator arriving earlier). Changing the session's tour time
                                    above recomputes this automatically UNLESS it's been overridden
                                    — see handleUpdateSessionTourTime. */}
                                <div className="w-full flex items-center gap-2 pt-1.5 mt-0.5 border-t border-border" onClick={e => e.stopPropagation()}>
                                  <label className="text-[9px] font-bold text-muted-foreground uppercase shrink-0">Check-in</label>
                                  <input
                                    key={`checkin-${sg.guide_id}-${sg.checkin_time}`}
                                    type="time"
                                    defaultValue={sg.checkin_time || checkinTime(session.start_time) || ''}
                                    onBlur={e => {
                                      const v = e.target.value;
                                      if (v && v !== (sg.checkin_time || checkinTime(session.start_time) || '')) {
                                        handleUpdateGuideCheckinTime(session.id, sg.guide_id, v);
                                      }
                                    }}
                                    className="aurelia-input text-xs py-1.5 px-2 min-h-[34px] w-[104px]"
                                  />
                                  {!sg.checkin_time && (
                                    <span className="text-[9px] text-muted-foreground italic">default (tour − 15)</span>
                                  )}
                                </div>

                                {reassigningKey === `${session.id}:${sg.guide_id}` && (
                                  <select
                                    autoFocus
                                    value=""
                                    onChange={e => {
                                      const v = e.target.value;
                                      setReassigningKey(null);
                                      if (v) handleReassignGuide(session.id, sg.guide_id, v);
                                    }}
                                    className="aurelia-input w-full text-xs py-1.5"
                                  >
                                    <option value="">-- Reassign {guide?.name || 'this guide'} to… --</option>
                                    {guides.filter(g => g.id !== sg.guide_id && !assignedGuideIds.includes(g.id)).map(g => (
                                      <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                  </select>
                                )}
                                {sg.status === 'accepted' && (
                                  <div className="w-full flex flex-wrap items-center gap-2 pt-1.5 mt-0.5 border-t border-border">
                                    <a
                                      href={calendarUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-gold hover:border-gold/30 transition-colors inline-flex items-center gap-1"
                                    >
                                      <CalendarPlus size={11} /> Add to Calendar
                                    </a>
                                    {!hasGuestEmail && (
                                      <span className="text-[9px] text-muted-foreground italic">add guide email to auto-invite</span>
                                    )}
                                    {whatsappUrl ? (
                                      <a
                                        href={whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-green-600/20 text-green-700 hover:bg-green-600/10 transition-colors inline-flex items-center gap-1"
                                      >
                                        <MessageCircle size={11} /> Send WhatsApp
                                      </a>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5">
                                        <button
                                          disabled
                                          title="This guide has no WhatsApp number on file"
                                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-border text-muted-foreground/40 cursor-not-allowed inline-flex items-center gap-1"
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
                          onChange={e => { const v = e.target.value; if (v) handleAssignGuide(session.id, v); }}
                          className="aurelia-input w-auto text-xs py-1.5 mt-2"
                        >
                          <option value="">+ Assign a guide…</option>
                          {guides.filter(g => !assignedGuideIds.includes(g.id)).map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5 max-h-56 overflow-y-auto aurelia-scrollbar">
                        {sBookings.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No bookings in this session.</p>
                        ) : sBookings.map(b => {
                          const cancelled = isCancelled(b.status);
                          return (
                          <div key={b.id} className={`flex items-center justify-between gap-2 text-xs rounded-lg p-2 ${cancelled ? 'bg-muted/50' : 'bg-muted'}`}>
                            <div className="min-w-0 truncate flex items-center gap-2">
                              <span className={`font-bold ${cancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{b.customer_name}</span>
                              <span className={`font-mono ${cancelled ? 'line-through text-muted-foreground/70' : 'text-muted-foreground'}`}>{b.booking_ref}</span>
                              {cancelled && (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-600/10 text-red-700/80 shrink-0">Cancelled</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`font-bold ${cancelled ? 'text-muted-foreground line-through' : 'text-gold'}`}>{paxTotal(b)}</span>
                              <button onClick={() => handleMoveBookingToSession(b.booking_ref, null)} title="Remove from session" className="text-muted-foreground hover:text-red-700 p-1">
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                          );
                        })}
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
