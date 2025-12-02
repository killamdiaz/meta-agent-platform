#!/usr/bin/env bash
set -euo pipefail

: "${MB_URL:=http://localhost:3002}"
: "${MB_ADMIN_EMAIL:=admin@example.com}"
: "${MB_ADMIN_PASSWORD:=admin}"
: "${MB_ADMIN_FIRST:=Meta}"
: "${MB_ADMIN_LAST:=Admin}"
: "${MB_DB_HOST:=db}"
: "${MB_DB_NAME:=postgres}"
: "${MB_DB_USER:=postgres}"
: "${MB_DB_PASS:=postgres}"

echo "Bootstrapping Metabase at ${MB_URL}"

sleep 5

SESSION_TOKEN=$(curl -s -X POST "${MB_URL}/api/session" -H 'Content-Type: application/json' \
  -d "{\"username\":\"${MB_ADMIN_EMAIL}\",\"password\":\"${MB_ADMIN_PASSWORD}\"}" | jq -r '.id' || true)

if [[ -z "${SESSION_TOKEN}" || "${SESSION_TOKEN}" == "null" ]]; then
  echo "Creating admin account..."
  SESSION_TOKEN=$(curl -s -X POST "${MB_URL}/api/setup" -H 'Content-Type: application/json' \
    -d "{\"token\":null,\"user\":{\"first_name\":\"${MB_ADMIN_FIRST}\",\"last_name\":\"${MB_ADMIN_LAST}\",\"email\":\"${MB_ADMIN_EMAIL}\",\"password\":\"${MB_ADMIN_PASSWORD}\"},\"prefs\":{\"site_name\":\"Meta Agent Platform\"}}" | jq -r '.id')
fi

if [[ -z "${SESSION_TOKEN}" || "${SESSION_TOKEN}" == "null" ]]; then
  echo "Failed to authenticate to Metabase"; exit 1;
fi

echo "Creating Postgres database connection..."
curl -s -X POST "${MB_URL}/api/database" \
  -H "X-Metabase-Session: ${SESSION_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"engine\":\"postgres\",\"name\":\"Platform DB\",\"details\":{\"host\":\"${MB_DB_HOST}\",\"port\":5432,\"dbname\":\"${MB_DB_NAME}\",\"user\":\"${MB_DB_USER}\",\"password\":\"${MB_DB_PASS}\",\"ssl\":false}}" >/dev/null

echo "Metabase bootstrap complete."
