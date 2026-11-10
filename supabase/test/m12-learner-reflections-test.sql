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
select test.expect_denied('another learner cannot create reflection in someone else class',
  $$insert into public.learner_reflections(class_id,user_id,learned,approach)
    values ('c1111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Learned','Tried')$$);

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
  $$insert into public.learner_reflections(class_id,user_id,assignment_id,mission_id,learned,approach)
    values ('c1111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'a1111111-1111-1111-1111-111111111111','not-in-assignment','Learned','Tried')$$);

reset role;
\echo 'LEARNER REFLECTION RLS TESTS PASSED'
