#!/usr/bin/env bash
# Local RLS test runner for M1. Spins up a throwaway database, applies the shim
# + base schema + M1 migration, then runs the adversarial isolation tests.
#
#   supabase/test/run.sh            # uses $PGHOST/$PGPORT or a local socket
#
# Requires a reachable Postgres you can create databases on (psql on PATH).
# This never touches your Supabase project.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)
ADMIN=("${PSQL[@]}" -d "${PGADMINDB:-postgres}")
DB="${M1_TEST_DB:-m1_rls_test}"

echo "Dropping/creating test database '$DB'..."
"${ADMIN[@]}" -c "drop database if exists $DB with (force);" >/dev/null
"${ADMIN[@]}" -c "create database $DB;" >/dev/null

run() { "${PSQL[@]}" -d "$DB" -f "$1"; }

echo "Applying shim (local Supabase stand-ins)..."
run "$HERE/shim.sql" >/dev/null

echo "Applying supabase-setup.sql (base schema)..."
run "$REPO/supabase-setup.sql" >/dev/null 2>&1

echo "Applying m1-classroom.sql (classroom schema + RLS)..."
run "$REPO/supabase/m1-classroom.sql" >/dev/null

echo "Re-applying m1-classroom.sql (idempotency check)..."
run "$REPO/supabase/m1-classroom.sql" >/dev/null 2>&1

echo "Applying m2-enrollment.sql (join-by-code function)..."
run "$REPO/supabase/m2-enrollment.sql" >/dev/null

echo "Re-applying m2-enrollment.sql (idempotency check)..."
run "$REPO/supabase/m2-enrollment.sql" >/dev/null 2>&1

for m in m4-enroll-by-email m6-missions m7-scenarios; do
  echo "Applying $m.sql..."
  run "$REPO/supabase/$m.sql" >/dev/null
  echo "Re-applying $m.sql (idempotency check)..."
  run "$REPO/supabase/$m.sql" >/dev/null 2>&1
done

echo "Running adversarial RLS tests (M1)..."
"${PSQL[@]}" -d "$DB" -f "$HERE/m1-rls-test.sql"

echo "Running join-by-code tests (M2)..."
"${PSQL[@]}" -d "$DB" -f "$HERE/m2-enroll-test.sql"

echo "Running enroll-by-email + authoring-isolation tests (M4/M6/M7)..."
"${PSQL[@]}" -d "$DB" -f "$HERE/m4-m6-m7-test.sql"

echo
echo "Cleaning up..."
"${ADMIN[@]}" -c "drop database if exists $DB with (force);" >/dev/null
echo "Done."
