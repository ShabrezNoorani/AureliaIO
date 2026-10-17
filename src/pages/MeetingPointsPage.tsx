import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { MapPin, Plus, Pencil, Trash2, X, LocateFixed } from 'lucide-react';
import {
  fetchMeetingPoints, addMeetingPoint, updateMeetingPoint, deleteMeetingPoint,
  parseLatLngFromInput, getBrowserLocation, DEFAULT_MEETING_POINT_RADIUS_M,
  type MeetingPointRow,
} from '@/lib/meetingPoints';

interface FormState {
  name: string;
  locationInput: string;
  lat: number | null;
  lng: number | null;
  radius: string;
}

const emptyForm: FormState = { name: '', locationInput: '', lat: null, lng: null, radius: String(DEFAULT_MEETING_POINT_RADIUS_M) };

/**
 * Owner-only library of named, geo-located meeting points — picked per session in Dispatch, then
 * used to geo-verify a guide's "I've arrived" tap against (see GuideCheckin.tsx's handleArrive +
 * lib/meetingPoints.ts's evaluateArrivalGate). A point here is just a name + lat/long + radius;
 * nothing about sessions or arrivals lives on this page.
 */
export default function MeetingPointsPage() {
  const { user } = useAuth();
  const [points, setPoints] = useState<MeetingPointRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [locationError, setLocationError] = useState('');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setPoints(await fetchMeetingPoints(supabase, user.id));
    } catch (e) {
      console.error('Failed to load meeting points:', e);
      toast.error('Failed to load meeting points.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setLocationError('');
    setShowForm(true);
  };

  const openEdit = (p: MeetingPointRow) => {
    setEditingId(p.id);
    setForm({ name: p.name, locationInput: `${p.latitude},${p.longitude}`, lat: p.latitude, lng: p.longitude, radius: String(p.radius_m) });
    setLocationError('');
    setShowForm(true);
  };

  const closeForm = () => setShowForm(false);

  // Re-parses the pasted link/coordinates on every change — the owner sees immediately whether
  // what they pasted resolved to a real lat/long (coordinates below the field) or not (the error
  // telling them to try current-location or raw "lat,long" instead).
  const handleLocationInputChange = (value: string) => {
    setForm(prev => ({ ...prev, locationInput: value }));
    if (!value.trim()) {
      setForm(prev => ({ ...prev, lat: null, lng: null }));
      setLocationError('');
      return;
    }
    const parsed = parseLatLngFromInput(value);
    if (parsed) {
      setForm(prev => ({ ...prev, lat: parsed.lat, lng: parsed.lng }));
      setLocationError('');
    } else {
      setForm(prev => ({ ...prev, lat: null, lng: null }));
      setLocationError("Couldn't parse that as a location — try \"Use my current location\" below, or paste coordinates as \"lat,long\".");
    }
  };

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    setLocationError('');
    try {
      const { lat, lng } = await getBrowserLocation();
      setForm(prev => ({ ...prev, locationInput: `${lat},${lng}`, lat, lng }));
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : 'Could not get your current location.');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const name = form.name.trim();
    if (!name) { toast.error('Give this meeting point a name.'); return; }
    if (form.lat == null || form.lng == null) {
      setLocationError(locationError || 'Set a location first — paste a Google Maps link, use current location, or paste "lat,long".');
      return;
    }
    const radiusTrimmed = form.radius.trim();
    const radius_m = radiusTrimmed === '' ? DEFAULT_MEETING_POINT_RADIUS_M : Number(radiusTrimmed);
    if (!Number.isFinite(radius_m) || radius_m <= 0) { toast.error('Radius must be a positive number of meters.'); return; }

    setSaving(true);
    try {
      const payload = { name, latitude: form.lat, longitude: form.lng, radius_m };
      const { error } = editingId
        ? await updateMeetingPoint(supabase, editingId, payload)
        : await addMeetingPoint(supabase, user.id, payload);
      if (error) throw new Error(error);
      toast.success(editingId ? 'Meeting point updated' : 'Meeting point added');
      setShowForm(false);
      await load();
    } catch (e) {
      console.error('Failed to save meeting point:', e);
      toast.error(e instanceof Error ? e.message : 'Failed to save meeting point.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: MeetingPointRow) => {
    if (!confirm(`Delete "${p.name}"? Any session currently pointing at it will lose that assignment.`)) return;
    const { error } = await deleteMeetingPoint(supabase, p.id);
    if (error) { toast.error(`Failed to delete: ${error}`); return; }
    toast.success('Meeting point deleted');
    await load();
  };

  return (
    <div className="p-4 md:p-8 pb-32 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-border/50">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Meeting Points</h1>
          <p className="text-muted-foreground text-sm">Named, geo-located spots guides must physically reach to mark arrival.</p>
        </div>
        <button onClick={openAdd} className="aurelia-gold-btn px-5 py-2.5 font-bold flex items-center gap-2 shrink-0">
          <Plus size={16} /> Add Meeting Point
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>
      ) : points.length === 0 ? (
        <div className="aurelia-card p-12 text-center flex flex-col items-center">
          <MapPin size={48} className="text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-bold mb-2">No meeting points yet</h3>
          <p className="text-muted-foreground mb-6">Add one, then pick it on a session in Dispatch.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {points.map(p => (
            <div key={p.id} className="aurelia-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex items-start gap-2.5">
                <MapPin size={16} className="text-gold shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="font-bold text-sm truncate">{p.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Radius {p.radius_m}m</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => openEdit(p)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit meeting point">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(p)} className="p-2 hover:bg-red-600/10 rounded-lg text-muted-foreground hover:text-red-600 transition-colors" aria-label="Delete meeting point">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl" onClick={closeForm}>
          <div
            className="bg-card border border-border rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted">
              <h2 className="text-lg font-black">{editingId ? 'Edit Meeting Point' : 'Add Meeting Point'}</h2>
              <button onClick={closeForm} className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Notre-Dame — Statue of Charlemagne"
                  className="aurelia-input w-full"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Location</label>
                <input
                  value={form.locationInput}
                  onChange={e => handleLocationInputChange(e.target.value)}
                  placeholder="Paste a Google Maps link, or lat,long"
                  className="aurelia-input w-full"
                />
                {form.lat != null && form.lng != null && (
                  <p className="text-xs text-green-700 font-mono mt-1.5">✓ {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</p>
                )}
                {locationError && (
                  <p className="text-xs text-red-600 mt-1.5">{locationError}</p>
                )}
                <button
                  onClick={handleUseCurrentLocation}
                  disabled={locating}
                  className="mt-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-gold border border-border hover:border-gold/30 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                >
                  <LocateFixed size={13} />
                  {locating ? 'Getting location…' : 'Use my current location'}
                </button>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Radius (meters)</label>
                <input
                  type="number"
                  min={1}
                  value={form.radius}
                  onChange={e => setForm(prev => ({ ...prev, radius: e.target.value }))}
                  placeholder={String(DEFAULT_MEETING_POINT_RADIUS_M)}
                  className="aurelia-input w-full"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="aurelia-gold-btn w-full py-2.5 font-bold disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Meeting Point'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
