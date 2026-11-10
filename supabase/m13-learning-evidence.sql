-- M13: append-only learner activity evidence for formative cohort insights.
-- Records explicit hint requests and mission completions; it does not capture
-- terminal commands, file contents, passwords, or other free-form learner data.
-- Run after m1-classroom.sql. Safe to re-run.

begin;

create table if not exists public.learning_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  mission_id text not null check (char_length(btrim(mission_id)) between 1 and 160),
  event_type text not null check (event_type in ('hint_requested', 'mission_completed')),
  hints integer not null default 0 check (hints >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

alter table public.learning_evidence enable row level security;
create index if not exists learning_evidence_user_mission_time
  on public.learning_evidence (user_id, mission_id, created_at desc);
create index if not exists learning_evidence_class_time
  on public.learning_evidence (class_id, created_at desc);

drop policy if exists "learners and class staff read learning evidence" on public.learning_evidence;
create policy "learners and class staff read learning evidence"
  on public.learning_evidence for select
  using (user_id = auth.uid() or (class_id is not null and public.is_class_staff(class_id)));

drop policy if exists "learners append their own learning evidence" on public.learning_evidence;
create policy "learners append their own learning evidence"
  on public.learning_evidence for insert
  with check (
    user_id = auth.uid()
    and (
      class_id is null
      or exists (
        select 1 from public.enrollments e
        where e.class_id = learning_evidence.class_id
          and e.user_id = auth.uid()
          and e.role = 'student'
      )
    )
  );

grant select, insert on public.learning_evidence to authenticated;

commit;
