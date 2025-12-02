# Atlas Forge On-Prem Deployment (Zscaler-ready)

This guide covers deploying Atlas Forge fully on-prem (no source code) using private images from `registry.atlasos.app/forge`.

## Prerequisites
- Private Docker registry access (credentials for `registry.atlasos.app/forge`)
- Kubernetes 1.25+ **or** Docker Compose 3.9+
- Postgres 15, Redis 7 (bundled in the provided manifests)
- License key and `LICENSE_SECRET`
- Slack OAuth app (bot token, signing secret)
- Jira OAuth app (client ID/secret)

## Images
- `forge-api:<version>`
- `forge-orchestrator:<version>`
- `slack-enterprise-bot:<version>`
- `ingestor:<version>`
- `atlas-bridge:<version>`

## Deploy with Helm (Kubernetes)
```bash
helm upgrade --install forge ./helm \
  --set registry=registry.atlasos.app/forge \
  --set tag=1.0.0 \
  --set global.licenseKey=<LICENSE_KEY> \
  --set global.env.LICENSE_SECRET=<LICENSE_SECRET> \
  --set global.env.DATABASE_URL=postgres://postgres:postgres@forge-postgres:5432/postgres \
  --set global.env.REDIS_URL=redis://forge-redis:6379
```

Expose ingress or use the bundled `forge-nginx` service. Point Slack/Jira OAuth redirect URIs to the nginx/service hostname.

## Deploy with Docker Compose
Use `deploy/docker-compose.onprem.yml`:
```bash
export VERSION=1.0.0
export LICENSE_KEY=<LICENSE_KEY>
export LICENSE_SECRET=<LICENSE_SECRET>
docker compose -f deploy/docker-compose.onprem.yml up -d
```

## Required Environment Variables
- `LICENSE_KEY`, `LICENSE_SECRET`
- `DATABASE_URL`, `REDIS_URL`
- Slack: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`
- Jira: `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_REDIRECT_URL`

## Connecting Slack OAuth
- Set redirect URI to `<public-host>/connectors/slack/api/activate`.
- Provide bot token & signing secret to the Slack bot container.

## Connecting Jira OAuth
- Set redirect URI to `<public-host>/oauth/jira/callback`.
- Provide Jira client ID/secret to the API container.

## Licensing
- Apply the license in the `/settings` page or via `/api/license/apply`.
- All services enforce license validity via middleware.

## Testing ingestion
- Start ingestor (Helm/Compose includes it).
- Verify `/healthz` and Prometheus `/metrics`.

## Automations validation
- Use the UI to trigger automations; license must be valid or requests are blocked.

## Updating to new versions
- Check `/api/deployment/version` to see `latestVersion`.
- Pull new images: `docker pull registry.atlasos.app/forge/<svc>:<latest>`.
- Redeploy Helm/Compose with the updated `tag`/`VERSION`.

## Debugging
- Check container logs for license violations, DB connectivity, or OAuth errors.
- Prometheus/Grafana are bundled; dashboards are under `dashboards/`.
