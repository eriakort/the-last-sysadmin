-- M2 tests: enroll_by_code(). Runs after m1-rls-test.sql in the same database,
-- using its own identities/class so it doesn't collide with the M1 fixtures.
-- Relies on the test.* helpers created by m1-rls-test.sql.

-- MT = teacher, MS = student who will join, MX = unrelated student
\set MT 'e1111111-1111-1111-1111-111111111111'
\set MS 'e2222222-2222-2222-2222-222222222222'
\set MX 'e3333333-3333-3333-3333-333333333333'

\echo '--- M2: join-by-code ---'

-- seed identities (admin)
reset role;
insert into auth.users (id, email) values
  (:'MT','mt@uni.edu'), (:'MS','ms@uni.edu'), (:'MX','mx@uni.edu')
on conflict do nothing;
insert into public.profiles (id, display_name, is_teacher) values
  (:'MT','M2 Prof', true), (:'MS','M2 Student', false), (:'MX','M2 Other', false)
on conflict (id) do update set is_teacher = excluded.is_teacher;

-- teacher creates a class with a known code
set role authenticated;
select test.login(:'MT');
insert into public.classes (id, owner_id, name, join_code, term)
  values ('ec111111-1111-1111-1111-111111111111', :'MT', 'Join Test 101', 'JOINME', 'F26');

-- Before joining, the student cannot even see the class (RLS hides it)
select test.login(:'MS');
select test.expect('student cannot see class before joining', (select count(*) from public.classes where id='ec111111-1111-1111-1111-111111111111'), 0);

-- A bad code is rejected
select test.expect_denied('bad join code is rejected',
  $q$ select public.enroll_by_code('NOPE99') $q$);

-- The right code enrolls them (case/space-insensitive input)
select test.expect('enroll_by_code returns the class',
  (select count(*) from public.enroll_by_code('  joinme ')), 1);

-- Now they can see the class and have exactly one enrollment, as a student
select test.expect('student sees class after joining', (select count(*) from public.classes where id='ec111111-1111-1111-1111-111111111111'), 1);
select test.expect('enrollment exists as student',
  (select count(*) from public.enrollments where class_id='ec111111-1111-1111-1111-111111111111' and user_id=:'MS' and role='student'), 1);

-- Re-joining is idempotent (no duplicate, reports already=true)
select test.expect('re-join is idempotent (still one enrollment)',
  (select count(*) from public.enroll_by_code('JOINME')), 1);
select test.expect('still exactly one enrollment after re-join',
  (select count(*) from public.enrollments where class_id='ec111111-1111-1111-1111-111111111111' and user_id=:'MS'), 1);

-- The teacher now sees this student on the roster; an unrelated student does not
select test.login(:'MT');
select test.expect('teacher sees the joined student on roster',
  (select count(*) from public.enrollments where class_id='ec111111-1111-1111-1111-111111111111'), 1);
select test.login(:'MX');
select test.expect('unrelated student cannot see the roster',
  (select count(*) from public.enrollments where class_id='ec111111-1111-1111-1111-111111111111'), 0);

reset role;
\echo ''
\echo 'ALL M2 TESTS PASSED'
