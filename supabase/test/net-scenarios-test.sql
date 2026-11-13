-- Network classroom scenario tests: author isolation, mixed assignment
-- filtering, class membership and anonymous function-execution boundary.
-- Runs after m1/m2/m4/m6/m7/m10 and net-scenarios.sql in run.sh.

\set NT 'a1111111-1111-1111-1111-111111111111'
\set NS 'a2222222-2222-2222-2222-222222222222'
\set NO 'a3333333-3333-3333-3333-333333333333'
\set NA 'a4444444-4444-4444-4444-444444444444'
\set NB 'a5555555-5555-5555-5555-555555555555'

reset role;
insert into auth.users (id,email) values
  (:'NT','net-teacher@test.invalid'), (:'NS','net-student@test.invalid'),
  (:'NO','net-outsider@test.invalid'), (:'NA','net-author@test.invalid'),
  (:'NB','net-other-author@test.invalid')
on conflict do nothing;
insert into public.profiles (id,display_name,is_teacher) values
  (:'NT','Network Teacher',true), (:'NS','Network Student',false),
  (:'NO','Network Outsider',false), (:'NA','Network Author',true),
  (:'NB','Other Network Author',true)
on conflict (id) do update set is_teacher=excluded.is_teacher;

set role authenticated;
select test.login(:'NT');
insert into public.classes (id,owner_id,name,join_code)
 values ('ac111111-1111-1111-1111-111111111111',:'NT','Network Class','NETCLS');

-- Two scenarios by NA: one assigned, one private/unassigned.
select test.login(:'NA');
insert into public.net_scenarios (id,author_id,title,data) values
 ('aa111111-1111-1111-1111-111111111111',:'NA','Assigned network lab','{"devices":[]}'),
 ('aa222222-2222-2222-2222-222222222222',:'NA','Private network lab','{"devices":[]}');

select test.expect('author can read both own network scenarios',
 (select count(*) from public.net_scenarios),2);
insert into public.net_scenarios (author_id,title,data)
 values (:'NA','Temporary scenario','{}');
select test.expect('author can insert a scenario',
 (select count(*) from public.net_scenarios where title='Temporary scenario'),1);
update public.net_scenarios set title='Updated temporary scenario'
 where title='Temporary scenario';
select test.expect('author can update own scenario',
 (select count(*) from public.net_scenarios where title='Updated temporary scenario'),1);
delete from public.net_scenarios where title='Updated temporary scenario';
select test.expect('author can delete own scenario',
 (select count(*) from public.net_scenarios where title='Updated temporary scenario'),0);

-- A second author cannot read or forge/update/delete NA's scenario.
select test.login(:'NB');
select test.expect('other author cannot read private scenarios',
 (select count(*) from public.net_scenarios),0);
select test.expect_denied('other author cannot insert as NA',
 $q$ insert into public.net_scenarios(author_id,title,data) values ('a4444444-4444-4444-4444-444444444444','forged','{}') $q$);
update public.net_scenarios set title='tampered'
 where id='aa111111-1111-1111-1111-111111111111';
delete from public.net_scenarios where id='aa111111-1111-1111-1111-111111111111';
reset role;
select test.expect('other author update/delete attempts leave row unchanged',
 (select count(*) from public.net_scenarios where id='aa111111-1111-1111-1111-111111111111' and title='Assigned network lab'),1);

-- Create a Linux-authored mission to prove that mixed assignments are filtered
-- by the Network delivery function rather than returning foreign UUID records.
set role authenticated;
select test.login(:'NT');
insert into public.authored_missions (id,author_id,title,objective,check_type)
 values ('ad111111-1111-1111-1111-111111111111',:'NT','Linux-only mission','Practice Linux','file_exists');
insert into public.assignments (class_id,title,mission_ids) values
 ('ac111111-1111-1111-1111-111111111111','Mixed assignment',
  array['builtin-network-mission','aa111111-1111-1111-1111-111111111111','ad111111-1111-1111-1111-111111111111']);

select test.login(:'NS');
select test.expect('student joins network class through join-code RPC',
 (select count(*) from public.enroll_by_code('NETCLS')),1);

\echo '--- Network classroom scenario delivery ---'
select test.expect('student cannot read raw network scenario table',
 (select count(*) from public.net_scenarios),0);
select test.expect('class member receives only assigned network scenario',
 (select count(*) from public.get_class_net_scenarios('ac111111-1111-1111-1111-111111111111')),1);
select test.expect('delivery returns assigned network scenario data',
 (select count(*) from public.get_class_net_scenarios('ac111111-1111-1111-1111-111111111111')
  where id='aa111111-1111-1111-1111-111111111111' and data='{"devices":[]}'::jsonb),1);
select test.expect('delivery excludes unassigned scenario by same author',
 (select count(*) from public.get_class_net_scenarios('ac111111-1111-1111-1111-111111111111')
  where id='aa222222-2222-2222-2222-222222222222'),0);
select test.expect('delivery ignores built-in and Linux-authored assignment ids',
 (select count(*) from public.get_class_net_scenarios('ac111111-1111-1111-1111-111111111111')
  where id='ad111111-1111-1111-1111-111111111111'),0);

select test.login(:'NO');
select test.expect('outsider receives no network scenarios',
 (select count(*) from public.get_class_net_scenarios('ac111111-1111-1111-1111-111111111111')),0);

-- Anonymous callers must not execute the SECURITY DEFINER delivery function.
reset role;
set role anon;
select test.expect_denied('anonymous caller cannot execute delivery function',
 $q$ select * from public.get_class_net_scenarios('ac111111-1111-1111-1111-111111111111') $q$);
reset role;

\echo ''
\echo 'ALL NETWORK SCENARIO TESTS PASSED'
