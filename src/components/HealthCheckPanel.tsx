import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, ChevronDown, ChevronRight, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { localDateStr } from '@/lib/utils';
import {
  runDataAudit, summarizeFindingsForAi, AUDIT_TYPE_ORDER, AUDIT_TYPE_TITLES,
  type AuditFinding, type AuditFixTarget, type AuditType,
} from '@/lib/dataAudit';
import { loadAuditInput } from '@/lib/dataAuditLoader';
import { requestAiInsight, AI_UNAVAILABLE_MESSAGE } from '@/lib/aiInsights';

// Owner "Assistant / Health Check". Detection = exact code (lib/dataAudit.ts) over read-only,
// owner-scoped SELECTs (lib/dataAuditLoader.ts). The AI only words the findings afterwards; if it
// fails, the findings are still shown in full — they never depend on the AI.

const ITEMS_SHOWN = 25;

export default function HealthCheckPanel({ onNavigate }: { onNavigate?: (view: AuditFixTarget['view']) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<AuditFinding[] | null>(null);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [ai, setAi] = useState<{ summary: string; explanations: Record<string, string> } | null>(null);
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [open, setOpen] = useState<Set<AuditType>>(new Set());
  const [expanded, setExpanded] = useState<Set<AuditType>>(new Set());

  const run = async () => {
    if (!user) return;
    setRunning(true);
    setError(null);
    setAi(null);
    setAiState('idle');
    try {
      const result = runDataAudit(await loadAuditInput(user.id), localDateStr());
      setFindings(result);
      setRanAt(new Date());
      setOpen(new Set(result.length ? [result[0].type] : []));
      setExpanded(new Set());
      if (result.length > 0) {
        setAiState('loading');
        requestAiInsight('audit', { findings: summarizeFindingsForAi(result) })
          .then(r => { setAi(r.audit ?? null); setAiState(r.audit ? 'idle' : 'error'); })
          .catch(() => setAiState('error'));
      }
    } catch {
      setError("Couldn't read your data to run the check. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  const goFix = (fix: AuditFixTarget) => {
    onNavigate?.(fix.view);
    if (fix.path) navigate(fix.path);
  };

  const toggle = (set: Set<AuditType>, setter: (s: Set<AuditType>) => void, t: AuditType) => {
    const next = new Set(set);
    if (next.has(t)) next.delete(t); else next.add(t);
    setter(next);
  };

  const grouped = AUDIT_TYPE_ORDER
    .map(type => ({ type, items: (findings ?? []).filter(f => f.type === type) }))
    .filter(g => g.items.length > 0);

  return (
    <section className="aurelia-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="text-gold shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-bold">Assistant · Health Check</h2>
            <p className="text-sm text-muted-foreground">
              Exact checks across bookings, sessions, check-ins and reviews. Detection is done by code; the AI only explains the results. Nothing is changed.
            </p>
          </div>
        </div>
        <button onClick={run} disabled={running} className="aurelia-gold-btn px-5 py-2 font-bold text-sm disabled:opacity-50 shrink-0">
          {running ? 'Checking…' : findings ? 'Re-run check' : 'Run health check'}
        </button>
      </div>

      {running && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 size={16} className="animate-spin" /> Reading your data…
        </div>
      )}
      {error && <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-4">{error}</div>}

      {findings && !running && (
        findings.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-600/10 border border-green-600/20 text-green-700 p-4 text-sm font-semibold">
            <CheckCircle2 size={18} /> All clear — no inconsistencies found.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-4 space-y-2">
              <p className="text-sm font-semibold">
                {findings.length} item{findings.length === 1 ? '' : 's'} need{findings.length === 1 ? 's' : ''} your attention
                {ranAt && <span className="font-normal text-muted-foreground"> · checked {ranAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
              </p>
              {aiState === 'loading' && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Writing a plain-language summary…</p>
              )}
              {aiState === 'error' && (
                <p className="text-xs text-muted-foreground">{AI_UNAVAILABLE_MESSAGE} — the findings below are still exact.</p>
              )}
              {ai?.summary && (
                <>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 w-fit">
                    <AlertTriangle size={12} /> AI-generated — verify before acting
                  </div>
                  <p className="text-sm leading-relaxed">{ai.summary}</p>
                </>
              )}
            </div>

            {grouped.map(({ type, items }) => {
              const isOpen = open.has(type);
              const showAll = expanded.has(type);
              const explanation = ai?.explanations[type];
              return (
                <div key={type} className="border border-border/60 rounded-xl overflow-hidden">
                  <button onClick={() => toggle(open, setOpen, type)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30">
                    <span className="flex items-center gap-2 font-semibold text-sm">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {AUDIT_TYPE_TITLES[type]}
                    </span>
                    <span className="text-xs font-bold rounded-full bg-amber-500/15 text-amber-700 px-2 py-0.5">{items.length}</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-2">
                      {explanation && (
                        <p className="text-xs text-muted-foreground italic">
                          <span className="not-italic font-semibold text-amber-700">AI: </span>{explanation}
                        </p>
                      )}
                      <ul className="space-y-2">
                        {(showAll ? items : items.slice(0, ITEMS_SHOWN)).map(f => (
                          <li key={f.id} className="text-sm rounded-lg bg-muted/30 p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                            <span className="leading-snug break-words">{f.detail}</span>
                            <button onClick={() => goFix(f.fix)} className="text-xs font-bold text-gold hover:underline flex items-center gap-1 shrink-0">
                              Fix in {f.fix.label} <ArrowRight size={12} />
                            </button>
                          </li>
                        ))}
                      </ul>
                      {items.length > ITEMS_SHOWN && (
                        <button onClick={() => toggle(expanded, setExpanded, type)} className="text-xs text-muted-foreground hover:text-foreground underline">
                          {showAll ? 'Show fewer' : `Show all ${items.length}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </section>
  );
}
