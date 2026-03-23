import { useState, useRef, useCallback } from 'react';
import { X, Upload, Download } from 'lucide-react';
import type { Booking } from '@/lib/useBookings';
import { EMPTY_BOOKING, COMMISSION_DEFAULTS } from '@/lib/useBookings';

interface CsvUploadModalProps {
  onImport: (bookings: Booking[]) => Promise<{ inserted: number; skipped: number }>;
  onClose: () => void;
}

const FIELD_MAP = [
  { key: 'booking_ref', label: 'Booking Ref' },
  { key: 'ext_ref', label: 'Ext Ref' },
  { key: 'travel_date', label: 'Travel Date' },
  { key: 'booking_date', label: 'Booking Date' },
  { key: 'product_name', label: 'Product Name' },
  { key: 'option_name', label: 'Option Name' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'channel', label: 'Channel' },
  { key: 'pax_adult', label: 'Adult Pax' },
  { key: 'pax_youth', label: 'Youth Pax' },
  { key: 'pax_child', label: 'Child Pax' },
  { key: 'pax_infant', label: 'Infant Pax' },
  { key: 'gross_revenue', label: 'Gross Revenue' },
  { key: 'commission_rate', label: 'Commission %' },
  { key: 'status', label: 'Status' },
];

type Step = 'upload' | 'mapping' | 'preview' | 'result';

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((l) => {
    const vals: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of l) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    vals.push(current.trim());
    return vals;
  });
  return { headers, rows };
}

function smartMatch(fieldLabel: string, csvHeaders: string[]): string {
  const lower = fieldLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const h of csvHeaders) {
    const hLower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (hLower === lower || hLower.includes(lower) || lower.includes(hLower)) return h;
  }
  return '';
}

function downloadTemplate() {
  const headers = FIELD_MAP.map((f) => f.label).join(',');
  const blob = new Blob([headers + '\n'], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aurelia_booking_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function CsvUploadModal({ onImport, onClose }: CsvUploadModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState({ inserted: 0, skipped: 0 });
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCsv(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      // Auto-map
      const autoMap: Record<string, string> = {};
      for (const f of FIELD_MAP) {
        autoMap[f.key] = smartMatch(f.label, headers);
      }
      setMapping(autoMap);
      setStep('mapping');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFile(file);
  }, [handleFile]);

  const buildBookings = (): Booking[] => {
    return csvRows.map((row) => {
      const b = { ...EMPTY_BOOKING };
      for (const f of FIELD_MAP) {
        const csvCol = mapping[f.key];
        if (!csvCol) continue;
        const idx = csvHeaders.indexOf(csvCol);
        if (idx === -1) continue;
        const val = row[idx] || '';

        if (['pax_adult', 'pax_youth', 'pax_child', 'pax_infant', 'gross_revenue', 'commission_rate'].includes(f.key)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (b as any)[f.key] = Number(val.replace(/[^0-9.-]/g, '')) || 0;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (b as any)[f.key] = val;
        }
      }
      // Calculate financials
      b.commission_amount = +(b.gross_revenue * b.commission_rate / 100).toFixed(2);
      b.net_revenue = +(b.gross_revenue - b.commission_amount).toFixed(2);
      b.net_profit = +(b.net_revenue - b.ticket_cost - b.guide_cost - b.extra_cost).toFixed(2);
      if (!b.status || !['UPCOMING', 'DONE', 'NO_SHOW', 'CANCELLED_EARLY', 'CANCELLED_LATE'].includes(b.status)) {
        b.status = 'UPCOMING';
      }
      if (!b.channel) b.channel = 'Other';
      return b;
    });
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const bookings = buildBookings();
      const res = await onImport(bookings);
      setResult(res);
      setStep('result');
    } catch {
      // Error handled in hook
    } finally {
      setImporting(false);
    }
  };

  const previewBookings = step === 'preview' ? buildBookings().slice(0, 5) : [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center">
      <div className="aurelia-card p-8 w-[700px] max-h-[90vh] overflow-y-auto animate-fade-in">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-foreground">Upload CSV</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div>
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-gold bg-gold/5' : 'border-border'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={32} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-foreground font-medium">Drop your CSV file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Accepts .csv files only</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            <p className="text-xs text-muted-foreground/60 mt-4">
              Exporting from Google Sheets? File → Download → CSV. Then upload here.
            </p>
            <button onClick={downloadTemplate} className="mt-3 flex items-center gap-2 text-xs font-bold text-gold hover:underline">
              <Download size={12} /> Download Template CSV
            </button>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 'mapping' && (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Map your CSV columns to booking fields. {csvHeaders.length} columns detected, {csvRows.length} rows.
            </p>
            <div className="space-y-2 mb-6">
              {FIELD_MAP.map((f) => (
                <div key={f.key} className="grid grid-cols-[180px_1fr] gap-3 items-center">
                  <span className="text-xs font-medium text-foreground">{f.label}</span>
                  <select
                    className="aurelia-input text-xs"
                    value={mapping[f.key] || ''}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  >
                    <option value="">— skip —</option>
                    {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('upload')} className="aurelia-ghost-btn flex-1">Back</button>
              <button onClick={() => setStep('preview')} className="aurelia-gold-btn flex-1">Preview →</button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Preview first 5 rows. <span className="font-bold text-foreground">{csvRows.length} rows</span> will be imported.
            </p>
            <div className="overflow-x-auto mb-6">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 px-2 text-left text-muted-foreground font-bold">Ref</th>
                    <th className="py-2 px-2 text-left text-muted-foreground font-bold">Product</th>
                    <th className="py-2 px-2 text-left text-muted-foreground font-bold">Channel</th>
                    <th className="py-2 px-2 text-right text-muted-foreground font-bold">Revenue</th>
                    <th className="py-2 px-2 text-left text-muted-foreground font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewBookings.map((b, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-2 px-2 text-foreground">{b.booking_ref || '—'}</td>
                      <td className="py-2 px-2 text-foreground">{b.product_name || '—'}</td>
                      <td className="py-2 px-2 text-foreground">{b.channel}</td>
                      <td className="py-2 px-2 text-right text-foreground tabular-nums">€{b.gross_revenue}</td>
                      <td className="py-2 px-2 text-foreground">{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('mapping')} className="aurelia-ghost-btn flex-1">Back</button>
              <button onClick={handleImport} disabled={importing} className="aurelia-gold-btn flex-1 disabled:opacity-50">
                {importing ? 'Importing…' : `Import ${csvRows.length} rows`}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Result */}
        {step === 'result' && (
          <div className="text-center py-8">
            <p className="text-lg font-bold text-foreground mb-3">Import Complete</p>
            <p className="text-sm text-profit-positive mb-1">✅ {result.inserted} bookings imported successfully</p>
            {result.skipped > 0 && (
              <p className="text-sm text-orange-400">⚠ {result.skipped} rows skipped (duplicate booking ref)</p>
            )}
            <button onClick={onClose} className="aurelia-gold-btn mt-6">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
