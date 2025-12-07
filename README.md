# Atlas Cortex Platform

Full-stack, multi-tenant AI agent platform with secure SAML SSO, Postgres/pgvector, and a React/Tailwind control plane. Build, run, and observe modular agents; stream their exhaust; and integrate enterprise identity (Okta/Azure/Ping).

---

## What this platform does
- **Multi-agent runtime**: Create agents, submit tasks, stream logs/output, and manage embeddings for retrieval-augmented work.
- **Enterprise SSO (SAML 2.0)**: Per-org IdP metadata (issuer/SSO URL/certs), ACS endpoints, IdP/SP initiated flows, JIT user provisioning, and enforce-SSO mode.
- **Observability**: Exhaust log streams and terminal viewers for agent runs.
- **Integrations**: Slack, Jira, custom connectors, plus SAML admin UI for identity teams.
- **Licensing & quotas**: License enforcement and usage tracking.

---

## Architecture
- **Backend (`server/`)**: TypeScript + Express API, coordinator loop, ingestion workers, SAML service, audit logging, and Postgres/pgvector store.
- **Frontend (`meta-agent-platform-ui/`)**: React + Vite + Tailwind dashboard (agent/task controls, exhausts, integrations, SAML modal, login).
- **Forge (`forge/`)**: Next.js scaffold for Supabase-based auth flows (optional).
- **Database**: Postgres 15 with pgvector; migrations in `migrations/`.
- **Containerization**: Docker Compose for Postgres, API (port `4000`), UI (port `3000`), optional nginx edge.

---

## Quick start (Docker)
```bash
docker compose up --build
```
- UI: http://localhost:3000  
- API: http://localhost:4000  
- SP metadata: http://localhost:4000/.well-known/saml/metadata/:orgId

Stop: `docker compose down`.

---

## Local development (native)
Backend:
```bash
cd server
npm install
npm run dev   # :4000
```
Frontend:
```bash
cd meta-agent-platform-ui
npm install
npm run dev   # :5173 (or configure :3000)
```

---

## Environment configuration (core)
Set in `.env` at repo root (used by server). Key values:
```
APP_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
OPENAI_API_KEY=sk-...
COORDINATOR_INTERVAL_MS=10000
LICENSE_SECRET=dev-license-secret
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### SAML (Service Provider)
```
SAML_SP_ENTITY_ID=${APP_BASE_URL}/saml/metadata
SAML_SP_ACS_BASE_URL=${API_BASE_URL}/auth/saml/acs
SAML_SP_METADATA_BASE_URL=${API_BASE_URL}/.well-known/saml/metadata
SAML_SP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
SAML_SP_CERTIFICATE="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
SAML_DEFAULT_REDIRECT=${APP_BASE_URL}/
SAML_JWT_SECRET=super-long-random-256bit-string
```
Restart the server after env changes.

### Frontend API base
In `meta-agent-platform-ui/.env` (or Vite env):
```
VITE_API_BASE=http://localhost:4000
```

---

## Database & migrations
- Apply migrations: `psql $DATABASE_URL -f migrations/20250108_add_saml_multitenant.sql`
- Key tables:  
  - `orgs`, `org_domains` (domain → org routing)  
  - `saml_configs` (IdP metadata, SP URLs, enforce_sso)  
  - `saml_sessions`, `saml_audit_logs`  
  - `users`, `agents`, `tasks`, `forge_embeddings`, etc.

---

## SAML SSO guide
**Endpoints**
- `GET /.well-known/saml/metadata/:orgId` – SP metadata XML (entityID, ACS, certs).
- `POST /auth/saml/login` – SP-initiated start (resolve org via email domain or `org_id`).
- `POST /auth/saml/acs` – Assertion Consumer; validates signature, JIT-provisions user, sets `atlas_sso` JWT cookie, redirects.
- `POST /auth/saml/idp-init` – IdP-initiated.
- `POST /auth/saml/logout` – clears local session.
- `GET /auth/saml/session` – returns current SAML JWT payload if present.

**Org routing**
- Add domains in the SAML modal (Integrations → Okta SAML → Configure) or insert into `org_domains`.
- If multiple orgs share a domain, login fails with a conflict error.

**JIT provisioning**
- New assertion email → create user with org, first/last name, role (default `member`), link session.

**Enforce SSO**
- Toggle in the SAML modal; disables password/magic-link for that org and shows only SSO on login.

### Okta example (local)
1) In Okta SAML app:
   - **ACS URL**: `http://localhost:4000/auth/saml/acs`
   - **Audience/Entity ID**: `http://localhost:3000/saml/metadata`
   - NameID: EmailAddress.
