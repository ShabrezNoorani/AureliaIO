-- Month-end bonus on guide_monthly (one row per guide per month).
-- Additive only: two nullable columns, no existing row is changed, no data is moved or deleted.
-- Run manually in the Supabase SQL editor.

alter table public.guide_monthly
  add column if not exists bonus numeric(10, 2),
  add column if not exists bonus_note text;

comment on column public.guide_monthly.bonus is
  'Month-end lump-sum bonus for this guide and month (not tied to a tour). Owner-only write.';
comment on column public.guide_monthly.bonus_note is
  'Optional owner note explaining the month-end bonus.';

-- Owner-only write guard for the two new columns, independent of whatever RLS policies exist on
-- guide_monthly: only the company owner (guide_monthly.user_id) may set or change bonus /
-- bonus_note. Guides can still read their own row exactly as before. Service-role / SQL-editor
-- sessions (auth.uid() is null) are not blocked.
create or replace function public.guide_monthly_bonus_owner_only()
returns trigger
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if (new.bonus is not null or new.bonus_note is not null) and auth.uid() is distinct from new.user_id then
      raise exception 'Only the owner can set a month-end bonus';
    end if;
  elsif (new.bonus is distinct from old.bonus or new.bonus_note is distinct from old.bonus_note)
        and auth.uid() is distinct from old.user_id then
    raise exception 'Only the owner can change a month-end bonus';
  end if;
  return new;
end;
$$;

drop trigger if exists guide_monthly_bonus_owner_only on public.guide_monthly;
create trigger guide_monthly_bonus_owner_only
  before insert or update on public.guide_monthly
  for each row execute function public.guide_monthly_bonus_owner_only();
