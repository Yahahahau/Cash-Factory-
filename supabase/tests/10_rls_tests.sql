\set ON_ERROR_STOP off
\pset pager off
create temp table results(name text, ok boolean, detail text);
grant all on results to public;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test', '{"full_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test', '{}');

-- profile trigger
insert into results select 'profile created by trigger (name from metadata)', (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Alice', null;
insert into results select 'profile name falls back to email prefix', (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 'bob', null;

-- helper: run a statement as a given user, record outcome
create or replace function pg_temp.as_user(uid text, role_name text, sql text) returns text language plpgsql as $$
declare out text;
begin
  execute format('set local role %I', role_name);
  perform set_config('request.jwt.claim.sub', coalesce(uid, ''), true);
  begin
    execute sql into out;
  exception when others then out := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  reset role;
  return out;
end $$;
grant execute on function pg_temp.as_user(text, text, text) to public;

begin;
-- Alice saves (first write)
insert into results select 'alice first save ok', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$select (public.save_game('pixel-coin-pusher', 3, '{"state":{"cash":10}}', null, 10, 'dev-a', now(), false))->>'status'$q$) = 'ok', null;
-- revision 1, writing again with correct base works and bumps revision
insert into results select 'alice update with correct base ok', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$select (public.save_game('pixel-coin-pusher', 3, '{"state":{"cash":20}}', 1, 20, 'dev-a', now(), false))->>'revision'$q$) = '2', null;
-- stale base is a conflict and does NOT overwrite
insert into results select 'stale write returns conflict', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$select (public.save_game('pixel-coin-pusher', 3, '{"state":{"cash":1}}', 1, 1, 'dev-b', now(), false))->>'status'$q$) = 'conflict', null;
insert into results select 'stale write did not overwrite newer data', (select save_data #>> '{state,cash}' from public.user_game_saves where user_id = '11111111-1111-1111-1111-111111111111') = '20', null;
-- null base against existing row is a conflict (never-synced device)
insert into results select 'never-synced device cannot silently overwrite', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$select (public.save_game('pixel-coin-pusher', 3, '{"state":{"cash":5}}', null, 5, 'dev-c', now(), false))->>'status'$q$) = 'conflict', null;
-- explicit force (player chose "keep this device") works
insert into results select 'explicit force overwrite works', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$select (public.save_game('pixel-coin-pusher', 3, '{"state":{"cash":5}}', null, 5, 'dev-c', now(), true))->>'status'$q$) = 'ok', null;
-- payload validation
insert into results select 'non-object payload rejected', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$select public.save_game('pixel-coin-pusher', 3, '[1,2]'::jsonb, 3, 0, null, null, false)::text$q$) like 'ERR:22023%', null;
insert into results select 'bad save_version rejected', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$select public.save_game('pixel-coin-pusher', 500, '{}'::jsonb, 3, 0, null, null, false)::text$q$) like 'ERR:22023%', null;
insert into results select 'oversized payload rejected', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$select public.save_game('pixel-coin-pusher', 3, jsonb_build_object('x', repeat('a', 300000)), 3, 0, null, null, false)::text$q$) like 'ERR:%', null;

-- Bob cannot see or touch Alice
insert into results select 'bob cannot read alice save (select returns 0 rows)', pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated',
  $q$select count(*)::text from public.user_game_saves where user_id = '11111111-1111-1111-1111-111111111111'$q$) = '0', null;
insert into results select 'bob select * sees none of alices rows', pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated',
  $q$select count(*)::text from public.user_game_saves$q$) = '0', null;
insert into results select 'bob cannot update alice save (0 rows)', pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated',
  $q$with u as (update public.user_game_saves set save_data = '{"hack":1}' where user_id = '11111111-1111-1111-1111-111111111111' returning 1) select count(*)::text from u$q$) = '0', null;
insert into results select 'bob cannot delete alice save (0 rows)', pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated',
  $q$with d as (delete from public.user_game_saves where user_id = '11111111-1111-1111-1111-111111111111' returning 1) select count(*)::text from d$q$) = '0', null;
insert into results select 'bob cannot insert a row owned by alice', pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated',
  $q$insert into public.user_game_saves (user_id, game_id, save_data, save_version) values ('11111111-1111-1111-1111-111111111111', 'other', '{}', 3) returning 'inserted'$q$) like 'ERR:42501%', null;
insert into results select 'bob can insert his own row directly', pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated',
  $q$insert into public.user_game_saves (user_id, game_id, save_data, save_version) values ('22222222-2222-2222-2222-222222222222', 'pixel-coin-pusher', '{"state":{}}', 3) returning 'inserted'$q$) = 'inserted', null;
