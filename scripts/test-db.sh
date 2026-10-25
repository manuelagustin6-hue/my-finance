#!/usr/bin/env bash
# Prueba las migraciones, RLS y límites de plan en un Postgres descartable (requiere Docker).
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=my-finance-test-db
PORT=${PORT:-54329}
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pg -p "$PORT:5432" postgres:17-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null' EXIT
export PGPASSWORD=pg
for _ in $(seq 1 30); do psql -h localhost -p "$PORT" -U postgres -c 'select 1' >/dev/null 2>&1 && break; sleep 1; done
PSQL=(psql -h localhost -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null)
"${PSQL[@]}" -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
psql -h localhost -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -f supabase/tests/rls_and_limits.sql | tail -1
