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
