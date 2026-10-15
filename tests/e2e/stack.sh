#!/bin/bash
# بيئة Supabase محلية مصغّرة للاختبار التشغيلي: Postgres + Supabase Auth + PostgREST + بوابة على 54321
set -e
DB=mahasi_e2e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK=/opt/stack
SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
service postgresql start >/dev/null
pkill -f "$STACK/auth" 2>/dev/null || true
pkill -f "$STACK/postgrest" 2>/dev/null || true
pkill -f "tests/e2e/gateway.mjs" 2>/dev/null || true
sleep 1
su postgres -c "dropdb --if-exists $DB" && su postgres -c "createdb $DB"
su postgres -c "psql -q -d $DB" <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit password 'authpw'; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin login createrole password 'authpw'; end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
create schema if not exists auth authorization supabase_auth_admin;
grant create on database $DB to supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
SQL
cd $STACK
export GOTRUE_DB_DRIVER=postgres
export DATABASE_URL="postgres://supabase_auth_admin:authpw@127.0.0.1:5432/$DB?search_path=auth"
export GOTRUE_DB_MIGRATIONS_PATH=$STACK/migrations
export GOTRUE_SITE_URL=http://localhost:3000
export GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**"
export API_EXTERNAL_URL=http://localhost:54321/auth/v1
export GOTRUE_API_HOST=127.0.0.1
export PORT=9999
export GOTRUE_JWT_SECRET=$SECRET
export GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
export GOTRUE_JWT_ADMIN_ROLES=service_role
export GOTRUE_MAILER_AUTOCONFIRM=true
export GOTRUE_EXTERNAL_EMAIL_ENABLED=true
export GOTRUE_DISABLE_SIGNUP=false
export GOTRUE_LOG_LEVEL=warn
nohup $STACK/auth > /tmp/gotrue.log 2>&1 &
for i in $(seq 1 30); do curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 1; done
curl -sf http://127.0.0.1:9999/health >/dev/null || { echo "auth failed"; tail -20 /tmp/gotrue.log; exit 1; }
# صلاحيات auth.uid للأدوار
su postgres -c "psql -q -d $DB -c 'grant execute on all functions in schema auth to anon, authenticated, service_role; grant select on auth.users to postgres;'" || true
for f in "$ROOT"/supabase/migrations/*.sql; do
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $f" || { echo "FAILED: $f"; exit 1; }
done
su postgres -c "psql -q -d $DB -c \"notify pgrst, 'reload schema'\""
cat > /tmp/pgrst.conf <<CONF
db-uri = "postgres://authenticator:authpw@127.0.0.1:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-host = "127.0.0.1"
server-port = 3001
CONF
nohup $STACK/postgrest /tmp/pgrst.conf > /tmp/pgrst.log 2>&1 &
nohup node "$ROOT/tests/e2e/gateway.mjs" > /tmp/gateway.log 2>&1 &
sleep 2
curl -sf http://127.0.0.1:54321/auth/v1/health >/dev/null && echo "stack up: http://127.0.0.1:54321"
