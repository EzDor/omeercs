#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Idempotent app user creation
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$APP_DB_USER') THEN
      CREATE ROLE $APP_DB_USER WITH LOGIN PASSWORD '$APP_DB_PASS' NOBYPASSRLS;
    END IF;
  END
  \$\$;

  GRANT CONNECT ON DATABASE $POSTGRES_DB TO $APP_DB_USER;
EOSQL
