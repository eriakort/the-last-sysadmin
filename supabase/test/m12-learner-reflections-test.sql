-- M12 learner-reflection RLS tests. Run after m1-rls-test.sql seeds identities.
\set T1 '11111111-1111-1111-1111-111111111111'
\set T2 '22222222-2222-2222-2222-222222222222'
\set S1 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set S2 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set S3 'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set A1 'dddddddd-dddd-dddd-dddd-dddddddddddd'

set role authenticated;
select test.login(:'S1');
insert into public.learner_reflections
  (id, class_id, user_id, assignment_id, mission_id, learned, approach, evidence, next_step)
values
  ('e1111111-1111-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111', :'S1',
   'a1111111-1111-1111-1111-111111111111', 'ch1-t1',
   'I learned how file permissions affect access.',
   'I inspected the mode, changed the minimum permission and checked it again.',
   'The final ls -l output showed the expected owner permissions.',
   'Practise the difference between chmod and chown.');

select test.expect('learner reads own reflection',
  (select count(*) from public.learner_reflections where id='e1111111-1111-1111-1111-111111111111'), 1);

select test.login(:'S2');
select test.expect('another learner cannot read private reflection',
  (select count(*) from public.learner_reflections where id='e1111111-1111-1111-1111-111111111111'), 0);
select test.expect_denied('learner cannot create a reflection as another learner',
  $$insert into public.learner_reflections(class_id,user_id,learned,approach)
    values ('c1111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Learned','Tried')$$);

select test.login(:'T1');
select test.expect('class staff can read learner reflection',
  (select count(*) from public.learner_reflections where id='e1111111-1111-1111-1111-111111111111'), 1);
select test.expect_denied('teacher cannot submit a reflection as a learner',
  $$insert into public.learner_reflections(class_id,user_id,learned,approach)
    values ('c1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','Learned','Tried')$$);

select test.login(:'A1');
select test.expect('class TA can read learner reflection',
  (select count(*) from public.learner_reflections where id='e1111111-1111-1111-1111-111111111111'), 1);

select test.login(:'T2');
select test.expect('other class staff cannot read reflection',
  (select count(*) from public.learner_reflections where id='e1111111-1111-1111-1111-111111111111'), 0);

select test.login(:'S3');
select test.expect_denied('learner in another class cannot forge reflection for C1',
  $$insert into public.learner_reflections(class_id,user_id,learned,approach)
    values ('c1111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','Learned','Tried')$$);

select test.login(:'S1');
update public.learner_reflections set next_step='Review file ownership too.', updated_at=now()
where id='e1111111-1111-1111-1111-111111111111';
select test.expect('learner can update own reflection',
  (select count(*) from public.learner_reflections where id='e1111111-1111-1111-1111-111111111111'
    and next_step='Review file ownership too.'), 1);
select test.expect_denied('mission must belong to selected assignment',
  $insert into public.learner_reflections(class_id,user_id,assignment_id,mission_id,learned,approach)
    values ('c1111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'a1111111-1111-1111-1111-111111111111','not-in-assignment','Learned','Tried')$);

select test.expect_denied('learner cannot create a mission reflection without an assignment',
  $insert into public.learner_reflections(class_id,user_id,mission_id,learned,approach)
    values ('c1111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'ch1-t1','Unlinked mission','Tried')$);

-- Removing a learner revokes staff access while preserving the learner's
-- own access to their reflection history.
select test.login(:'T1');
delete from public.enrollments
where class_id='c1111111-1111-1111-1111-111111111111' and user_id=:'S1';
select test.expect('class staff cannot read reflection after learner removal',
  (select count(*) from public.learner_reflections where id='e1111111-1111-1111-1111-111111111111'), 0);

select test.login(:'S1');
select test.expect('learner retains access to own reflection after class removal',
  (select count(*) from public.learner_reflections where id='e1111111-1111-1111-1111-111111111111'), 1);

-- Restore the shared M1 fixture so the following M13 evidence tests start
-- with S1 enrolled, independent of the M12 revocation scenario above.
select test.login(:'T1');
insert into public.enrollments (class_id, user_id, role)
values ('c1111111-1111-1111-1111-111111111111', :'S1', 'student');

-- Deleting an assignment must not destroy or invalidate the learner's
-- historical mission reflection. The FK clears only assignment_id.
select test.login(:'T1');
delete from public.assignments
where id='a1111111-1111-1111-1111-111111111111';
select test.expect('assignment deletion preserves reflection and mission id',
  (select count(*) from public.learner_reflections
    where id='e1111111-1111-1111-1111-111111111111'
      and assignment_id is null and mission_id='ch1-t1'), 1);
select test.expect('class staff can read reflection after assignment deletion',
  (select count(*) from public.learner_reflections
    where id='e1111111-1111-1111-1111-111111111111'), 1);

select test.login(:'S1');
select test.expect('learner retains reflection after assignment deletion',
  (select count(*) from public.learner_reflections
    where id='e1111111-1111-1111-1111-111111111111'
      and assignment_id is null and mission_id='ch1-t1'), 1);

reset role;
\echo 'LEARNER REFLECTION RLS TESTS PASSED'
