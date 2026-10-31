import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles, MessageSquareText, HelpCircle, Tag, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import HealthCheckPanel from '@/components/HealthCheckPanel';
import type { AuditFixTarget } from '@/lib/dataAudit';
import { requestAiInsight, AI_UNAVAILABLE_MESSAGE, type AiInsightKind, type AiInsightResult } from '@/lib/aiInsights';

// Owner-only AI Insights. All AI work happens server-side in the read-only `ai-insights` Edge
// Function; this page only displays the returned text. Any failure stays contained to the card
// that triggered it — the rest of the app is unaffected.

interface PricePoint {
  pricePerPax: number;
  bookings: number;
  cancellationRate: number;
  avgGroupSize: number;
  avgNetProfitPerBooking: number;
  bookingsLast90Days: number;
}
interface PriceProduct { product: string; pricedBookings: number; pricePoints: PricePoint[] }

const EXAMPLE_QUESTIONS = ['How are bookings trending?', 'Which month was best?', 'Which channel brings the most revenue?'];

function AiLabel() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 w-fit">
      <AlertTriangle size={12} /> AI-generated — verify before acting
    </div>
  );
}

function useInsight(kind: AiInsightKind) {
  const [result, setResult] = useState<AiInsightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async (params?: { guideId?: string | null; question?: string }) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await requestAiInsight(kind, params));
    } catch (e) {
      setError(e instanceof Error ? e.message : AI_UNAVAILABLE_MESSAGE);
    } finally {
      setLoading(false);
    }
  };
  return { result, error, loading, run };
}

