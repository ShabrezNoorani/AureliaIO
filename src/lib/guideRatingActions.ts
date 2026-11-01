import { SupabaseClient } from '@supabase/supabase-js';
import { logChange } from '@/lib/changeLog';
import type { GuideRatingRow } from '@/lib/guidePerformance';

// Every owner write to guide_ratings goes through here so it's logged exactly once, in exactly
// one place — used by both the Guides page's review modal and the Guide Dashboard's detail panel,
// so neither surface can silently mutate a rating without a change_logs row.

export async function verifyGuideRating(
  supabase: SupabaseClient,
  userId: string,
  rating: GuideRatingRow,
  guideName: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('guide_ratings')
    .update({ verified: true, verified_at: new Date().toISOString() })
    .eq('id', rating.id);
  if (error) return { error: error.message };

  await logChange(supabase, userId, {
    tableName: 'guide_ratings',
    recordId: rating.id,
    fieldName: 'verified',
    oldValue: false,
    newValue: true,
    description: `Verified a ${rating.stars}★ rating (×${rating.quantity}) for ${guideName}`,
  });
  return { error: null };
}

export async function deleteGuideRating(
  supabase: SupabaseClient,
  userId: string,
  rating: GuideRatingRow,
  guideName: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('guide_ratings').delete().eq('id', rating.id);
  if (error) return { error: error.message };

  await logChange(supabase, userId, {
    tableName: 'guide_ratings',
    recordId: rating.id,
    description: `Deleted a ${rating.stars}★ rating (×${rating.quantity}) for ${guideName}`,
    oldValue: { stars: rating.stars, quantity: rating.quantity, source: rating.source, note: rating.note },
  });
  return { error: null };
}

export interface RatingEditPayload {
  stars: number;
  quantity: number;
  source: string | null;
  note: string | null;
}

export async function updateGuideRating(
  supabase: SupabaseClient,
  userId: string,
  rating: GuideRatingRow,
  next: RatingEditPayload,
  guideName: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('guide_ratings')
    .update({ stars: next.stars, quantity: next.quantity, source: next.source, note: next.note })
    .eq('id', rating.id);
  if (error) return { error: error.message };

  await logChange(supabase, userId, {
    tableName: 'guide_ratings',
    recordId: rating.id,
    description: `Edited a rating for ${guideName}`,
    oldValue: { stars: rating.stars, quantity: rating.quantity, source: rating.source, note: rating.note },
    newValue: next,
  });
  return { error: null };
}

