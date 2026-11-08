-- M4 / M6 / M7 tests: enroll-by-email, and author-isolation of authored
-- missions and scenarios. Runs after the M1/M2 suites in the same database and
-- reuses their test.* helpers. Uses its own identities to avoid collisions.

-- TE = teacher/owner, TS = target student (added by email), OU = outsider,
-- AU = mission/scenario author, BU = another author
\set TE 'f1111111-1111-1111-1111-111111111111'
\set TS 'f2222222-2222-2222-2222-222222222222'
\set OU 'f3333333-3333-3333-3333-333333333333'
\set AU 'f4444444-4444-4444-4444-444444444444'
\set BU 'f5555555-5555-5555-5555-555555555555'

reset role;
insert into auth.users (id, email) values
  (:'TE','te@uni.edu'), (:'TS','target@uni.edu'), (:'OU','ou@uni.edu'),
  (:'AU','au@uni.edu'), (:'BU','bu@uni.edu')
on conflict do nothing;
insert into public.profiles (id, display_name, is_teacher) values
  (:'TE','M4 Prof', true), (:'TS','Target Student', false), (:'OU','Outsider', false),
  (:'AU','Author One', true), (:'BU','Author Two', true)
on conflict (id) do update set is_teacher = excluded.is_teacher;

set role authenticated;

-- TE creates a class
select test.login(:'TE');
insert into public.classes (id, owner_id, name, join_code, term)
  values ('fc111111-1111-1111-1111-111111111111', :'TE', 'M4 Class', 'M4CODE', 'F26');

\echo '--- M4: enroll_by_email ---'

-- Staff enrolls a student by email -> ok, and the student appears on the roster
select test.expect('enroll_by_email returns ok for staff',
  (select case when public.enroll_by_email('fc111111-1111-1111-1111-111111111111','target@uni.edu') ? 'ok' then 1 else 0 end), 1);
select test.expect('target is now enrolled as a student',
  (select count(*) from public.enrollments where class_id='fc111111-1111-1111-1111-111111111111' and user_id=:'TS' and role='student'), 1);

-- Idempotent: calling again doesn't duplicate
select public.enroll_by_email('fc111111-1111-1111-1111-111111111111','target@uni.edu');
select test.expect('enroll_by_email is idempotent',
  (select count(*) from public.enrollments where class_id='fc111111-1111-1111-1111-111111111111' and user_id=:'TS'), 1);

-- Unknown email -> error, no enrollment
select test.expect('unknown email returns an error',
  (select case when public.enroll_by_email('fc111111-1111-1111-1111-111111111111','nobody@uni.edu') ? 'error' then 1 else 0 end), 1);

-- A non-staff user cannot enroll anyone into TE's class
select test.login(:'OU');
select test.expect('non-staff enroll_by_email is refused',
  (select case when public.enroll_by_email('fc111111-1111-1111-1111-111111111111','ou@uni.edu') ? 'error' then 1 else 0 end), 1);
reset role;
select test.expect('non-staff call created no enrollment',
  (select count(*) from public.enrollments where class_id='fc111111-1111-1111-1111-111111111111' and user_id=:'OU'), 0);
set role authenticated;

\echo '--- M6: authored_missions are author-isolated ---'

-- AU creates a mission
select test.login(:'AU');
insert into public.authored_missions (id, author_id, title, objective, check_type, check_arg1)
  values ('fa111111-1111-1111-1111-111111111111', :'AU', 'Find the log', 'Locate /var/log/app.log', 'file_exists', '/var/log/app.log');

select test.expect('author reads their own mission', (select count(*) from public.authored_missions), 1);

-- BU cannot see AU's mission, cannot insert as AU, cannot modify AU's row
select test.login(:'BU');
select test.expect('another author cannot read it', (select count(*) from public.authored_missions), 0);
select test.expect_denied('cannot insert a mission authored as someone else',
  $q$ insert into public.authored_missions (author_id,title,objective,check_type) values ('f4444444-4444-4444-4444-444444444444','x','y','file_exists') $q$);
update public.authored_missions set title='hacked' where id='fa111111-1111-1111-1111-111111111111'; -- 0 rows under RLS
reset role;
select test.expect('another author could not modify it',
  (select count(*) from public.authored_missions where id='fa111111-1111-1111-1111-111111111111' and title='Find the log'), 1);
set role authenticated;

\echo '--- M7: scenarios are author-isolated ---'

select test.login(:'AU');
insert into public.scenarios (id, author_id, title, mission_ids)
  values ('fb111111-1111-1111-1111-111111111111', :'AU', 'Week 1 set', array['fa111111-1111-1111-1111-111111111111']::uuid[]);
select test.expect('author reads their own scenario', (select count(*) from public.scenarios), 1);

select test.login(:'BU');
select test.expect('another author cannot read the scenario', (select count(*) from public.scenarios), 0);
select test.expect_denied('cannot insert a scenario authored as someone else',
  $q$ insert into public.scenarios (author_id,title) values ('f4444444-4444-4444-4444-444444444444','x') $q$);

reset role;
\echo ''
\echo 'ALL M4/M6/M7 TESTS PASSED'
