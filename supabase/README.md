# Supabase schema & migrations

SQL for the accounts/classroom backend. Apply in your Supabase project via
**SQL Editor → New query → paste → Run**. All scripts are safe to re-run.

## Apply order

1. **`../supabase-setup.sql`** — base: `profiles`, `progress`, `race_results` (accounts, progress sync, race leaderboard). Ship this first (it predates the classroom work).
2. **`m1-classroom.sql`** — M1: `classes`, `enrollments`, `assignments`, `attempts`, `feedback`, the `profiles.is_teacher` flag, the RLS helper functions, and every Row Level Security policy.

That's all M1 needs. There is no server code yet — the game talks to Supabase
directly with the anon key, and RLS is what keeps tenants apart.

## What M1 guarantees

- **Open professor sign-up:** any signed-in user can set their *own* `is_teacher` and start creating classes. No one can set it on anyone else.
- **Tenant isolation:** a teacher sees only their own classes and the students in them. No teacher, TA, or student can read or write another tenant's rosters, attempts, grades, or feedback.
- **Privacy split:** a profile is a public handle (display name + avatar — the race leaderboard already shows it). The sensitive data (enrollments, attempts, feedback) is private to the student and their class staff. Email stays in `auth.users` and is never exposed through these tables.
- **Formative grading:** auto-grades are practice/participation only, so the anon-key + RLS stack is sufficient. Tamper-resistant grading (Edge Functions) is deliberately deferred.

## Testing the policies

`test/` contains an **adversarial RLS test suite** that stands up two teachers,
several students, and a TA, then asserts — 30 checks — that each role can read
and write exactly what it should and nothing it shouldn't.

It runs against a **local Postgres** (not your Supabase project): `test/shim.sql`
recreates just enough of Supabase (the `auth` schema, `auth.uid()`, the
`anon`/`authenticated` roles) to exercise the *real* policies.

```bash
# needs a local Postgres you can create databases on (psql on PATH)
export PGHOST=/your/socket/or/host PGPORT=5432 PGUSER=postgres
supabase/test/run.sh
# ends with: ALL RLS TESTS PASSED
```

If you change a policy in `m1-classroom.sql`, re-run this before deploying.