export async function addGuideRating(
  supabase: SupabaseClient,
  userId: string,
  guideId: string,
  guideName: string,
  payload: RatingEditPayload
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('guide_ratings')
    .insert({
      user_id: userId,
      guide_id: guideId,
      added_by: userId,
      verified: true,
      verified_at: new Date().toISOString(),
      stars: payload.stars,
      quantity: payload.quantity,
      source: payload.source,
      note: payload.note,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await logChange(supabase, userId, {
    tableName: 'guide_ratings',
    recordId: data.id,
    description: `Added a ${payload.stars}★ rating (×${payload.quantity}) for ${guideName}`,
    newValue: payload,
  });
  return { error: null };
}

export interface InvoicePaymentUpdate {
  payment_sent: boolean;
  payment_date: string | null;
}

export async function updateGuideMonthlyPayment(
  supabase: SupabaseClient,
  userId: string,
  monthlyId: string,
  guideName: string,
  monthLabel: string,
  prev: InvoicePaymentUpdate,
  next: InvoicePaymentUpdate
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('guide_monthly')
    .update({ payment_sent: next.payment_sent, payment_date: next.payment_date })
    .eq('id', monthlyId);
  if (error) return { error: error.message };

  await logChange(supabase, userId, {
    tableName: 'guide_monthly',
    recordId: monthlyId,
    fieldName: 'payment_sent',
    oldValue: prev,
    newValue: next,
    description: `${next.payment_sent ? 'Marked paid' : 'Marked unpaid'}: ${guideName}'s ${monthLabel} invoice`,
  });
  return { error: null };
}

/**
 * Marking a VIRTUAL monthly row paid for the first time (see buildUnifiedMonthlyRows in
 * lib/guidePerformance.ts) — a month whose only earnings are session-based pay has no real
 * guide_monthly row yet, so this INSERTs one instead of updating one. Once inserted, that month
 * behaves exactly like any imported guide_monthly row on every later load (a real id, editable via
 * updateGuideMonthlyPayment above).
 */
export async function insertGuideMonthlyPayment(
  supabase: SupabaseClient,
  userId: string,
  row: { guide_id: string | null; guide_name: string | null; month: string | null; amount_owed: number | null; tours_completed: number | null },
  next: InvoicePaymentUpdate
): Promise<{ error: string | null; id: string | null }> {
  const { data, error } = await supabase
    .from('guide_monthly')
    .insert({
      user_id: userId,
      guide_id: row.guide_id,
      guide_name: row.guide_name,
      month: row.month,
      amount_owed: row.amount_owed,
      tours_completed: row.tours_completed,
      payment_sent: next.payment_sent,
      payment_date: next.payment_date,
    })
    .select('id')
    .single();
  if (error) return { error: error.message, id: null };

  await logChange(supabase, userId, {
    tableName: 'guide_monthly',
    recordId: data.id,
    fieldName: 'payment_sent',
    newValue: next,
    description: `${next.payment_sent ? 'Marked paid' : 'Created'}: ${row.guide_name || 'Guide'}'s ${row.month || 'this month'} invoice (session-based earnings)`,
  });
  return { error: null, id: data.id };
}

/**
 * Owner-only: sets (or clears, with amount null/0) a guide's MONTH-END bonus — guide_monthly.bonus
 * + bonus_note on that guide's row for that month. Touches only that one row: UPDATEs it when the
 * month already has a guide_monthly row, otherwise INSERTs a minimal unpaid row carrying just the
 * bonus (amount_owed/tours_completed left null, so buildUnifiedMonthlyRows still adds the month's
 * session-based pay on top exactly once). A DB trigger additionally rejects any non-owner write to
 * these two columns (see migration 20261101120000_guide_monthly_bonus.sql).
 */
export async function saveMonthEndBonus(
  supabase: SupabaseClient,
  userId: string,
  params: {
    guideId: string;
    guideName: string;
    month: string;
    amount: number | null;
    note: string | null;
    existing: { id: string; bonus?: number | null; bonus_note?: string | null } | null;
  }
): Promise<{ error: string | null }> {
  const { guideId, guideName, month, existing } = params;
  const amount = params.amount && params.amount > 0 ? Math.round(params.amount * 100) / 100 : null;
  const note = params.note?.trim() || null;

  if (existing) {
    const { error } = await supabase
      .from('guide_monthly')
      .update({ bonus: amount, bonus_note: note })
      .eq('id', existing.id)
      .eq('user_id', userId);
    if (error) return { error: error.message };
    await logChange(supabase, userId, {
      tableName: 'guide_monthly',
      recordId: existing.id,
      fieldName: 'bonus',
      oldValue: { bonus: existing.bonus ?? null, bonus_note: existing.bonus_note ?? null },
      newValue: { bonus: amount, bonus_note: note },
      description: amount
        ? `Set ${guideName}'s ${month} month-end bonus to €${amount.toFixed(2)}`
        : `Removed ${guideName}'s ${month} month-end bonus`,
    });
    return { error: null };
  }

  if (!amount) return { error: null }; // nothing to store for a month with no row yet
  const { data, error } = await supabase
    .from('guide_monthly')
    .insert({ user_id: userId, guide_id: guideId, guide_name: guideName, month, bonus: amount, bonus_note: note, payment_sent: false })
    .select('id')
    .single();
  if (error) return { error: error.message };
  await logChange(supabase, userId, {
    tableName: 'guide_monthly',
    recordId: data.id,
    fieldName: 'bonus',
    newValue: { bonus: amount, bonus_note: note },
    description: `Added a €${amount.toFixed(2)} month-end bonus for ${guideName} (${month})`,
  });
  return { error: null };
}
