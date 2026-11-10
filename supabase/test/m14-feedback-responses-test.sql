-- M14 learner feedback-response RLS tests. Run after M1 classroom fixtures.
\set T1 '11111111-1111-1111-1111-111111111111'
\set T2 '22222222-2222-2222-2222-222222222222'
\set S1 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set S2 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set S3 'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set A1 'dddddddd-dddd-dddd-dddd-dddddddddddd'

select test.login(:'S1');
insert into public.feedback_responses (feedback_id, class_id, student_id, body)
select f.id, f.class_id, f.student_id, 'I will practise the permissions exercise again.'
from public.feedback f
where f.student_id = :'S1' and f.body = 'Nice work on permissions.';

select test.expect('learner can read own feedback response',
  (select count(*) from public.feedback_responses where student_id=:'S1'), 1);

select test.login(:'S2');
select test.expect('another learner cannot read private feedback response',
  (select count(*) from public.feedback_responses where student_id=:'S1'), 0);
select test.expect_denied('learner cannot respond to another learner feedback',
  $$insert into public.feedback_responses(feedback_id,class_id,student_id,body)
    select id,class_id,student_id,'not mine' from public.feedback
    where student_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$);

select test.login(:'T1');
select test.expect('class owner can read learner response',
  (select count(*) from public.feedback_responses where student_id=:'S1'), 1);
select test.expect_denied('class staff cannot submit a learner response',
  $$insert into public.feedback_responses(feedback_id,class_id,student_id,body)
    select id,class_id,student_id,'staff impersonation' from public.feedback
    where student_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and not exists
      (select 1 from public.feedback_responses r where r.feedback_id=feedback.id)$$);

select test.login(:'A1');
select test.expect('class TA can read learner response',
  (select count(*) from public.feedback_responses where student_id=:'S1'), 1);

select test.login(:'T2');
select test.expect('other class staff cannot read learner response',
  (select count(*) from public.feedback_responses where student_id=:'S1'), 0);

select test.login(:'S1');
select test.expect_denied('learner response is immutable',
  $$update public.feedback_responses set body='changed'
    where student_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$);
select test.expect_denied('learner cannot delete response',
  $$delete from public.feedback_responses
    where student_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$);

reset role;
\echo 'LEARNER FEEDBACK RESPONSE RLS TESTS PASSED'
