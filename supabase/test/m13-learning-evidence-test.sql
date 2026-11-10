-- M13 append-only learning-evidence RLS tests. Run after M1/M12 seed data.
\set T1 '11111111-1111-1111-1111-111111111111'
\set T2 '22222222-2222-2222-2222-222222222222'
\set S1 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set S2 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set S3 'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set A1 'dddddddd-dddd-dddd-dddd-dddddddddddd'

set role authenticated;
select test.login(:'S1');
insert into public.learning_evidence
  (id, user_id, class_id, mission_id, event_type, hints, duration_ms)
values
  ('e1311111-1111-1111-1111-111111111111', :'S1',
   'c1111111-1111-1111-1111-111111111111', '1-1', 'hint_requested', 1, null),
  ('e1322222-2222-2222-2222-222222222222', :'S1',
   'c1111111-1111-1111-1111-111111111111', '1-1', 'mission_completed', 1, 42000);

select test.expect('learner reads own evidence history',
  (select count(*) from public.learning_evidence where user_id=:'S1'), 2);

select test.login(:'S2');
select test.expect('another learner cannot read private evidence',
  (select count(*) from public.learning_evidence where user_id=:'S1'), 0);
select test.expect_denied('learner cannot append evidence as another learner',
  $$insert into public.learning_evidence(user_id, class_id, mission_id, event_type)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'c1111111-1111-1111-1111-111111111111', '1-2', 'mission_completed')$$);
select test.login(:'S3');
select test.expect_denied('learner cannot append evidence to a class they do not belong to',
  'insert into public.learning_evidence(user_id, class_id, mission_id, event_type) values (''cccccccc-cccc-cccc-cccc-cccccccccccc'', ''c1111111-1111-1111-1111-111111111111'', ''1-2'', ''mission_completed'')');

select test.login(:'T1');
select test.expect('class staff can read class learner evidence',
  (select count(*) from public.learning_evidence where user_id=:'S1'), 2);
select test.expect_denied('class staff cannot append evidence as a learner',
  $$insert into public.learning_evidence(user_id, class_id, mission_id, event_type)
    values ('11111111-1111-1111-1111-111111111111',
      'c1111111-1111-1111-1111-111111111111', '1-2', 'mission_completed')$$);

select test.login(:'A1');
select test.expect('class TA can read class learner evidence',
  (select count(*) from public.learning_evidence where user_id=:'S1'), 2);

select test.login(:'T2');
select test.expect('other class staff cannot read this class evidence',
  (select count(*) from public.learning_evidence where user_id=:'S1'), 0);

select test.login(:'S1');
select test.expect_denied('evidence history is append-only for learners',
  $$update public.learning_evidence set hints=9
    where id='e1311111-1111-1111-1111-111111111111'$$);
select test.expect_denied('negative hint counts are rejected',
  $$insert into public.learning_evidence(user_id, mission_id, event_type, hints)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1-2', 'hint_requested', -1)$$);

reset role;
\echo 'LEARNING EVIDENCE RLS TESTS PASSED'
