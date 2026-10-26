import { SupabaseClient } from '@supabase/supabase-js';
import { logChange } from '@/lib/changeLog';
import type { GuideReviewRow } from '@/lib/guidePerformance';

// Every owner write to guide_reviews goes through here so it's logged exactly once, in exactly
// one place. The ONE guide-side write is submitGuideReview below, which goes through the
// submit_guide_review() RPC so the row is always created 'pending' (a guide can never insert an
// approved review). Pending reviews only start counting once the owner approves them here.

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

/** Toggles a review's `excluded_from_score` flag — the review itself is never touched/removed,
    only whether its points count toward that guide's score (see computeGuideReviewScore). */
export async function setReviewExcluded(
  supabase: SupabaseClient,
  userId: string,
  review: GuideReviewRow,
  excluded: boolean,
  guideName: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('guide_reviews')
    .update({ excluded_from_score: excluded })
    .eq('id', review.id);
  if (error) return { error: error.message };

  await logChange(supabase, userId, {
    tableName: 'guide_reviews',
    recordId: review.id,
    description: `${excluded ? 'Excluded' : 'Re-included'} a ${review.stars}★ review for ${guideName} from the score`,
    oldValue: { excluded_from_score: review.excluded_from_score ?? false },
    newValue: { excluded_from_score: excluded },
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

/** Owner approves a guide-submitted review: from now on it counts exactly like an owner-entered one. */
export async function approveGuideReview(
  supabase: SupabaseClient,
  userId: string,
  review: GuideReviewRow,
  guideName: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('guide_reviews')
    .update({ approval_status: 'approved' })
    .eq('id', review.id)
    .eq('user_id', userId)
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Review not found' };

  await logChange(supabase, userId, {
    tableName: 'guide_reviews',
    recordId: review.id,
    fieldName: 'approval_status',
    description: `Approved a guide-submitted ${review.stars}★ review for ${guideName}${review.platform ? ` (${review.platform})` : ''}`,
    oldValue: { approval_status: 'pending' },
    newValue: { approval_status: 'approved' },
  });
  return { error: null };
}

/** Owner rejects a guide-submitted review: discarded (deleted). The change log keeps a copy. */
export async function rejectGuideReview(
  supabase: SupabaseClient,
  userId: string,
  review: GuideReviewRow,
  guideName: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('guide_reviews')
    .delete()
    .eq('id', review.id)
    .eq('user_id', userId)
    .eq('approval_status', 'pending')
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Review not found' };

  await logChange(supabase, userId, {
    tableName: 'guide_reviews',
    recordId: review.id,
    fieldName: 'approval_status',
    description: `Rejected a guide-submitted ${review.stars}★ review for ${guideName}${review.platform ? ` (${review.platform})` : ''}`,
    oldValue: {
      approval_status: 'pending', stars: review.stars, reviewer_name: review.reviewer_name,
      comment: review.comment, platform: review.platform, review_date: review.review_date,
    },
    newValue: { approval_status: 'rejected' },
  });
  return { error: null };
}

export type GuideReviewSubmission = Omit<ReviewPayload, 'guide_id'>;

/** Guide-side: submit a review about themselves. The RPC resolves guide_id/user_id from the
    caller (never trusted from the client) and always inserts it as 'pending'. */
export async function submitGuideReview(
  supabase: SupabaseClient,
  review: GuideReviewSubmission
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('submit_guide_review', {
    p_stars: review.stars,
    p_reviewer_name: review.reviewer_name,
    p_comment: review.comment,
    p_platform: review.platform,
    p_review_date: review.review_date,
  });
  if (error) {
    return { error: error.code === 'PGRST202' ? 'Review submission isn’t set up yet — please ask your tour company.' : error.message };
  }
  if (!data) return { error: 'Could not submit this review.' };
  return { error: null };
}