function InsightOutput({ state, children }: { state: ReturnType<typeof useInsight>; children?: React.ReactNode }) {
  const { result, error, loading } = state;
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 size={16} className="animate-spin" /> Analysing… this can take up to a minute.
      </div>
    );
  }
  if (error) {
    return <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-4 mt-4">{error}</div>;
  }
  if (!result) return null;
  return (
    <div className="mt-4 space-y-3">
      {result.insight ? (
        <>
          <AiLabel />
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{result.insight}</ReactMarkdown>
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-4">{result.message ?? 'Nothing to analyse yet.'}</div>
      )}
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <Icon size={20} className="text-gold shrink-0 mt-0.5" />
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

export default function AiInsightsPage({ onNavigate }: { onNavigate?: (view: AuditFixTarget['view']) => void } = {}) {
  const { user } = useAuth();
  const [guides, setGuides] = useState<{ id: string; name: string }[]>([]);
  const [guideId, setGuideId] = useState('');
  const [question, setQuestion] = useState('');

  const reviews = useInsight('reviews');
  const ask = useInsight('ask');
  const prices = useInsight('price-points');

  useEffect(() => {
    if (!user) return;
    supabase
      .from('guides')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name')
      .then(({ data }) => setGuides(data ?? []));
  }, [user]);

  const priceProducts = (prices.result?.data as { products?: PriceProduct[] } | undefined)?.products ?? [];

  return (
    <div className="p-4 md:p-8 pb-32 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="pb-6 border-b border-border/50">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-2">
          <Sparkles className="text-gold" size={26} /> AI Insights
        </h1>
        <p className="text-muted-foreground text-sm">
          Read-only analysis by Google Gemini. The AI only receives small summaries of your data and can never change anything.
          All output is AI-generated — verify before acting.
        </p>
      </div>

      {/* ASSISTANT / HEALTH CHECK — code-detected issues, AI-explained */}
      <HealthCheckPanel onNavigate={onNavigate} />

      {/* 1. REVIEW INSIGHTS */}
      <section className="aurelia-card p-5 md:p-6">
        <SectionHeader icon={MessageSquareText} title="Review insights" subtitle="What guests praise, what to improve, and patterns — from approved review comments only (no names, no financials)." />
        <div className="flex flex-wrap gap-3">
          <select value={guideId} onChange={e => setGuideId(e.target.value)} className="aurelia-input px-3 py-2 text-sm min-w-[200px]">
            <option value="">Whole company</option>
            {guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => reviews.run({ guideId: guideId || null })} disabled={reviews.loading} className="aurelia-gold-btn px-5 py-2 font-bold text-sm disabled:opacity-50">
            Analyse reviews
          </button>
        </div>
        <InsightOutput state={reviews}>
          {reviews.result?.meta && (
            <p className="text-xs text-muted-foreground">
              Based on {reviews.result.meta.commentsIncluded} comment(s) from {reviews.result.meta.totalApprovedReviews} approved review(s)
              {reviews.result.meta.averageStars != null && ` · average ${reviews.result.meta.averageStars}★`}
            </p>
          )}
        </InsightOutput>
      </section>

      {/* 2. ASK YOUR DATA */}
      <section className="aurelia-card p-5 md:p-6">
        <SectionHeader icon={HelpCircle} title="Ask your data" subtitle="Numbers are computed from your bookings first; the AI only sees that summary and your question." />
        <form
          onSubmit={e => { e.preventDefault(); if (question.trim()) ask.run({ question: question.trim() }); }}
          className="flex flex-wrap gap-3"
        >
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            maxLength={500}
            placeholder="e.g. How are bookings trending?"
            className="aurelia-input px-3 py-2 text-sm flex-1 min-w-[240px]"
          />
          <button type="submit" disabled={ask.loading || !question.trim()} className="aurelia-gold-btn px-5 py-2 font-bold text-sm disabled:opacity-50">
            Ask
          </button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          {EXAMPLE_QUESTIONS.map(q => (
            <button key={q} type="button" onClick={() => setQuestion(q)} className="text-xs px-2.5 py-1 rounded-full border border-border hover:bg-muted/50">
              {q}
            </button>
          ))}
        </div>
        <InsightOutput state={ask}>
          {ask.result?.data != null && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Show the computed numbers the AI was given</summary>
              <pre className="mt-2 p-3 bg-muted/40 rounded-lg overflow-auto max-h-80">{JSON.stringify(ask.result.data, null, 2)}</pre>
            </details>
          )}
        </InsightOutput>
      </section>

      {/* 3. PRICE-POINT INSIGHTS */}
      <section className="aurelia-card p-5 md:p-6">
        <SectionHeader icon={Tag} title="Price-point insights" subtitle="Bookings at each price per pax, over time, per product. Recomputed from all your bookings each time — it gets sharper as data grows." />
        <button onClick={() => prices.run()} disabled={prices.loading} className="aurelia-gold-btn px-5 py-2 font-bold text-sm disabled:opacity-50">
          Analyse price points
        </button>
        <InsightOutput state={prices}>
          {priceProducts.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Show the computed price table the AI was given</summary>
              <div className="mt-2 space-y-4 overflow-auto">
                {priceProducts.map(p => (
                  <div key={p.product}>
                    <div className="font-semibold mb-1">{p.product} <span className="text-muted-foreground font-normal">· {p.pricedBookings} bookings</span></div>
                    <table className="w-full text-left">
                      <thead className="text-muted-foreground">
                        <tr><th className="pr-3">Price/pax</th><th className="pr-3">Bookings</th><th className="pr-3">Last 90d</th><th className="pr-3">Cancel %</th><th className="pr-3">Avg group</th><th>Avg net/booking</th></tr>
                      </thead>
                      <tbody>
                        {p.pricePoints.map(pp => (
                          <tr key={pp.pricePerPax} className="border-t border-border/40">
                            <td className="pr-3">{pp.pricePerPax}</td>
                            <td className="pr-3">{pp.bookings}</td>
                            <td className="pr-3">{pp.bookingsLast90Days}</td>
                            <td className="pr-3">{Math.round(pp.cancellationRate * 100)}%</td>
                            <td className="pr-3">{pp.avgGroupSize}</td>
                            <td>{pp.avgNetProfitPerBooking}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </details>
          )}
        </InsightOutput>
      </section>
    </div>
  );
}
