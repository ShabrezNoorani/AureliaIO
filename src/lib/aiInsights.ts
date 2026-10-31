import { supabase } from './supabase';

// Thin client for the owner-only, read-only `ai-insights` Edge Function (supabase/functions/
// ai-insights). The Gemini key never touches the browser — this only sends the request type plus
// a guide id / question, with the caller's own session token attached by supabase-js. Everything
// returned is display-only text; nothing here writes to the database.

export const AI_UNAVAILABLE_MESSAGE = 'AI insights unavailable right now';

export type AiInsightKind = 'reviews' | 'ask' | 'price-points' | 'audit';

export interface AiInsightResult {
  /** Markdown text from Gemini, or null when there was nothing to analyse (see `message`). */
  insight: string | null;
  message?: string;
  /** The pre-computed summary that was sent to the AI (ask / price-points) — shown so the owner
      can check the AI's claims against the real numbers. */
  data?: unknown;
  meta?: { totalApprovedReviews: number; averageStars: number | null; commentsIncluded: number };
  /** kind 'audit' only — AI wording of code-detected findings (never the findings themselves). */
  audit?: { summary: string; explanations: Record<string, string> };
}

/** Error whose message is always safe to show the user as-is. */
export class AiInsightError extends Error {}

export async function requestAiInsight(
  kind: AiInsightKind,
  params: { guideId?: string | null; question?: string; findings?: unknown } = {}
): Promise<AiInsightResult> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-insights', {
      body: { kind, ...params },
    });
    if (error) {
      // Only pass through the function's own client-facing validation/permission messages; any
      // other failure (Gemini down, rate-limited, network) collapses to the generic message.
      const ctx = (error as { context?: Response }).context;
      const status = ctx?.status;
      if (status === 400 || status === 403 || status === 404 || status === 429) {
        const body = await ctx!.json().catch(() => null);
        if (body?.error) throw new AiInsightError(String(body.error));
      }
      throw new AiInsightError(AI_UNAVAILABLE_MESSAGE);
    }
    return data as AiInsightResult;
  } catch (e) {
    if (e instanceof AiInsightError) throw e;
    throw new AiInsightError(AI_UNAVAILABLE_MESSAGE);
  }
}
