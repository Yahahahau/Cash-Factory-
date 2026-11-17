#!/usr/bin/env bash
# Runs the real migration + RLS tests against a throw-away local PostgreSQL (needs postgresql-16 binaries; not part of `npm test`).
set -euo pipefail
BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
DIR=$(mktemp -d); chown postgres "$DIR" 2>/dev/null || true
RUN="su postgres -c"
$RUN "$BIN/initdb -D $DIR/data -A trust >/dev/null"
$RUN "$BIN/pg_ctl -D $DIR/data -o '-p 54329 -k $DIR' -l $DIR/log -w start >/dev/null"
trap '$RUN "$BIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true; rm -rf "$DIR"' EXIT
ROOT=$(cd "$(dirname "$0")/.." && pwd)
P="psql -h $DIR -p 54329 -U postgres -v ON_ERROR_STOP=1 -q -X"
$RUN "$P -d postgres -c 'create database t'"
$RUN "$P -d t -f $ROOT/supabase/tests/00_supabase_stub.sql"
$RUN "$P -d t -f $ROOT/supabase/migrations/20261116000000_player_accounts_and_cloud_saves.sql"
echo '--- re-running the migration (must be idempotent) ---'
$RUN "$P -d t -f $ROOT/supabase/migrations/20261116000000_player_accounts_and_cloud_saves.sql"
$RUN "psql -h $DIR -p 54329 -U postgres -d t -X -f $ROOT/supabase/tests/10_rls_tests.sql"