2) In the Integrations SAML modal:
   - IdP Entity ID: e.g., `http://www.okta.com/<id>`
   - IdP SSO URL: from Okta SSO URL.
   - IdP Certificate: paste Okta X.509 cert (PEM).
   - Allowed email domains: your test domain(s).
3) Optional: RelayState in Okta = `http://localhost:3000/`.
4) Save, then “Test SSO”.

### Azure AD/Ping
Use equivalent SSO URL + certificate from metadata; set Audience to `SAML_SP_ENTITY_ID` and ACS to `SAML_SP_ACS_BASE_URL`.

### Redirects
- RelayState is used if on the same origin as `APP_BASE_URL`; otherwise falls back to `SAML_DEFAULT_REDIRECT`.
- If you land on `:4000`, re-check Audience/ACS in IdP and confirm `APP_BASE_URL`/`SAML_DEFAULT_REDIRECT` are set and server restarted.

---

## Features & UI
- **Login**: Email-based SSO discovery; enforce-SSO hides password options.
- **Integrations**: SAML modal (IdP metadata URL, SSO URL, cert, domains, enforce toggle, copyable SP Entity ID/ACS/metadata, download XML, Test SSO), Slack/Jira connectors.
- **Agents/Tasks**: CRUD, task queue, coordinator loop.
- **Exhausts**: LogStreamView/TerminalViewer for live agent output.
- **Licensing**: License status and usage/quotas.

---

## Operations & security
- **Secrets**: Keep SAML private key/cert and API keys outside VCS; inject via env/secret manager.
- **HTTPS**: Use HTTPS in production for APP/API and SAML endpoints.
- **CORS**: Restrict `ALLOWED_ORIGINS` to trusted UI hosts.
- **Backups**: Regular Postgres backups; run migrations during deploy.
- **Auditing**: SAML events logged to `saml_audit_logs`; sessions in `saml_sessions`.

---

## Useful commands
- Build server: `cd server && npm run build`
- Build UI: `cd meta-agent-platform-ui && npm run build`
- Count embeddings:
```bash
cd server
node -e "import pkg from 'pg'; const c=new pkg.Client({connectionString:process.env.DATABASE_URL||'postgres://postgres:postgres@localhost:5432/postgres'}); (async()=>{await c.connect(); const r=await c.query('select count(*) from forge_embeddings'); console.log(r.rows[0]); await c.end();})();"
```
- Reset local SP fields:
```bash
docker compose exec -T db psql -U postgres -d postgres -c "\
UPDATE saml_configs SET \
 sp_entity_id='http://localhost:3000/saml/metadata', \
 sp_acs_url='http://localhost:4000/auth/saml/acs', \
 sp_metadata_url='http://localhost:4000/.well-known/saml/metadata';"
```

---

## Troubleshooting
- **Audience mismatch**: Align IdP Audience/Entity ID with `sp_entity_id`.
- **Redirect to :4000**: Ensure `APP_BASE_URL`/`SAML_DEFAULT_REDIRECT` point to UI; restart server; RelayState must share UI origin.
- **No SAML config**: Fill `saml_configs` with correct `idp_entity_id`/SSO URL/cert; ensure `org_domains` maps the email domain.
- **InResponseTo errors**: Local testing uses relaxed validation; re-enable strict mode if required.
- **Cannot GET /**: API host serves JSON; ensure redirects target the UI host (RelayState or default redirect).

---

## License
See LICENSE or contact the Atlas team for enterprise terms.
