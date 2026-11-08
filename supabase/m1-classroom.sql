-- The Last Sysadmin — M1: classroom roles, schema & Row Level Security.
--
-- Run AFTER supabase-setup.sql (it extends the existing `profiles` table).
-- In Supabase: SQL Editor → New query → paste → Run. Safe to re-run.
--
-- Decisions this encodes (see the roadmap doc):
--   • Open sign-up for professors  → a user can flip their OWN is_teacher on
--     (self-serve). They can never set it on anyone else (RLS below).
--   • Practice/participation grading only → auto-grades are formative, so the
--     browser's anon key + these policies are sufficient; nothing here is a
--     tamper-proof grade store. High-stakes grading would move writes into
--     Edge Functions later.
--
-- Privacy model (M1):
--   • A profile is a PUBLIC handle (display_name + avatar) — low sensitivity,
--     chosen by the user, and the public race leaderboard already reads it.
--   • The SENSITIVE data — who is enrolled where, each student's attempts and
--     grades, and teacher feedback — is private: readable only by the student
--     themselves and the staff of the classes they're enrolled in.
--   • Email lives in auth.users and is never surfaced through these tables.
--
-- Tenant isolation: every teacher sees only their own classes and the students
-- in them; no teacher can read another teacher's rosters, attempts, or feedback.
-- The adversarial test script (supabase/m1-rls-test.sql) proves this.

begin;

-- ======================================================================
-- profiles: add the teacher flag (self-serve)
-- ======================================================================
alter table public.profiles
  add column if not exists is_teacher boolean not null default false;

-- The existing "users update their own profile" policy already restricts
-- updates to auth.uid() = id, so is_teacher is self-settable and ONLY by the
-- owner of the row. That is exactly the open-sign-up model. (Confirmed by the
-- cross-user test: user B cannot set is_teacher on user A.)

-- ======================================================================
-- RLS helper functions (SECURITY DEFINER = bypass RLS inside the check,
-- which is what prevents infinite recursion when a policy on `enrollments`
-- needs to look at `enrollments`). Each is marked STABLE and locked to a
-- fixed search_path.
-- ======================================================================

-- NB: these are language plpgsql (not sql) on purpose. plpgsql defers table
-- name resolution to call time, so the functions can be defined before the
-- classes/enrollments tables that the policies below also need them for.

-- Is the current user the OWNER (creating professor) of this class?
create or replace function public.is_class_owner(cid uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  return exists (
    select 1 from public.classes c
    where c.id = cid and c.owner_id = auth.uid()
  );
end;
$$;

-- Is the current user STAFF (owner or TA) of this class?
create or replace function public.is_class_staff(cid uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  return exists (
    select 1 from public.classes c
    where c.id = cid and c.owner_id = auth.uid()
  ) or exists (
    select 1 from public.enrollments e
    where e.class_id = cid and e.user_id = auth.uid() and e.role = 'ta'
  );
end;
$$;

-- Is the current user a MEMBER (staff or enrolled student) of this class?
create or replace function public.is_class_member(cid uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  return public.is_class_staff(cid) or exists (
    select 1 from public.enrollments e
    where e.class_id = cid and e.user_id = auth.uid()
  );
end;
$$;

-- Does the current user STAFF some class that `student` is enrolled in?
-- Used so a teacher/TA can read that student's attempts.
create or replace function public.staffs_class_of(student uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  return exists (
    select 1
    from public.enrollments se
    join public.classes c on c.id = se.class_id
    where se.user_id = student
      and (
        c.owner_id = auth.uid()
        or exists (
          select 1 from public.enrollments te
          where te.class_id = c.id and te.user_id = auth.uid() and te.role = 'ta'
        )
      )
  );
end;
$$;

-- short, human-friendly, collision-checked join code (e.g. "7FQ2K9")
create or replace function public.gen_join_code()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I,O,0,1
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes where join_code = code);
  end loop;
  return code;
end;
$$;

-- ======================================================================
-- classes
-- ======================================================================
create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  join_code  text not null unique default public.gen_join_code(),
  term       text,
  created_at timestamptz not null default now()
);
alter table public.classes enable row level security;
create index if not exists classes_owner on public.classes (owner_id);

drop policy if exists "read classes you own or belong to" on public.classes;
create policy "read classes you own or belong to"
  on public.classes for select
  using (owner_id = auth.uid() or public.is_class_member(id));

drop policy if exists "teachers create their own classes" on public.classes;
create policy "teachers create their own classes"
  on public.classes for insert
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_teacher)
  );

drop policy if exists "owners update their classes" on public.classes;
create policy "owners update their classes"
  on public.classes for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "owners delete their classes" on public.classes;
create policy "owners delete their classes"
  on public.classes for delete
  using (owner_id = auth.uid());

-- ======================================================================
-- enrollments  (who is in a class, and as what)
-- ======================================================================
create table if not exists public.enrollments (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'student' check (role in ('student','ta')),
  joined_at  timestamptz not null default now(),
  unique (class_id, user_id)
);
alter table public.enrollments enable row level security;
create index if not exists enrollments_class on public.enrollments (class_id);
create index if not exists enrollments_user  on public.enrollments (user_id);

