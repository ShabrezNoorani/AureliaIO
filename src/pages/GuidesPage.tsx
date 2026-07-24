import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logChange } from '@/lib/changeLog';
import { Plus, X, PenSquare, Trash2, CheckCircle2, Euro, Info, Tag, ChevronRight, Search, Upload, Copy, RefreshCw, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

interface GuideOptionRate {
  id?: string;
  product_code: string;
  option_name: string;
  rate: number;
}

interface Guide {
  id: string;
  guide_number: string;
  name: string;
  email: string | null;
  phone: string | null;
  base_rate: number;
  status: string;
  notes: string | null;
  whatsapp?: string | null;
  languages?: string | null;
  licensed?: boolean;
  tours_qualified?: string | null;
  account_holder?: string | null;
  iban?: string | null;
  swift_code?: string | null;
  bank_name?: string | null;
  bank_address?: string | null;
  contracted?: boolean;
  contract_date?: string | null;
  website_consent?: boolean;
  auth_user_id?: string | null;
  claim_token?: string | null;
  claimed_at?: string | null;
  option_rates?: GuideOptionRate[];
}

export default function GuidesPage() {
  const { user } = useAuth();

  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingGuide, setEditingGuide] = useState<Guide | null>(null);
  const [existingOptions, setExistingOptions] = useState<string[]>([]);
  
  const [form, setForm] = useState({
    guideNumber: '',
    name: '',
    email: '',
    phone: '',
    baseRate: 0,
    status: 'active',
    notes: '',
    whatsapp: '',
    languages: '',
    licensed: false,
    toursQualified: '',
    accountHolder: '',
    iban: '',
    swiftCode: '',
    bankName: '',
    bankAddress: '',
    contracted: false,
    contractDate: '',
    optionRates: [] as GuideOptionRate[]
  });

  const fetchGuides = async () => {
    if (!user) return;
    setLoading(true);
    
    // Fetch guides and their product rates
    const { data: guidesData, error: guidesError } = await supabase
      .from('guides')
      .select('*, option_rates:guide_option_rates(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    
    if (guidesError) console.error(guidesError);
    setGuides(guidesData || []);
    setLoading(false);
  };

  const loadExistingOptions = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('bookings')
      .select('option_name')
      .eq('user_id', user.id);
    
    if (data) {
      const unique = Array.from(new Set(data.map(b => b.option_name).filter(Boolean)));
      setExistingOptions(unique as string[]);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchGuides();
    loadExistingOptions();
  }, [user]);

  const parseCsv = (text: string): string[][] => {
    const result: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          cell += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          cell += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          row.push(cell.trim());
          cell = '';
        } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
          row.push(cell.trim());
          result.push(row);
          row = [];
          cell = '';
          if (char === '\r') i++;
        } else {
          cell += char;
        }
      }
    }
    if (row.length > 0 || cell) {
      row.push(cell.trim());
      result.push(row);
    }
    return result;
  };

  // CSV column helpers: every value is trimmed; blank cells become null (never empty strings).
  const csvCell = (row: string[], idx: number): string => (row[idx] ?? '').trim();
  const csvNullable = (row: string[], idx: number): string | null => {
    const v = csvCell(row, idx);
    return v === '' ? null : v;
  };
  const csvBool = (row: string[], idx: number, trueValues: string[]): boolean =>
    trueValues.includes(csvCell(row, idx).toLowerCase());

  // Fields where a blank CSV cell must not clobber an existing non-null database value.
  const PRESERVE_IF_BLANK = [
    'name', 'email', 'whatsapp', 'status', 'contract_date',
    'languages', 'tours_qualified', 'account_holder', 'iban',
    'swift_code', 'bank_name', 'bank_address',
  ] as const;

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const rows = parseCsv(text);
        if (rows.length < 2) {
          toast.error("CSV has no data rows");
          return;
        }

        const { data: existingGuides, error: fetchError } = await supabase
          .from('guides')
          .select('*')
          .eq('user_id', user.id);

        if (fetchError) {
          console.error(fetchError);
          toast.error('Failed to load existing guides before import');
          return;
        }

        const existingByNumber = new Map<string, any>(
          (existingGuides || []).map((g: any) => [g.guide_number, g])
        );

        const payloads: any[] = [];
        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        // Row 0 is the header. A row only counts as real data if column 0 (Id Number) is non-empty.
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const guideNumber = csvCell(row, 0);
          if (!guideNumber) {
            skippedCount++;
            continue;
          }

          const existing = existingByNumber.get(guideNumber);

          const payload: any = {
            user_id: user.id,
            guide_number: guideNumber,
            name: csvNullable(row, 1),
            email: csvNullable(row, 2),
            whatsapp: csvNullable(row, 3),
            licensed: csvBool(row, 4, ['yes']),
            status: csvNullable(row, 5),
            contracted: csvBool(row, 6, ['true']),
            contract_date: csvNullable(row, 7),
            languages: csvNullable(row, 8),
            website_consent: csvBool(row, 9, ['yes', 'true']),
            // column 10 (ID-QR) is ignored entirely
            tours_qualified: csvNullable(row, 11),
            account_holder: csvNullable(row, 12),
            iban: csvNullable(row, 13),
            swift_code: csvNullable(row, 14),
            bank_name: csvNullable(row, 15),
            bank_address: csvNullable(row, 16),
          };

          if (existing) {
            for (const field of PRESERVE_IF_BLANK) {
              if (payload[field] === null && existing[field] !== null && existing[field] !== undefined) {
                payload[field] = existing[field];
              }
            }
            updatedCount++;
          } else {
            createdCount++;
          }

          payloads.push(payload);
        }

        if (payloads.length > 0) {
          const { error: upsertError } = await supabase
            .from('guides')
            .upsert(payloads, { onConflict: 'user_id,guide_number' });

          if (upsertError) {
            console.error(upsertError);
            toast.error('Import failed while saving guides');
            return;
          }
        }

        toast.success(
          `Import complete: ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped`
        );
        fetchGuides();
      } catch (err) {
        console.error(err);
        toast.error("Failed to parse CSV file");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
  };

  const generateClaimToken = (): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const randomValues = new Uint32Array(12);
    crypto.getRandomValues(randomValues);
    let token = '';
    for (let i = 0; i < 12; i++) {
      token += chars[randomValues[i] % chars.length];
    }
    return token;
  };

  const buildClaimUrl = (token: string) => `${window.location.origin}/guide/claim/${token}`;

  const handleCopyClaimLink = async (token: string) => {
    const url = buildClaimUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Login link copied to clipboard');
    } catch {
      toast.error(`Could not copy automatically — link: ${url}`);
    }
  };

  const handleGenerateClaimLink = async (guide: Guide) => {
    const token = generateClaimToken();
    const { error } = await supabase
      .from('guides')
      .update({ claim_token: token })
      .eq('id', guide.id);

    if (error) {
      console.error(error);
      toast.error('Failed to generate login link');
      return;
    }

    await fetchGuides();
    await handleCopyClaimLink(token);
  };

  const openPanel = (guide: Guide | null = null) => {
    if (guide) {
      setEditingGuide(guide);
      setForm({
        guideNumber: guide.guide_number || '',
        name: guide.name || '',
        email: guide.email || '',
        phone: guide.phone || '',
        baseRate: guide.base_rate || 0,
        status: guide.status || 'active',
        notes: guide.notes || '',
        whatsapp: guide.whatsapp || '',
        languages: guide.languages || '',
        licensed: guide.licensed || false,
        toursQualified: guide.tours_qualified || '',
        accountHolder: guide.account_holder || '',
        iban: guide.iban || '',
        swiftCode: guide.swift_code || '',
        bankName: guide.bank_name || '',
        bankAddress: guide.bank_address || '',
        contracted: guide.contracted || false,
        contractDate: guide.contract_date || '',
        optionRates: guide.option_rates || []
      });
    } else {
      setEditingGuide(null);
      const next = (guides.length + 1).toString().padStart(3, '0');
      setForm({
        guideNumber: 'G' + next,
        name: '',
        email: '',
        phone: '',
        baseRate: 0,
        status: 'active',
        notes: '',
        whatsapp: '',
        languages: '',
        licensed: false,
        toursQualified: '',
        accountHolder: '',
        iban: '',
        swiftCode: '',
        bankName: '',
        bankAddress: '',
        contracted: false,
        contractDate: '',
        optionRates: []
      });
    }
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.name.trim()) return alert("Name is required");

    const payload = {
      user_id: user.id,
      guide_number: form.guideNumber,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      base_rate: Number(form.baseRate),
      status: form.status,
      notes: form.notes || null,
      whatsapp: form.whatsapp || null,
      languages: form.languages || null,
      licensed: form.licensed,
      tours_qualified: form.toursQualified || null,
      account_holder: form.accountHolder || null,
      iban: form.iban || null,
      swift_code: form.swiftCode || null,
      bank_name: form.bankName || null,
      bank_address: form.bankAddress || null,
      contracted: form.contracted,
      contract_date: form.contracted && form.contractDate ? form.contractDate : null
    };

    let guideId = editingGuide?.id;

    if (editingGuide) {
      const { error } = await supabase
        .from('guides')
        .update(payload)
        .eq('id', editingGuide.id);
      if (error) console.error(error);
    } else {
      const { data, error } = await supabase
        .from('guides')
        .insert(payload)
        .select()
        .single();
      if (error) console.error(error);
      if (data) guideId = data.id;
    }

    if (guideId) {
      // Update option rates
      await supabase.from('guide_option_rates').delete().eq('guide_id', guideId);
      
      if (form.optionRates.length > 0) {
        const ratesPayload = form.optionRates
          .filter(r => r.product_code.trim())
          .map(r => ({
            guide_id: guideId,
            user_id: user.id,
            product_code: r.product_code.toUpperCase(),
            option_name: r.option_name,
            rate: Number(r.rate)
          }));
        
        if (ratesPayload.length > 0) {
          await supabase.from('guide_option_rates').insert(ratesPayload);
        }
      }

      // Log the change
      await logChange(supabase, user.id, {
        tableName: 'guide_option_rates',
        recordId: guideId,
        fieldName: 'rates',
        oldValue: editingGuide?.option_rates || [],
        newValue: form.optionRates,
        description: `Rates updated for guide ${form.name}`
      });
    }

    setPanelOpen(false);
    fetchGuides();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this guide?')) return;
    const { error } = await supabase
      .from('guides')
      .delete()
      .eq('id', id);
    if (error) console.error(error);
    fetchGuides();
  };

  return (
    <div style={{ padding: '32px' }} className="animate-fade-in">
        <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
          
          <div className="flex items-center justify-between border-b border-white/5 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Guides</h1>
              <p className="text-gray-400 text-sm mt-1">Manage your team and payment rates</p>
            </div>
            <div className="flex items-center gap-3">
              <input 
                type="file" 
                id="csv-file-input" 
                accept=".csv" 
                onChange={handleCSVImport} 
                className="hidden" 
              />
              <button 
                onClick={() => document.getElementById('csv-file-input')?.click()}
                className="aurelia-ghost-btn border border-white/10 hover:bg-white/5 px-5 py-2.5 flex items-center gap-2 font-bold rounded-xl text-gray-300 hover:text-white"
              >
                <Upload size={18} /> Import from CSV
              </button>
              <button 
                onClick={() => openPanel()}
                className="aurelia-gold-btn px-5 py-2.5 flex items-center gap-2 font-bold shadow-2xl shadow-gold/10"
              >
                <Plus size={18} /> Add Guide
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center p-20">
              <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
            </div>
          ) : guides.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-20 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
              <div className="text-7xl mb-6">👤</div>
              <h3 className="text-2xl font-extrabold mb-2">No guides yet</h3>
              <p className="text-gray-400 mb-8 max-w-sm">
                Add your first guide to track tours and earnings
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => document.getElementById('csv-file-input')?.click()}
                  className="aurelia-ghost-btn border border-white/10 hover:bg-white/5 px-6 py-3 font-bold flex items-center gap-2 rounded-xl"
                >
                  <Upload size={18} /> Import CSV
                </button>
                <button 
                  onClick={() => openPanel()}
                  className="aurelia-gold-btn px-8 py-3 font-bold flex items-center gap-2"
                >
                  <Plus size={20} /> Add First Guide
                </button>
              </div>
            </div>
          ) : (
            <div className="aurelia-card border border-white/5 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-xs text-gray-400 uppercase tracking-widest font-bold">
                  <tr>
                    <th className="px-6 py-4">Guide #</th>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">WhatsApp / Phone</th>
                    <th className="px-6 py-4">Base Rate</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Login Access</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {guides.map(g => (
                    <tr key={g.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4 font-mono font-bold text-gold">{g.guide_number}</td>
                      <td className="px-6 py-4">
                        <div className="font-bold flex items-center gap-2">
                          {g.name}
                          {g.licensed && <span className="bg-gold/20 text-gold text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">Licensed</span>}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                          {g.option_rates && g.option_rates.length > 0 ? (
                            <>
                              {g.option_rates.slice(0, 3).map((r, idx) => (
                                <span key={idx}>
                                  {r.product_code}{r.option_name ? `/${r.option_name.slice(0, 10)}` : ''}:€{r.rate}
                                  {idx < Math.min(g.option_rates!.length, 3) - 1 ? ' · ' : ''}
                                </span>
                              ))}
                              {g.option_rates.length > 3 && ` · +${g.option_rates.length - 3} more`}
                            </>
                          ) : 'No special rates'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-400">
                        <div>{g.whatsapp || g.phone || '—'}</div>
                        {g.email && <div className="text-xs text-gray-500 font-mono">{g.email}</div>}
                      </td>
                      <td className="px-6 py-4 font-mono">€{g.base_rate}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          g.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'
                        }`}>
                          {g.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {g.claimed_at ? (
                          <div>
                            <span className="text-[10px] font-bold uppercase text-green-500">Account active</span>
                            <div className="text-[10px] text-gray-500 mt-0.5">{new Date(g.claimed_at).toLocaleDateString()}</div>
                          </div>
                        ) : g.claim_token ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase text-yellow-500">Link pending</span>
                            <button
                              onClick={() => handleCopyClaimLink(g.claim_token!)}
                              className="text-[10px] font-bold px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 flex items-center gap-1"
                            >
                              <Copy size={11} /> Copy
                            </button>
                            <button
                              onClick={() => handleGenerateClaimLink(g)}
                              className="text-[10px] font-bold px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 flex items-center gap-1"
                            >
                              <RefreshCw size={11} /> Regenerate
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleGenerateClaimLink(g)}
                            className="text-[10px] font-bold px-2 py-1 rounded border border-gold/20 text-gold hover:bg-gold/10 flex items-center gap-1"
                          >
                            <LinkIcon size={11} /> Generate login link
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openPanel(g)} className="p-2 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors">
                            <PenSquare size={16} />
                          </button>
                          <button onClick={() => handleDelete(g.id)} className="p-2 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SLIDE-OUT PANEL */}
        {panelOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" onClick={() => setPanelOpen(false)} />
            <div className="fixed inset-y-0 right-0 w-[500px] bg-[#0f0f12] border-l border-white/10 z-[101] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#0a0a0d]">
                <div>
                  <h2 className="text-xl font-extrabold text-white">{editingGuide ? 'Edit Guide' : 'Add Guide'}</h2>
                  <p className="text-xs text-gray-500 mt-1">Configure profile, contracts, and banking details</p>
                </div>
                <button onClick={() => setPanelOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-6 aurelia-scrollbar">
                
                {/* SECTION 1: BASIC INFO */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-gold uppercase tracking-widest border-b border-white/5 pb-2">Basic Info</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Guide Number</label>
                      <input 
                        type="text" 
                        value={form.guideNumber}
                        onChange={e => setForm({...form, guideNumber: e.target.value})}
                        className="aurelia-input"
                        placeholder="e.g. SZT-2026-001"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Status</label>
                      <select 
                        value={form.status}
                        onChange={e => setForm({...form, status: e.target.value})}
                        className="aurelia-input appearance-none bg-[#1a1a1f] w-full"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Full Name (Required)</label>
                    <input 
                      type="text" 
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      className="aurelia-input"
                      placeholder="e.g. Leonardo Vinci"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Email</label>
                      <input 
                        type="email" 
                        value={form.email}
                        onChange={e => setForm({...form, email: e.target.value})}
                        className="aurelia-input"
                        placeholder="e.g. leo@aurelia.com"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">WhatsApp Number</label>
                      <input 
                        type="text" 
                        value={form.whatsapp}
                        onChange={e => setForm({...form, whatsapp: e.target.value})}
                        className="aurelia-input"
                        placeholder="e.g. +39 333 444555"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Languages</label>
                      <input 
                        type="text" 
                        value={form.languages}
                        onChange={e => setForm({...form, languages: e.target.value})}
                        className="aurelia-input"
                        placeholder="e.g. English, French"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Base Rate €</label>
                      <input 
                        type="number" 
                        value={form.baseRate}
                        onChange={e => setForm({...form, baseRate: Number(e.target.value)})}
                        className="aurelia-input"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-white/[0.03] p-3 rounded-xl border border-white/5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Licensed Guide</label>
                      <span className="text-[10px] text-gray-500 block mt-0.5">Does this guide hold a valid tour guide license?</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={form.licensed}
                      onChange={e => setForm({...form, licensed: e.target.checked})}
                      className="w-4 h-4 rounded text-gold bg-black border-white/10 focus:ring-gold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Tours Qualified</label>
                    <textarea 
                      rows={2}
                      value={form.toursQualified}
                      onChange={e => setForm({...form, toursQualified: e.target.value})}
                      className="aurelia-input resize-none"
                      placeholder="e.g. ND, Louvre, Colosseum"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Notes</label>
                    <textarea 
                      rows={2}
                      value={form.notes}
                      onChange={e => setForm({...form, notes: e.target.value})}
                      className="aurelia-input resize-none"
                      placeholder="General notes or internal comments..."
                    />
                  </div>
                </div>

                {/* SECTION 2: CONTRACT */}
                <div className="space-y-4 pt-4 border-t border-white/5">
                  <h3 className="text-xs font-bold text-gold uppercase tracking-widest border-b border-white/5 pb-2">Contract</h3>
                  
                  <div className="flex items-center justify-between bg-white/[0.03] p-3 rounded-xl border border-white/5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contract Signed</label>
                      <span className="text-[10px] text-gray-500 block mt-0.5">Is a signed contractor agreement on file?</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={form.contracted}
                      onChange={e => setForm({...form, contracted: e.target.checked})}
                      className="w-4 h-4 rounded text-gold bg-black border-white/10 focus:ring-gold"
                    />
                  </div>

                  {form.contracted && (
                    <div className="animate-fade-in">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Contract Date</label>
                      <input 
                        type="date" 
                        value={form.contractDate}
                        onChange={e => setForm({...form, contractDate: e.target.value})}
                        className="aurelia-input"
                      />
                    </div>
                  )}
                </div>

                {/* SECTION 3: BANKING */}
                <div className="space-y-4 pt-4 border-t border-white/5">
                  <h3 className="text-xs font-bold text-gold uppercase tracking-widest border-b border-white/5 pb-2">Banking (for invoices)</h3>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Account Holder Name</label>
                    <input 
                      type="text" 
                      value={form.accountHolder}
                      onChange={e => setForm({...form, accountHolder: e.target.value})}
                      className="aurelia-input"
                      placeholder="e.g. Leonardo Vinci"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">IBAN</label>
                    <input 
                      type="text" 
                      value={form.iban}
                      onChange={e => setForm({...form, iban: e.target.value})}
                      className="aurelia-input"
                      placeholder="e.g. IT02 L123 4567 8901..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Swift/BIC Code</label>
                      <input 
                        type="text" 
                        value={form.swiftCode}
                        onChange={e => setForm({...form, swiftCode: e.target.value})}
                        className="aurelia-input"
                        placeholder="e.g. BNLITRRMXXX"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Bank Name</label>
                      <input 
                        type="text" 
                        value={form.bankName}
                        onChange={e => setForm({...form, bankName: e.target.value})}
                        className="aurelia-input"
                        placeholder="e.g. Fineco Bank"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Bank Address</label>
                    <input 
                      type="text" 
                      value={form.bankAddress}
                      onChange={e => setForm({...form, bankAddress: e.target.value})}
                      className="aurelia-input"
                      placeholder="e.g. Piazza Cordusio 2, Milan, Italy"
                    />
                  </div>
                </div>

                {/* SECTION 4: RATES */}
                <div className="pt-4 border-t border-white/5">
                  <div className="flex flex-col mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-gold uppercase tracking-widest">Rates Per Tour Option</label>
                      <button 
                        onClick={() => setForm({...form, optionRates: [...form.optionRates, { product_code: '', option_name: '', rate: 0 }]})}
                        className="text-[10px] bg-gold/10 text-gold px-2 py-1 rounded border border-gold/20 hover:bg-gold/20 transition-all font-bold flex items-center gap-1"
                      >
                        <Plus size={10} /> Add Rate
                      </button>
                    </div>
                    <p className="text-[9px] text-gray-600 leading-tight uppercase tracking-wider">
                      Set specific pay rates per tour option. Leave empty to use base rate.
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    {form.optionRates.map((r, i) => (
                      <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-2">
                        <div className="flex gap-2">
                          <input 
                            className="aurelia-input text-xs w-20" 
                            placeholder="Code"
                            value={r.product_code}
                            onChange={e => {
                              const next = [...form.optionRates];
                              next[i].product_code = e.target.value.toUpperCase();
                              setForm({...form, optionRates: next});
                            }}
                          />
                          <input 
                            type="number"
                            className="aurelia-input text-xs w-24 text-gold font-bold" 
                            placeholder="Rate €"
                            value={r.rate}
                            onChange={e => {
                              const next = [...form.optionRates];
                              next[i].rate = Number(e.target.value);
                              setForm({...form, optionRates: next});
                            }}
                          />
                          <button 
                            onClick={() => setForm({...form, optionRates: form.optionRates.filter((_, idx) => idx !== i)})}
                            className="ml-auto text-gray-600 hover:text-red-400 p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <input 
                          list="existing-options-datalist"
                          className="aurelia-input text-[11px] py-1.5" 
                          placeholder="Option Name (e.g. Interior only)"
                          value={r.option_name}
                          onChange={e => {
                            const next = [...form.optionRates];
                            next[i].option_name = e.target.value;
                            setForm({...form, optionRates: next});
                          }}
                        />
                      </div>
                    ))}
                    
                    <datalist id="existing-options-datalist">
                      {existingOptions.map(opt => <option key={opt} value={opt} />)}
                    </datalist>

                    {form.optionRates.length === 0 && (
                      <p className="text-[10px] text-gray-600 italic text-center py-2">No option-specific rates set.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-white/5 bg-[#0a0a0d] flex items-center gap-3">
                <button 
                  onClick={() => setPanelOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-white/10 font-bold hover:bg-white/5 transition-colors text-white text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="flex-[2] aurelia-gold-btn px-4 py-3 font-bold flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                >
                  <CheckCircle2 size={18} /> Save Guide
                </button>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
