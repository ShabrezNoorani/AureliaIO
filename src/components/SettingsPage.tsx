import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';

const STORAGE_KEY = 'gsheet_id';
const DEFAULT_SHEET_ID = '1EAI0SHtkJD5HHVj25rJcnzmoksTug249eIT4_JmiOR8';

export default function SettingsPage() {
  const [sheetId, setSheetId] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setSheetId(stored || DEFAULT_SHEET_ID);
  }, []);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, sheetId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-2">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">Configure integrations and preferences.</p>

      {/* Google Sheets Integration */}
      <div className="aurelia-card p-6 border-l-[3px] border-l-gold">
        <div className="flex items-center gap-3 mb-5">
          <Settings size={18} className="text-gold" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Google Sheets Integration</h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Spreadsheet ID
            </label>
            <input
              className="aurelia-input font-mono text-xs"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="Enter your Google Sheets spreadsheet ID"
            />
            <p className="text-[11px] text-muted-foreground/60">
              The long ID from your Google Sheets URL:
              <code className="text-[10px] text-muted-foreground bg-background px-1 py-0.5 rounded ml-1">
                docs.google.com/spreadsheets/d/<span className="text-gold">THIS_PART</span>/edit
              </code>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleSave} className="aurelia-gold-btn text-xs">
              Save Spreadsheet ID
            </button>
            {saved && (
              <span className="text-xs text-profit-positive font-bold animate-fade-in">✓ Saved</span>
            )}
          </div>

          <div className="p-3 rounded-lg bg-surface-subtle border border-border/50 mt-4">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-bold text-foreground">How it works:</span> Your Google Sheet must be set to{' '}
              <span className="font-bold text-gold">"Anyone with the link can view"</span> in sharing settings.
              The Ledger and Admin Costs pages have a "Sync from Google Sheets" button that will
              pull data from the <code className="text-[10px] bg-background px-1 py-0.5 rounded">Master Data</code> and{' '}
              <code className="text-[10px] bg-background px-1 py-0.5 rounded">Admin_Costs</code> sheets respectively.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