insert into results select 'save_game uses auth.uid(), bobs save_game does not touch alice', (select count(*) from public.user_game_saves where user_id = '11111111-1111-1111-1111-111111111111') = 1, null;
-- client cannot hand a row to another user, and cannot forge the revision counter
with r as (select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated',
  $q$update public.user_game_saves set user_id = '11111111-1111-1111-1111-111111111111' where user_id = '22222222-2222-2222-2222-222222222222' returning 'updated'$q$) o)
insert into results select 'attempt to change user_id cannot move the row to alice (trigger pins ownership)',
  (select count(*) from public.user_game_saves where user_id = '22222222-2222-2222-2222-222222222222') = 1
  and (select count(*) from public.user_game_saves where user_id = '11111111-1111-1111-1111-111111111111') = 1, o from r;
with r as (select pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated',
  $q$with u as (update public.user_game_saves set save_data = '{"state":{"cash":7}}', revision = 99 where user_id = '22222222-2222-2222-2222-222222222222' returning revision) select revision::text from u$q$) o)
insert into results select 'trigger overrides a forged revision (99 -> previous + 1)', o = '3', o from r;
insert into results select 'row still owned by bob', (select count(*) from public.user_game_saves where user_id = '22222222-2222-2222-2222-222222222222') = 1, null;

-- anonymous (not logged in)
insert into results select 'anon cannot select saves', pg_temp.as_user(null, 'anon', $q$select count(*)::text from public.user_game_saves$q$) like 'ERR:42501%', null;
insert into results select 'anon cannot insert saves', pg_temp.as_user(null, 'anon', $q$insert into public.user_game_saves (user_id, game_id, save_data, save_version) values ('11111111-1111-1111-1111-111111111111','x','{}',3) returning 'inserted'$q$) like 'ERR:42501%', null;
insert into results select 'anon cannot call save_game', pg_temp.as_user(null, 'anon', $q$select public.save_game('pixel-coin-pusher',3,'{}'::jsonb,null,0,null,null,false)::text$q$) like 'ERR:42501%', null;
insert into results select 'anon cannot read profiles', pg_temp.as_user(null, 'anon', $q$select count(*)::text from public.profiles$q$) like 'ERR:42501%', null;
insert into results select 'anon cannot delete accounts', pg_temp.as_user(null, 'anon', $q$select public.delete_my_account()::text$q$) like 'ERR:42501%', null;
-- authenticated user with no uid claim
insert into results select 'authenticated without sub cannot save', pg_temp.as_user('', 'authenticated', $q$select public.save_game('pixel-coin-pusher',3,'{}'::jsonb,null,0,null,null,false)::text$q$) like 'ERR:28000%', null;

-- profiles
insert into results select 'bob cannot read alice profile', pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated',
  $q$select count(*)::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'$q$) = '0', null;
insert into results select 'alice can rename herself', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$with u as (update public.profiles set display_name = 'Alice B', avatar_id = 'gem' where id = '11111111-1111-1111-1111-111111111111' returning 1) select count(*)::text from u$q$) = '1', null;
insert into results select 'invalid avatar rejected', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$update public.profiles set avatar_id = 'javascript:alert(1)' where id = '11111111-1111-1111-1111-111111111111' returning 'updated'$q$) like 'ERR:23514%', null;
insert into results select 'empty / too long display name rejected', pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'authenticated',
  $q$update public.profiles set display_name = repeat('x', 40) where id = '11111111-1111-1111-1111-111111111111' returning 'updated'$q$) like 'ERR:23514%', null;
insert into results select 'bob cannot rename alice (0 rows)', pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated',
  $q$with u as (update public.profiles set display_name = 'pwned' where id = '11111111-1111-1111-1111-111111111111' returning 1) select count(*)::text from u$q$) = '0', null;

-- account deletion cascades to profile and save, only for the caller
insert into results select 'bob deletes his account', pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'authenticated', $q$select public.delete_my_account()::text$q$) is not null, null;
insert into results select 'bob save + profile + user removed', not exists(select 1 from public.user_game_saves where user_id = '22222222-2222-2222-2222-222222222222')
  and not exists(select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222') and not exists(select 1 from auth.users where id = '22222222-2222-2222-2222-222222222222'), null;
insert into results select 'alice data untouched by bob deletion', exists(select 1 from public.user_game_saves where user_id = '11111111-1111-1111-1111-111111111111') and exists(select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111'), null;
commit;

select case when ok then 'PASS' else 'FAIL' end as result, name, detail from results order by ok, name;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from results;
