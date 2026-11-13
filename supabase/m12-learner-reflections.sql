-- M12: learner reflections and task evidence.
-- Reflections are learner-authored formative records, not verified grades.
-- Run after m1-classroom.sql. Safe to re-run.

begin;

create table if not exists public.learner_reflections (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  mission_id text,
  learned text not null check (char_length(btrim(learned)) between 1 and 1200),
  approach text not null check (char_length(btrim(approach)) between 1 and 1200),
  evidence text not null default '' check (char_length(evidence) <= 1600),
  next_step text not null default '' check (char_length(next_step) <= 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_reflections_mission_needs_assignment
    check (mission_id is null or assignment_id is not null)
);

-- Assignment deletion uses ON DELETE SET NULL. Keep mission_id as historical
-- evidence while clearing the live assignment link.
alter table public.learner_reflections
  drop constraint if exists learner_reflections_mission_needs_assignment;

alter table public.learner_reflections enable row level security;
create index if not exists learner_reflections_class_created
  on public.learner_reflections (class_id, created_at desc);
create index if not exists learner_reflections_user_created
  on public.learner_reflections (user_id, created_at desc);

drop policy if exists "learners and class staff read reflections" on public.learner_reflections;
create policy "learners and class staff read reflections"
  on public.learner_reflections for select
  using (
    user_id = auth.uid()
    or (
      public.is_class_staff(class_id)
      and exists (
        select 1 from public.enrollments e
        where e.class_id = learner_reflections.class_id
          and e.user_id = learner_reflections.user_id
          and e.role = 'student'
      )
    )
  );

drop policy if exists "enrolled learners create their own reflections" on public.learner_reflections;
create policy "enrolled learners create their own reflections"
  on public.learner_reflections for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.enrollments e
      where e.class_id = learner_reflections.class_id
        and e.user_id = auth.uid()
        and e.role = 'student'
    )
    and (
      (assignment_id is null and mission_id is null)
      or (
        assignment_id is not null
        and exists (
          select 1 from public.assignments a
          where a.id = learner_reflections.assignment_id
            and a.class_id = learner_reflections.class_id
            and (mission_id is null or mission_id = any(a.mission_ids))
        )
      )
    )
  );

drop policy if exists "learners update their own reflections" on public.learner_reflections;
create policy "learners update their own reflections"
  on public.learner_reflections for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.enrollments e
      where e.class_id = learner_reflections.class_id
        and e.user_id = auth.uid()
        and e.role = 'student'
    )
    and (
      (assignment_id is null and mission_id is null)
      or (
        assignment_id is not null
        and exists (
          select 1 from public.assignments a
          where a.id = learner_reflections.assignment_id
            and a.class_id = learner_reflections.class_id
            and (mission_id is null or mission_id = any(a.mission_ids))
        )
      )
    )
  );

drop policy if exists "learners delete their own reflections" on public.learner_reflections;
create policy "learners delete their own reflections"
  on public.learner_reflections for delete
  using (user_id = auth.uid());

grant select, insert, update, delete on public.learner_reflections to authenticated;

commit;
