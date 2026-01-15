#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Idempotent schema creation
  CREATE SCHEMA IF NOT EXISTS $APP_SCHEMA;

  -- Grant usage on schema
  GRANT USAGE ON SCHEMA $APP_SCHEMA TO $APP_DB_USER;

  -- Block DDL operations for runtime user (read-only DDL)
  REVOKE CREATE ON SCHEMA $APP_SCHEMA FROM $APP_DB_USER;

  -- Set default search_path for app_user scoped to this database
  ALTER ROLE $APP_DB_USER IN DATABASE $POSTGRES_DB SET search_path = $APP_SCHEMA, public;
EOSQL
