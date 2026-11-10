-- M14 learner responses to contextual teacher feedback.
-- Responses are one-time, learner-authored, and visible only to that learner
-- and staff of the exact class. They are formative, not grades or verification.
begin;

create table if not exists public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null unique references public.feedback(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists feedback_responses_class on public.feedback_responses (class_id);
create index if not exists feedback_responses_student on public.feedback_responses (student_id);

alter table public.feedback_responses enable row level security;

drop policy if exists "read own feedback responses or staffed class" on public.feedback_responses;
create policy "read own feedback responses or staffed class"
  on public.feedback_responses for select
  using (student_id = auth.uid() or public.is_class_staff(class_id));

drop policy if exists "students respond to their own class feedback once" on public.feedback_responses;
create policy "students respond to their own class feedback once"
  on public.feedback_responses for insert
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.feedback f
      where f.id = feedback_id
        and f.class_id = class_id
        and f.student_id = student_id
    )
  );

-- Deliberately no UPDATE or DELETE policy: submitted learner responses are immutable.
commit;
