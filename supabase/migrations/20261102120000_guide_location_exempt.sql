-- Per-guide "location exempt" flag.
-- An exempt guide's check-in never requests or stores geolocation (no guide_arrivals row is
-- written for them), and their punctuality is treated as "no data" — excluded from the
-- punctuality metric, so the combined score falls back to review-only rather than penalizing them.
-- Additive only: one boolean column defaulting to false, so every existing guide keeps today's
-- behavior. No existing row's other data is changed, moved or deleted.
-- Run manually in the Supabase SQL editor.

alter table public.guides
  add column if not exists location_exempt boolean not null default false;

comment on column public.guides.location_exempt is
  'Owner-only. When true, check-in never captures this guide''s location and their punctuality is excluded from scoring (treated as no data).';

-- Owner-only write guard, independent of whatever RLS policies already exist on guides (a guide
-- can update parts of their own row from their profile page): only the company owner
-- (guides.user_id) may set or change location_exempt. Service-role / SQL-editor sessions
-- (auth.uid() is null) are not blocked. Same pattern as guide_monthly_bonus_owner_only.
create or replace function public.guides_location_exempt_owner_only()
returns trigger
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.location_exempt and auth.uid() is distinct from new.user_id then
      raise exception 'Only the owner can mark a guide as location exempt';
    end if;
  elsif new.location_exempt is distinct from old.location_exempt
        and auth.uid() is distinct from old.user_id then
    raise exception 'Only the owner can change a guide''s location exemption';
  end if;
  return new;
end;
$$;

drop trigger if exists guides_location_exempt_owner_only on public.guides;
create trigger guides_location_exempt_owner_only
  before insert or update on public.guides
  for each row execute function public.guides_location_exempt_owner_only();
