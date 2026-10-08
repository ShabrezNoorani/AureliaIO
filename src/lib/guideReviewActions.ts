import { SupabaseClient } from '@supabase/supabase-js';
import { logChange } from '@/lib/changeLog';
import type { GuideReviewRow } from '@/lib/guidePerformance';

// Every owner write to guide_reviews goes through here so it's logged exactly once, in exactly
// one place — guide_reviews is admin-entered only (a guide can read their own rows but never
// writes here), so every insert/update/delete is always an owner action.

export interface ReviewPayload {
  guide_id: string;
  stars: number;
  reviewer_name: string | null;
  comment: string | null;
  platform: string | null;
  review_date: string;
}

export async function addGuideReview(
  supabase: SupabaseClient,
  userId: string,
  guideName: string,
  payload: ReviewPayload
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('guide_reviews')
    .insert({ user_id: userId, ...payload })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await logChange(supabase, userId, {
    tableName: 'guide_reviews',
    recordId: data.id,
    description: `Added a ${payload.stars}★ review for ${guideName}${payload.platform ? ` (${payload.platform})` : ''}`,
    newValue: payload,
  });
  return { error: null };
}

export async function updateGuideReview(
  supabase: SupabaseClient,
  userId: string,
  review: GuideReviewRow,
  next: ReviewPayload,
  guideName: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('guide_reviews')
    .update(next)
    .eq('id', review.id);
  if (error) return { error: error.message };

  await logChange(supabase, userId, {
    tableName: 'guide_reviews',
    recordId: review.id,
    description: `Edited a review for ${guideName}`,
    oldValue: {
      stars: review.stars, reviewer_name: review.reviewer_name, comment: review.comment,
      platform: review.platform, review_date: review.review_date,
    },
    newValue: next,
  });
  return { error: null };
}

export async function deleteGuideReview(
  supabase: SupabaseClient,
  userId: string,
  review: GuideReviewRow,
  guideName: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('guide_reviews').delete().eq('id', review.id);
  if (error) return { error: error.message };

  await logChange(supabase, userId, {
    tableName: 'guide_reviews',
    recordId: review.id,
    description: `Deleted a ${review.stars}★ review for ${guideName}${review.platform ? ` (${review.platform})` : ''}`,
    oldValue: {
      stars: review.stars, reviewer_name: review.reviewer_name, comment: review.comment,
      platform: review.platform, review_date: review.review_date,
    },
  });
  return { error: null };
}
