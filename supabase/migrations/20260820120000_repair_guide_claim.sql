-- Safety net for the guide account-claim flow.
--
-- Bug this fixes: when Supabase email confirmation is enabled, auth.signUp() returns no session,
-- so the claim page could never call claim_guide_account(p_token) (it needs a live session to
-- read auth.uid()). The guide's auth.users row would exist, but their guides row stayed
-- unclaimed forever (auth_user_id null, claimed_at null, claim_token still set) — previously
-- fixed by hand with manual UPDATE statements.
--
-- This function is called from AuthContext on first login whenever the normal
-- auth_user_id-based guide lookup finds nothing. It looks for an unclaimed guide row (never
-- linked, never marked claimed, but genuinely issued a claim token) whose email matches the
-- now-authenticated user's own verified email, and finishes the link — the exact same fields
-- claim_guide_account() itself sets. It never touches any row that doesn't belong to the caller
-- by email match, so it can't be used to hijack another guide's account.
create or replace function public.repair_guide_claim()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_guide_id uuid;
begin
  if v_uid is null then
    return false;
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    return false;
  end if;

  -- Oldest matching invite wins if more than one exists (deterministic, not that it should
  -- normally happen — each claim token is issued to one guide row).
  select id into v_guide_id
  from public.guides
  where auth_user_id is null
    and claimed_at is null
    and claim_token is not null
    and lower(email) = lower(v_email)
  order by created_at asc
  limit 1;

  if v_guide_id is null then
    return false;
  end if;

  update public.guides
  set auth_user_id = v_uid,
      claimed_at = now(),
      claim_token = null
  where id = v_guide_id;

  return true;
end;
$$;

grant execute on function public.repair_guide_claim() to authenticated;
