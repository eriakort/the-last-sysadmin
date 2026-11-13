-- M11 transactional progress sync regression tests.
\set U1 'f1111111-1111-1111-1111-111111111111'
\set U2 'f2222222-2222-2222-2222-222222222222'
reset role;
insert into auth.users(id,email) values (:'U1','sync1@test.invalid'),(:'U2','sync2@test.invalid') on conflict do nothing;
insert into public.profiles(id,display_name) values (:'U1','Sync One'),(:'U2','Sync Two') on conflict do nothing;
create or replace function test.sync_expect(label text, actual boolean)
returns void language plpgsql as $$ begin
 if not actual then raise exception 'FAIL[%]',label; end if;
 raise notice '  ok: %',label;
end; $$;
grant execute on function test.sync_expect(text,boolean) to authenticated;
set role anon;
select test.expect_denied('anonymous caller cannot execute merge_progress',
  $q$ select public.merge_progress('{"v":1,"fs":{"type":"dir","children":[]}}'::jsonb) $q$);
reset role;

set role authenticated;
select test.login(:'U1');
select public.merge_progress('{"v":1,"fs":{"type":"dir","mtime":1700000000000,"children":{"home":{"type":"dir","mtime":1700000000000,"children":{"keep.txt":{"type":"file","content":"first","mtime":1700000000000},"gone":{"type":"dir","mtime":1700000000000,"children":{"nested.txt":{"type":"file","content":"stale","mtime":1700000000000}}}}}}},"done":["ticket-a"],"xp":10,"mission":1,"finished":false,"syncUpdatedAt":"2026-11-07T10:00:00Z"}'::jsonb);
select public.merge_progress('{"v":1,"fs":{"type":"dir","mtime":1700000001000,"children":{"home":{"type":"dir","mtime":1700000001000,"children":{"other.txt":{"type":"file","content":"second","mtime":1700000001000}}}}},"done":["ticket-b"],"xp":20,"mission":2,"finished":false,"syncUpdatedAt":"2026-11-07T10:01:00Z"}'::jsonb);
select test.sync_expect('disjoint filesystem changes survive',(select data->'fs'->'children'->'home'->'children' ? 'keep.txt' and data->'fs'->'children'->'home'->'children' ? 'other.txt' from public.progress where user_id=:'U1'));
select test.sync_expect('ticket union survives',(select data->'done' @> '["ticket-a","ticket-b"]'::jsonb from public.progress where user_id=:'U1'));
select test.sync_expect('XP and mission use maximum',(select data->>'xp'='20' and data->>'mission'='2' from public.progress where user_id=:'U1'));
select public.merge_progress('{"v":1,"fs":{"type":"dir","mtime":1700000002000,"children":{"home":{"type":"dir","mtime":1700000002000,"children":{}}}},"done":["ticket-a","ticket-b"],"syncTombstones":[{"path":"/home/keep.txt","deletedAt":"2026-11-07T10:02:00Z"}],"syncUpdatedAt":"2026-11-07T10:02:00Z"}'::jsonb);
select test.sync_expect('deleted file removed',(select not (data->'fs'->'children'->'home'->'children' ? 'keep.txt') from public.progress where user_id=:'U1'));
select test.sync_expect('tombstone retained',(select data->'syncTombstones' @> '[{"path":"/home/keep.txt","deletedAt":"2026-11-07T10:02:00Z"}]'::jsonb from public.progress where user_id=:'U1'));
select public.merge_progress('{"v":1,"fs":{"type":"dir","mtime":1800000000000,"children":{"home":{"type":"dir","mtime":1800000000000,"children":{"keep.txt":{"type":"file","content":"recreated","mtime":1800000000000}}}}},"done":["ticket-a","ticket-b"],"syncTombstones":[{"path":"/home/keep.txt","deletedAt":"2026-11-07T10:02:00Z"}],"syncUpdatedAt":"2026-11-07T10:03:00Z"}'::jsonb);
select test.sync_expect('newer recreation survives',(select data->'fs'->'children'->'home'->'children'->'keep.txt'->>'content'='recreated' from public.progress where user_id=:'U1'));

-- Recursive directory deletion must suppress stale descendants even when the
-- receiving device has no copy of the deleted directory.
select public.merge_progress('{"v":1,"fs":{"type":"dir","mtime":1700000003000,"children":{"home":{"type":"dir","mtime":1700000003000,"children":{}}}},"done":[],"syncTombstones":[{"path":"/home/gone","deletedAt":"2026-11-07T10:04:00Z"},{"path":"/home/gone/nested.txt","deletedAt":"2026-11-07T10:04:00Z"}],"syncUpdatedAt":"2026-11-07T10:04:00Z"}'::jsonb);
select public.merge_progress('{"v":1,"fs":{"type":"dir","mtime":1700000004000,"children":{"home":{"type":"dir","mtime":1700000004000,"children":{}}}},"done":[],"syncUpdatedAt":"2026-11-07T10:05:00Z"}'::jsonb);
select test.sync_expect('directory tombstone removes stale directory and descendants',(select not (data->'fs'->'children'->'home'->'children' ? 'gone') from public.progress where user_id=:'U1'));
select test.login(:'U2');
select public.merge_progress('{"v":1,"fs":{"type":"dir","children":{}},"done":["own"]}'::jsonb);
select test.sync_expect('RPC writes authenticated user only',(select count(*)=1 from public.progress where user_id=:'U2'));
select test.expect_denied('authenticated clients cannot insert progress directly',$q$ insert into public.progress(user_id,data) values ('f2222222-2222-2222-2222-222222222222','{}'::jsonb) $q$);
select test.expect_denied('authenticated clients cannot update progress directly',$q$ update public.progress set data='{}'::jsonb where user_id='f2222222-2222-2222-2222-222222222222' $q$);
reset role;
select test.sync_expect('other user progress stays isolated',(select count(*)=1 from public.progress where user_id=:'U1'));
\echo ''
\echo 'ALL PROGRESS SYNC TESTS PASSED'
