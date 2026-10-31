# Supabase schema & migrations

SQL for the accounts/classroom backend. Apply in your Supabase project via
**SQL Editor → New query → paste → Run**. All scripts are safe to re-run.

## Apply order

Run these **in order**. All are safe to re-run.

1. **`../supabase-setup.sql`** — base: `profiles`, `progress`, `race_results` (accounts, progress sync, race leaderboard).
2. **`m1-classroom.sql`** — M1: `classes`, `enrollments`, `assignments`, `attempts`, `feedback`, the `profiles.is_teacher` flag, the RLS helper functions, and every Row Level Security policy.
3. **`m2-enrollment.sql`** — M2: `enroll_by_code()` so a student can join a class with a code.
4. **`m4-enroll-by-email.sql`** — M4: `enroll_by_email()` so class staff can add a student by email.
5. **`m6-missions.sql`** — M6: `authored_missions` (the no-code mission editor's storage).
6. **`m7-scenarios.sql`** — M7: `scenarios` (groups of authored missions).

Skipping any of 3–6 leaves the matching feature broken (join-by-code, add-by-email, the mission editor, the scenario builder), since the function or table it needs won't exist. M3 (assignments) and M5 (feedback) need no new SQL — their tables ship in `m1-classroom.sql`.

There is no server code — the game talks to Supabase directly with the anon
key, and RLS is what keeps tenants apart.

> **OAuth sign-in** (Google / Microsoft / GitHub) is configured in the Supabase
> dashboard (**Authentication → Providers**), not in SQL. Email + magic-link work
> with no extra setup.

> **Authoring vs. delivery:** `authored_missions` and `scenarios` are author-only
> by design today — a teacher can create and group missions, but there is not yet
> a path that delivers them to students to *play*. That delivery step is a planned
> follow-up; built-in missions are fully assignable now.

## What M1 guarantees

- **Open professor sign-up:** any signed-in user can set their *own* `is_teacher` and start creating classes. No one can set it on anyone else.
- **Tenant isolation:** a teacher sees only their own classes and the students in them. No teacher, TA, or student can read or write another tenant's rosters, attempts, grades, or feedback.
- **Privacy split:** a profile is a public handle (display name + avatar — the race leaderboard already shows it). The sensitive data (enrollments, attempts, feedback) is private to the student and their class staff. Email stays in `auth.users` and is never exposed through these tables.
- **Formative grading:** auto-grades are practice/participation only, so the anon-key + RLS stack is sufficient. Tamper-resistant grading (Edge Functions) is deliberately deferred.

## Testing the policies

`test/` contains an **adversarial RLS test suite** that stands up teachers,
students, and a TA, then asserts that each role can read and write exactly what
it should and nothing it shouldn't. It covers:

- **M1** — tenant isolation across classes, enrollments, assignments, attempts, feedback (30 checks).
- **M2** — join-by-code (valid / invalid / duplicate, roster visibility).
- **M4 / M6 / M7** — enroll-by-email (staff only, student role forced), and author-isolation of authored missions and scenarios.

It runs against a **local Postgres** (not your Supabase project): `test/shim.sql`
recreates just enough of Supabase (the `auth` schema, `auth.uid()`, the
`anon`/`authenticated` roles) to exercise the *real* policies.

```bash
# needs a local Postgres you can create databases on (psql on PATH)
export PGHOST=/your/socket/or/host PGPORT=5432 PGUSER=postgres
supabase/test/run.sh
# ends with: ALL RLS TESTS PASSED
```

If you change a policy in any migration, re-run this before deploying.
