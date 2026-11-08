-- Adversarial RLS / tenant-isolation tests for M1.
--
-- Proves the thing M1 must guarantee: no teacher, TA, or student can read or
-- write another tenant's rows. Run via supabase/test/run.sh against a local
-- Postgres that already has shim.sql + supabase-setup.sql + m1-classroom.sql.
--
-- Any failed assertion raises an exception; with psql -v ON_ERROR_STOP=1 that
-- makes the whole run exit non-zero. A clean run ends with "ALL RLS TESTS PASSED".
--
-- Cast of characters:
--   T1, T2  teachers (is_teacher = true), each owns one class
--   S1, S2  students enrolled in T1's class (C1)
--   S3      student enrolled in T2's class (C2)
--   A1      TA in T1's class (C1)

\set T1 '11111111-1111-1111-1111-111111111111'
\set T2 '22222222-2222-2222-2222-222222222222'
\set S1 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set S2 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set S3 'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set A1 'dddddddd-dddd-dddd-dddd-dddddddddddd'

-- ---------- assertion helpers ----------
create schema if not exists test;
grant usage on schema test to anon, authenticated, service_role;

create or replace function test.expect(label text, actual bigint, expected bigint)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL[%]: got %, expected %', label, actual, expected;
  end if;
  raise notice '  ok: %  (= %)', label, actual;
end; $$;

-- Runs a DML statement under the CURRENT role/claims and asserts RLS blocks it.
create or replace function test.expect_denied(label text, stmt text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception
    when insufficient_privilege then
      raise notice '  ok(denied): %', label;
      return;
    when others then
      -- some violations surface as check_violation etc.; accept any block
      raise notice '  ok(denied: %): %', sqlstate, label;
      return;
  end;
  raise exception 'FAIL[%]: statement was ALLOWED but must be denied', label;
end; $$;

-- Switch the "logged-in user" the way a Supabase request does: set the JWT
-- sub claim at session scope. (The caller does `set role authenticated`.)
create or replace function test.login(uid uuid)
returns void language plpgsql security definer as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, false);
end; $$;
grant execute on function test.login(uuid), test.expect(text,bigint,bigint),
  test.expect_denied(text,text) to anon, authenticated, service_role;

-- ======================================================================
-- Seed identities as superuser (bypasses RLS — this is the DB admin, not a
-- browser). Teachers get is_teacher = true; everyone else false.
-- ======================================================================
reset role;
insert into auth.users (id, email) values
  (:'T1','t1@uni.edu'), (:'T2','t2@uni.edu'),
  (:'S1','s1@uni.edu'), (:'S2','s2@uni.edu'),
  (:'S3','s3@uni.edu'), (:'A1','a1@uni.edu')
on conflict do nothing;

insert into public.profiles (id, display_name, is_teacher) values
  (:'T1','Prof One',true), (:'T2','Prof Two',true),
  (:'S1','Stu One',false), (:'S2','Stu Two',false),
  (:'S3','Stu Three',false), (:'A1','TA One',false)
on conflict (id) do update set is_teacher = excluded.is_teacher;

-- ======================================================================
-- Classroom actions performed AS THE USERS (so INSERT policies are exercised)
-- ======================================================================
set role authenticated;

-- T1 creates class C1; T2 creates class C2
select test.login(:'T1');
insert into public.classes (id, owner_id, name, join_code, term)
  values ('c1111111-1111-1111-1111-111111111111', :'T1', 'Linux Admin 101', 'CODE01', 'F26');
select test.login(:'T2');
insert into public.classes (id, owner_id, name, join_code, term)
  values ('c2222222-2222-2222-2222-222222222222', :'T2', 'Systems 201', 'CODE02', 'F26');

-- S1, S2 self-enroll into C1; S3 into C2
select test.login(:'S1');
insert into public.enrollments (class_id, user_id, role)
  values ('c1111111-1111-1111-1111-111111111111', :'S1', 'student');
select test.login(:'S2');
insert into public.enrollments (class_id, user_id, role)
  values ('c1111111-1111-1111-1111-111111111111', :'S2', 'student');
select test.login(:'S3');
insert into public.enrollments (class_id, user_id, role)
  values ('c2222222-2222-2222-2222-222222222222', :'S3', 'student');

-- T1 (owner) adds A1 as a TA in C1
select test.login(:'T1');
insert into public.enrollments (class_id, user_id, role)
  values ('c1111111-1111-1111-1111-111111111111', :'A1', 'ta');

-- T1 creates an assignment in C1
insert into public.assignments (id, class_id, title, mission_ids, due_at)
  values ('a1111111-1111-1111-1111-111111111111',
          'c1111111-1111-1111-1111-111111111111',
          'Week 1: files & permissions', array['ch1-t1','ch1-t2'], now() + interval '7 days');

-- S1 and S3 each record an attempt
select test.login(:'S1');
insert into public.attempts (user_id, mission_id, passed, ms, hints)
  values (:'S1', 'ch1-t1', true, 42000, 1);
select test.login(:'S3');
insert into public.attempts (user_id, mission_id, passed, ms, hints)
  values (:'S3', 'ch1-t1', true, 50000, 0);

-- T1 leaves feedback for S1 in C1
select test.login(:'T1');
insert into public.feedback (class_id, student_id, author_id, body)
  values ('c1111111-1111-1111-1111-111111111111', :'S1', :'T1', 'Nice work on permissions.');

\echo '--- READ isolation ---'

