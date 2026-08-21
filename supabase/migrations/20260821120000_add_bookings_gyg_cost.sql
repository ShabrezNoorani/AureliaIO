-- Schema-only addition: a per-booking cost field for the GYG (GetYourGuide) channel, alongside
-- the existing channel-agnostic cost columns (ticket_cost, guide_cost, extra_cost, etc.). Not yet
-- wired into any net-profit calculation or UI — that's a deliberate follow-up, not part of this
-- change.
alter table public.bookings add column if not exists gyg_cost numeric default 0;