-- A student sees their own enrollment; class staff see every enrollment in
-- their class.
drop policy if exists "read own enrollment or staffed class" on public.enrollments;
create policy "read own enrollment or staffed class"
  on public.enrollments for select
  using (user_id = auth.uid() or public.is_class_staff(class_id));

-- A student enrolls THEMSELVES as a student. (Join-code validation is enforced
-- in the app in M2; this policy guarantees you can only ever add yourself, and
-- only as a student — never as a TA, never as someone else.)
drop policy if exists "students self-enroll" on public.enrollments;
create policy "students self-enroll"
  on public.enrollments for insert
  with check (user_id = auth.uid() and role = 'student');

-- Class staff manage enrollments in their class (add a TA, change a role).
drop policy if exists "staff add enrollments to their class" on public.enrollments;
create policy "staff add enrollments to their class"
  on public.enrollments for insert
  with check (public.is_class_staff(class_id));

drop policy if exists "owners update enrollments in their class" on public.enrollments;
create policy "owners update enrollments in their class"
  on public.enrollments for update
  using (public.is_class_owner(class_id)) with check (public.is_class_owner(class_id));

-- A student may drop themselves; an owner may remove anyone from their class.
drop policy if exists "leave or be removed" on public.enrollments;
create policy "leave or be removed"
  on public.enrollments for delete
  using (user_id = auth.uid() or public.is_class_owner(class_id));

-- ======================================================================
-- assignments  (a mission set with a due date)
-- ======================================================================
create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  title       text not null,
  mission_ids text[] not null default '{}',
  due_at      timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.assignments enable row level security;
create index if not exists assignments_class on public.assignments (class_id);

drop policy if exists "members read class assignments" on public.assignments;
create policy "members read class assignments"
  on public.assignments for select
  using (public.is_class_member(class_id));

drop policy if exists "staff create assignments" on public.assignments;
create policy "staff create assignments"
  on public.assignments for insert
  with check (public.is_class_staff(class_id));

drop policy if exists "staff update assignments" on public.assignments;
create policy "staff update assignments"
  on public.assignments for update
  using (public.is_class_staff(class_id)) with check (public.is_class_staff(class_id));

drop policy if exists "staff delete assignments" on public.assignments;
create policy "staff delete assignments"
  on public.assignments for delete
  using (public.is_class_staff(class_id));

-- ======================================================================
-- attempts  (per-user per-mission result; generalizes `progress`)
-- ======================================================================
create table if not exists public.attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  mission_id text not null,
  passed     boolean not null default false,
  ms         int,
  hints      int not null default 0,
  attempts   int not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, mission_id)
);
alter table public.attempts enable row level security;
create index if not exists attempts_user on public.attempts (user_id);

-- A student reads their own attempts; staff read the attempts of students
-- enrolled in a class they staff. No one else — this is the core grade/privacy
-- boundary, so the test script hammers it.
drop policy if exists "read own attempts or staffed students" on public.attempts;
create policy "read own attempts or staffed students"
  on public.attempts for select
  using (user_id = auth.uid() or public.staffs_class_of(user_id));

drop policy if exists "students write their own attempts" on public.attempts;
create policy "students write their own attempts"
  on public.attempts for insert
  with check (user_id = auth.uid());

drop policy if exists "students update their own attempts" on public.attempts;
create policy "students update their own attempts"
  on public.attempts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ======================================================================
-- feedback  (teacher comments on a student)
-- ======================================================================
create table if not exists public.feedback (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  mission_id    text,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  body          text not null,
  created_at    timestamptz not null default now()
);
alter table public.feedback enable row level security;
create index if not exists feedback_student on public.feedback (student_id);
create index if not exists feedback_class   on public.feedback (class_id);

-- The student it's about can read it; class staff can read it.
drop policy if exists "read feedback about you or in your staffed class" on public.feedback;
create policy "read feedback about you or in your staffed class"
  on public.feedback for select
  using (student_id = auth.uid() or public.is_class_staff(class_id));

-- Only class staff write feedback, only as themselves, and only in their class.
drop policy if exists "staff write feedback in their class" on public.feedback;
create policy "staff write feedback in their class"
  on public.feedback for insert
  with check (author_id = auth.uid() and public.is_class_staff(class_id));

drop policy if exists "authors edit their feedback" on public.feedback;
create policy "authors edit their feedback"
  on public.feedback for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "authors delete their feedback" on public.feedback;
create policy "authors delete their feedback"
  on public.feedback for delete
  using (author_id = auth.uid());

-- ======================================================================
-- grants: let the API roles use the helper functions
-- (RLS still governs every row; these just allow calling the functions)
-- ======================================================================
grant execute on function
  public.is_class_owner(uuid),
  public.is_class_staff(uuid),
  public.is_class_member(uuid),
  public.staffs_class_of(uuid),
  public.gen_join_code()
to anon, authenticated;

commit;