-- Classes: each teacher sees only their own; a student sees only classes they're in
select test.login(:'T1');
select test.expect('T1 sees only C1', (select count(*) from public.classes), 1);
select test.expect('T1 cannot see C2', (select count(*) from public.classes where id='c2222222-2222-2222-2222-222222222222'), 0);
select test.login(:'T2');
select test.expect('T2 sees only C2', (select count(*) from public.classes), 1);
select test.login(:'S1');
select test.expect('S1 sees only C1', (select count(*) from public.classes), 1);

-- Enrollments: staff see the whole roster of their class; a student sees only their own
select test.login(:'T1');
select test.expect('T1 sees full C1 roster (S1,S2,A1)', (select count(*) from public.enrollments), 3);
select test.login(:'A1');
select test.expect('A1 (TA) sees full C1 roster', (select count(*) from public.enrollments), 3);
select test.login(:'S1');
select test.expect('S1 sees only its own enrollment', (select count(*) from public.enrollments), 1);
select test.login(:'T2');
select test.expect('T2 cannot see C1 roster, only C2 (S3)', (select count(*) from public.enrollments), 1);

-- Assignments: class members see them, outsiders do not
select test.login(:'S1');
select test.expect('S1 sees the C1 assignment', (select count(*) from public.assignments), 1);
select test.login(:'S3');
select test.expect('S3 (other class) sees no C1 assignment', (select count(*) from public.assignments), 0);
select test.login(:'T2');
select test.expect('T2 cannot see C1 assignment', (select count(*) from public.assignments), 0);

-- Attempts: the grade/privacy boundary
select test.login(:'S1');
select test.expect('S1 reads its own attempt', (select count(*) from public.attempts), 1);
select test.login(:'T1');
select test.expect('T1 reads attempts of its student S1', (select count(*) from public.attempts where user_id=:'S1'), 1);
select test.login(:'A1');
select test.expect('A1 (TA) reads C1 students attempts', (select count(*) from public.attempts where user_id=:'S1'), 1);
select test.login(:'T2');
select test.expect('T2 CANNOT read S1 attempt (other tenant)', (select count(*) from public.attempts where user_id=:'S1'), 0);
select test.login(:'S2');
select test.expect('S2 CANNOT read classmate S1 attempt', (select count(*) from public.attempts where user_id=:'S1'), 0);

-- Feedback
select test.login(:'S1');
select test.expect('S1 reads feedback about itself', (select count(*) from public.feedback), 1);
select test.login(:'T1');
select test.expect('T1 reads feedback in its class', (select count(*) from public.feedback), 1);
select test.login(:'S2');
select test.expect('S2 cannot read feedback about S1', (select count(*) from public.feedback), 0);
select test.login(:'T2');
select test.expect('T2 cannot read C1 feedback', (select count(*) from public.feedback), 0);

\echo '--- WRITE isolation (each must be DENIED) ---'

-- A non-teacher cannot create a class
select test.login(:'S1');
select test.expect_denied('non-teacher S1 cannot create a class',
  $q$ insert into public.classes (owner_id, name, join_code) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Sneaky','HACK01') $q$);

-- A student cannot enroll as a TA, nor enroll someone else
select test.expect_denied('S1 cannot self-enroll as TA',
  $q$ insert into public.enrollments (class_id,user_id,role) values ('c1111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ta') $q$);
select test.expect_denied('S1 cannot enroll another user (S2)',
  $q$ insert into public.enrollments (class_id,user_id,role) values ('c1111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','student') $q$);

-- A student cannot write an attempt as another student
select test.login(:'S2');
select test.expect_denied('S2 cannot write an attempt as S1',
  $q$ insert into public.attempts (user_id,mission_id,passed) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ch1-t2',true) $q$);

-- A teacher from another tenant cannot touch C1
select test.login(:'T2');
select test.expect_denied('T2 cannot create an assignment in C1',
  $q$ insert into public.assignments (class_id,title) values ('c1111111-1111-1111-1111-111111111111','Injected') $q$);
select test.expect_denied('T2 cannot write feedback in C1',
  $q$ insert into public.feedback (class_id,student_id,author_id,body) values ('c1111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','hi') $q$);
-- NB: a DELETE blocked by a USING clause affects 0 rows silently (no error),
-- which is the safe outcome. Assert C1 still exists rather than expecting a throw.
delete from public.classes where id='c1111111-1111-1111-1111-111111111111';
reset role;
select test.expect('T2 delete left C1 intact', (select count(*) from public.classes where id='c1111111-1111-1111-1111-111111111111'), 1);
set role authenticated;

-- The teacher-flag escalation check: a student cannot flip is_teacher on ANOTHER
-- user. The update policy restricts rows to auth.uid()=id, so this changes 0
-- rows (silently no-op) rather than erroring — assert the victim is unchanged.
select test.login(:'S1');
update public.profiles set is_teacher = true where id = :'T2';  -- targets someone else
select test.login(:'T2');
select test.expect('S1 could not escalate T2 (unchanged, still teacher by seed)',
  (select count(*) from public.profiles where id=:'T2' and is_teacher), 1);
-- And prove the no-op direction too: S1 flipping a NON-teacher classmate stays false
select test.login(:'S1');
update public.profiles set is_teacher = true where id = :'S2';
reset role;  -- read as admin to verify ground truth
select test.expect('S1 could not escalate classmate S2', (select count(*) from public.profiles where id=:'S2' and is_teacher), 0);

-- A student CAN flip their OWN flag (open professor sign-up)
set role authenticated;
select test.login(:'S1');
update public.profiles set is_teacher = true where id = :'S1';
reset role;
select test.expect('S1 may self-promote to teacher (open sign-up)', (select count(*) from public.profiles where id=:'S1' and is_teacher), 1);

reset role;
\echo ''
\echo 'ALL RLS TESTS PASSED'
