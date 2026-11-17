-- PIXEL COIN PUSHER: player profiles + cloud saves.
-- Run in the Supabase SQL editor (or `supabase db push`). Idempotent where practical.
-- Security model: every row belongs to auth.uid(); Row Level Security is ON; the browser only ever uses the publishable key.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 24 and display_name !~ '[[:cntrl:]]'),
  avatar_id    text not null default 'coin' check (avatar_id in ('coin','gem','ball','trophy','boost','flag','gear','chart')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- a profile row is created for every new auth user (display name comes from the provider metadata when there is one)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  nm text;
begin
  nm := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
                 nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Player');
  nm := regexp_replace(left(nm, 24), '[[:cntrl:]]', '', 'g');
  if char_length(btrim(nm)) = 0 then nm := 'Player'; end if;
  insert into public.profiles (id, display_name) values (new.id, btrim(nm)) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- cloud saves
-- One save per (user, game): the game has a single progression, so no save slots.
create table if not exists public.user_game_saves (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  game_id           text not null default 'pixel-coin-pusher' check (char_length(game_id) between 1 and 64),
  save_data         jsonb not null check (jsonb_typeof(save_data) = 'object' and pg_column_size(save_data) <= 200000),
  save_version      integer not null check (save_version between 1 and 99),
  revision          bigint not null default 1 check (revision >= 1),   -- incremented by every accepted write: the optimistic-concurrency token
  progress_score    double precision not null default 0 check (progress_score >= 0), -- lifetime earnings, informational (shown in conflict dialogs)
  device_id         text check (device_id is null or char_length(device_id) <= 64),
  client_saved_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, game_id)
);
create index if not exists user_game_saves_user_idx on public.user_game_saves (user_id);
alter table public.user_game_saves enable row level security;

drop policy if exists "saves_select_own" on public.user_game_saves;
drop policy if exists "saves_insert_own" on public.user_game_saves;
drop policy if exists "saves_update_own" on public.user_game_saves;
drop policy if exists "saves_delete_own" on public.user_game_saves;
create policy "saves_select_own" on public.user_game_saves for select to authenticated using ((select auth.uid()) = user_id);
create policy "saves_insert_own" on public.user_game_saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saves_update_own" on public.user_game_saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saves_delete_own" on public.user_game_saves for delete to authenticated using ((select auth.uid()) = user_id);

-- identity / bookkeeping columns can never be changed by a client, and every update bumps the revision
create or replace function public.touch_game_save() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.game_id := old.game_id; new.created_at := old.created_at; new.id := old.id;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists touch_game_save on public.user_game_saves;
create trigger touch_game_save before insert or update on public.user_game_saves for each row execute function public.touch_game_save();

-- Conflict-aware write. SECURITY INVOKER: Row Level Security applies and the owner is always auth.uid() (a user id sent by the
-- client is never used). Returns {status: 'ok'|'conflict', revision, updated_at, server_*}. An older client state can never
-- overwrite a newer cloud save unless the player explicitly chose it (p_force).
create or replace function public.save_game(p_game_id text, p_save_version integer, p_save_data jsonb, p_base_revision bigint,
                                            p_progress_score double precision default 0, p_device_id text default null,
                                            p_client_saved_at timestamptz default null, p_force boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cur public.user_game_saves%rowtype;
  res public.user_game_saves%rowtype;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_game_id is null or char_length(p_game_id) not between 1 and 64 then raise exception 'invalid game id' using errcode = '22023'; end if;
  if p_save_version is null or p_save_version not between 1 and 99 then raise exception 'invalid save version' using errcode = '22023'; end if;
  if p_save_data is null or jsonb_typeof(p_save_data) <> 'object' or pg_column_size(p_save_data) > 200000 then raise exception 'invalid save data' using errcode = '22023'; end if;

  select * into cur from public.user_game_saves where user_id = uid and game_id = p_game_id for update;
  if not found then
    insert into public.user_game_saves (user_id, game_id, save_data, save_version, progress_score, device_id, client_saved_at)
    values (uid, p_game_id, p_save_data, p_save_version, greatest(coalesce(p_progress_score, 0), 0), p_device_id, p_client_saved_at)
    returning * into res;
    return jsonb_build_object('status', 'ok', 'revision', res.revision, 'updated_at', res.updated_at);
  end if;
  if not coalesce(p_force, false) and (p_base_revision is null or p_base_revision <> cur.revision) then
    return jsonb_build_object('status', 'conflict', 'revision', cur.revision, 'updated_at', cur.updated_at,
                              'server_save_version', cur.save_version, 'server_progress_score', cur.progress_score, 'server_client_saved_at', cur.client_saved_at);
  end if;
  update public.user_game_saves set save_data = p_save_data, save_version = p_save_version, progress_score = greatest(coalesce(p_progress_score, 0), 0),
         device_id = p_device_id, client_saved_at = p_client_saved_at
   where id = cur.id returning * into res;
  return jsonb_build_object('status', 'ok', 'revision', res.revision, 'updated_at', res.updated_at);
end $$;

-- ---------------------------------------------------------------- account deletion
-- Deleting the auth user cascades to profiles and user_game_saves (on delete cascade). Only the signed-in user can delete themself.
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = uid;
end $$;

-- ---------------------------------------------------------------- privileges (explicit: do not rely on project defaults)
revoke all on public.profiles, public.user_game_saves from anon, public;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_game_saves to authenticated;
revoke all on function public.save_game(text, integer, jsonb, bigint, double precision, text, timestamptz, boolean) from public, anon;
grant execute on function public.save_game(text, integer, jsonb, bigint, double precision, text, timestamptz, boolean) to authenticated;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
