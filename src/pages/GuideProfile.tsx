import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Lock } from 'lucide-react';

interface GuideRow {
  id: string;
  name: string;
  whatsapp: string | null;
  languages: string | null;
  licensed: boolean | null;
  tours_qualified: string | null;
  website_consent: boolean | null;
  account_holder: string | null;
  iban: string | null;
  swift_code: string | null;
  bank_name: string | null;
  bank_address: string | null;
  siret: string | null;
  guide_number: string | null;
  email: string | null;
  status: string | null;
  contracted: boolean | null;
  contract_date: string | null;
}

// These match the database trigger's write-once fields exactly — editable only while empty;
// once the database has a value, the trigger locks them and the UI must not resend them.
const WRITE_ONCE_FIELDS = [
  { key: 'account_holder', label: 'Account Holder Name', placeholder: 'e.g. Leonardo Vinci' },
  { key: 'iban', label: 'IBAN', placeholder: 'e.g. IT02 L123 4567 8901…' },
  { key: 'swift_code', label: 'Swift / BIC Code', placeholder: 'e.g. BNLITRRMXXX' },
  { key: 'bank_name', label: 'Bank Name', placeholder: 'e.g. Fineco Bank' },
  { key: 'bank_address', label: 'Bank Address', placeholder: 'e.g. Piazza Cordusio 2, Milan' },
  { key: 'siret', label: 'SIRET', placeholder: 'e.g. 123 456 789 00012' },
] as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}

export default function GuideProfile() {
  const { guideId } = useAuth();
  const [guide, setGuide] = useState<GuideRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    name: '',
    whatsapp: '',
    languages: '',
    licensed: false,
    tours_qualified: '',
    website_consent: false,
    account_holder: '',
    iban: '',
    swift_code: '',
    bank_name: '',
    bank_address: '',
    siret: '',
  });

  const applyGuideToForm = (data: GuideRow) => {
    setForm({
      name: data.name || '',
      whatsapp: data.whatsapp || '',
      languages: data.languages || '',
      licensed: !!data.licensed,
      tours_qualified: data.tours_qualified || '',
      website_consent: !!data.website_consent,
      account_holder: data.account_holder || '',
      iban: data.iban || '',
      swift_code: data.swift_code || '',
      bank_name: data.bank_name || '',
      bank_address: data.bank_address || '',
      siret: data.siret || '',
    });
  };

  const loadGuide = async () => {
    if (!guideId) return;
    setLoading(true);
    const { data } = await supabase.from('guides').select('*').eq('id', guideId).maybeSingle();
    if (data) {
      setGuide(data);
      applyGuideToForm(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadGuide();
  }, [guideId]);

  const handleSave = async () => {
    if (!guide) return;
    setSaving(true);
    setError('');
    setSaved(false);

    const payload: Record<string, string | boolean | null> = {
      name: form.name.trim(),
      whatsapp: form.whatsapp.trim() || null,
      languages: form.languages.trim() || null,
      licensed: form.licensed,
      tours_qualified: form.tours_qualified.trim() || null,
      website_consent: form.website_consent,
    };

    // Never resend a write-once field that already has a value — the trigger would reject it,
    // and we shouldn't rely on the trigger alone when we already know better client-side.
    WRITE_ONCE_FIELDS.forEach(({ key }) => {
      if (!guide[key]) {
        const val = form[key].trim();
        if (val) payload[key] = val;
      }
    });

    const { error: updateError } = await supabase.from('guides').update(payload).eq('id', guide.id);

    if (updateError) {
      console.error('Guide profile update failed:', updateError);
      setError('That field can only be changed by your coordinator.');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await loadGuide();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-20">
        <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-center text-muted-foreground">
        Could not load your profile. Please contact your coordinator.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-32 max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">My Profile</h1>
        <p className="text-muted-foreground text-sm">Keep your details up to date.</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-600/10 border border-red-600/20 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="p-3 rounded-lg bg-green-600/10 border border-green-600/20 text-sm text-green-700">Profile saved.</div>
      )}

      <section className="aurelia-card p-5 space-y-4">
        <h2 className="text-xs font-bold text-gold uppercase tracking-widest border-b border-border pb-2">Basic Info</h2>

        <Field label="Full Name">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="aurelia-input" />
        </Field>

        <Field label="WhatsApp Number">
          <input value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} className="aurelia-input" placeholder="e.g. +39 333 444555" />
        </Field>

        <Field label="Languages">
          <input value={form.languages} onChange={e => setForm({ ...form, languages: e.target.value })} className="aurelia-input" placeholder="e.g. English, French" />
        </Field>

        <Field label="Tours Qualified">
          <textarea rows={2} value={form.tours_qualified} onChange={e => setForm({ ...form, tours_qualified: e.target.value })} className="aurelia-input resize-none" placeholder="e.g. Louvre, Colosseum" />
        </Field>

        <div className="flex items-center justify-between bg-muted p-3 rounded-xl border border-border">
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Licensed Guide</label>
            <span className="text-[10px] text-muted-foreground block mt-0.5">Do you hold a valid tour guide license?</span>
          </div>
          <input type="checkbox" checked={form.licensed} onChange={e => setForm({ ...form, licensed: e.target.checked })} className="w-4 h-4 rounded text-gold bg-background border-border focus:ring-gold" />
        </div>

        <div className="flex items-center justify-between bg-muted p-3 rounded-xl border border-border">
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Website Consent</label>
            <span className="text-[10px] text-muted-foreground block mt-0.5">OK to feature your name/photo on our website?</span>
          </div>
          <input type="checkbox" checked={form.website_consent} onChange={e => setForm({ ...form, website_consent: e.target.checked })} className="w-4 h-4 rounded text-gold bg-background border-border focus:ring-gold" />
        </div>
      </section>

      <section className="aurelia-card p-5 space-y-4">
        <div className="border-b border-border pb-2">
          <h2 className="text-xs font-bold text-gold uppercase tracking-widest">Banking &amp; Legal</h2>
          <p className="text-[10px] text-muted-foreground mt-1">Each of these can only be set once. Contact your coordinator to correct them afterward.</p>
        </div>

        {WRITE_ONCE_FIELDS.map(({ key, label, placeholder }) => {
          const lockedValue = guide[key];
          return (
            <Field key={key} label={label}>
              {lockedValue ? (
                <div>
                  <div className="aurelia-input bg-muted text-muted-foreground flex items-center gap-2 cursor-not-allowed">
                    <Lock size={12} className="shrink-0 opacity-60" />
                    <span className="truncate">{lockedValue}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Locked — contact your coordinator to change</p>
                </div>
              ) : (
                <input
                  value={form[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                  className="aurelia-input"
                  placeholder={placeholder}
                />
              )}
            </Field>
          );
        })}
      </section>

      <section className="aurelia-card p-5 space-y-1.5">
        <h2 className="text-xs font-bold text-gold uppercase tracking-widest border-b border-border pb-2 mb-2">Account</h2>
        <ReadOnlyRow label="Guide Number" value={guide.guide_number || '—'} />
        <ReadOnlyRow label="Email" value={guide.email || '—'} />
        <ReadOnlyRow label="Status" value={guide.status || '—'} />
        <ReadOnlyRow label="Contract Signed" value={guide.contracted ? 'Yes' : 'No'} />
        <ReadOnlyRow label="Contract Date" value={guide.contract_date || '—'} />
      </section>

      <button onClick={handleSave} disabled={saving} className="aurelia-gold-btn w-full py-3 font-bold disabled:opacity-50">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}
