# Metabase Bootstrap

This folder contains helper scripts to seed Metabase.

1) Start Metabase (`docker compose up metabase`).
2) Export environment variables:
```
export MB_URL=${METABASE_SITE_URL:-http://localhost:3002}
export MB_ADMIN_EMAIL=${METABASE_ADMIN_EMAIL:-admin@example.com}
export MB_ADMIN_PASSWORD=${METABASE_ADMIN_PASSWORD:-admin}
export MB_DB_HOST=db
export MB_DB_NAME=${POSTGRES_DB:-postgres}
export MB_DB_USER=${POSTGRES_USER:-postgres}
export MB_DB_PASS=${POSTGRES_PASSWORD:-postgres}
```
3) Run `./setup.sh` to create the admin and add the Postgres connection automatically.
