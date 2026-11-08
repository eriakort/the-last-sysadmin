-- M10 tests: get_class_missions delivers assigned authored missions to class
-- members, directly and via scenarios, and to no one else. Runs after the other
-- suites; reuses the test.* helpers; uses its own identities.

-- GT = teacher/author, GS = enrolled student, GO = outsider
\set GT '01111111-1111-1111-1111-111111111111'
\set GS '02222222-2222-2222-2222-222222222222'
\set GO '03333333-3333-3333-3333-333333333333'

reset role;
insert into auth.users (id, email) values
  (:'GT','gt@uni.edu'), (:'GS','gs@uni.edu'), (:'GO','go@uni.edu')
on conflict do nothing;
insert into public.profiles (id, display_name, is_teacher) values
  (:'GT','Deliver Prof', true), (:'GS','Deliver Student', false), (:'GO','Deliver Outsider', false)
on conflict (id) do update set is_teacher = excluded.is_teacher;

set role authenticated;

-- Teacher sets up: a class, an authored mission, a scenario, two assignments
select test.login(:'GT');
insert into public.classes (id, owner_id, name, join_code)
  values ('0c111111-1111-1111-1111-111111111111', :'GT', 'Delivery Class', 'DELIV1');
insert into public.authored_missions (id, author_id, title, objective, check_type, check_arg1)
  values ('0a111111-1111-1111-1111-111111111111', :'GT', 'Make a report', 'Create ~/report.txt', 'file_exists', '/home/rookie/report.txt'),
         ('0a222222-2222-2222-2222-222222222222', :'GT', 'Run uptime', 'Run uptime', 'command_run', 'uptime');
insert into public.scenarios (id, author_id, title, mission_ids)
  values ('0b111111-1111-1111-1111-111111111111', :'GT', 'Week 1', array['0a222222-2222-2222-2222-222222222222']::uuid[]);
-- assignment A references the authored mission directly AND a built-in id (ignored)
insert into public.assignments (class_id, title, mission_ids)
  values ('0c111111-1111-1111-1111-111111111111', 'A1',
          array['0a111111-1111-1111-1111-111111111111','1-1']);
-- assignment B references the SCENARIO (should expand to its mission)
insert into public.assignments (class_id, title, mission_ids)
  values ('0c111111-1111-1111-1111-111111111111', 'A2',
          array['0b111111-1111-1111-1111-111111111111']);

-- student joins the class
select test.login(:'GS');
insert into public.enrollments (class_id, user_id, role)
  values ('0c111111-1111-1111-1111-111111111111', :'GS', 'student');

\echo '--- M10: authored-mission delivery ---'

-- The student gets BOTH missions: the direct one (A1) and the scenario one (A2)
select test.expect('student gets both assigned authored missions',
  (select count(*) from public.get_class_missions('0c111111-1111-1111-1111-111111111111')), 2);
select test.expect('delivery includes the directly-assigned mission',
  (select count(*) from public.get_class_missions('0c111111-1111-1111-1111-111111111111') where id='0a111111-1111-1111-1111-111111111111'), 1);
select test.expect('delivery includes the scenario-expanded mission',
  (select count(*) from public.get_class_missions('0c111111-1111-1111-1111-111111111111') where id='0a222222-2222-2222-2222-222222222222'), 1);
-- the row carries the spec the game needs to run the check
select test.expect('delivered mission carries its check spec',
  (select count(*) from public.get_class_missions('0c111111-1111-1111-1111-111111111111') where check_type='file_exists' and check_arg1='/home/rookie/report.txt'), 1);

-- An outsider (not a class member) gets nothing
select test.login(:'GO');
select test.expect('outsider gets no missions from delivery',
  (select count(*) from public.get_class_missions('0c111111-1111-1111-1111-111111111111')), 0);

-- The teacher (owner/member) also gets them (for preview)
select test.login(:'GT');
select test.expect('teacher/owner also gets the delivered missions',
  (select count(*) from public.get_class_missions('0c111111-1111-1111-1111-111111111111')), 2);

reset role;
\echo ''
\echo 'ALL M10 TESTS PASSED'
