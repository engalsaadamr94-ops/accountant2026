#!/bin/bash
# يعيد إنشاء قاعدة اختبار ويطبّق كل الـ migrations
set -e
DB=${DB:-mahasi_test}
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
su postgres -c "dropdb --if-exists $DB && createdb $DB"
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $DIR/tests/db/auth_stub.sql"
for f in "$DIR"/supabase/migrations/*.sql; do
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $f" || { echo "FAILED: $f"; exit 1; }
done
echo "migrations OK"
