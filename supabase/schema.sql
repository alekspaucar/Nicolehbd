-- Initial setup for one private, shared collection. Run once in a connected
-- Supabase project's SQL Editor. This file is not an applied migration.
-- It intentionally stops if song_dedications already exists: inspect that
-- table before adapting this setup to an existing database.
begin;

create table public.song_dedications (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  url text not null check (char_length(url) between 1 and 2048),
  message text not null default '' check (char_length(message) <= 1000),
  direction text not null check (direction in ('to-alexander', 'to-anis')),
  fingerprint text not null unique check (fingerprint ~ '^[a-f0-9]{64}$')
);

create index song_dedications_created_at_id_idx
  on public.song_dedications (created_at desc, id desc);

alter table public.song_dedications enable row level security;
alter table public.song_dedications force row level security;

-- Revoke old project defaults on this table only. There are no public policies.
-- Only the Edge Function uses service_role, which Supabase gives BYPASSRLS.
revoke all on table public.song_dedications from public, anon, authenticated, service_role;
grant select, insert on table public.song_dedications to service_role;

revoke all on sequence public.song_dedications_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.song_dedications_id_seq to service_role;

commit;
