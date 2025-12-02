# Monitoring Stack

Services:
- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090
- Loki (via Grafana Explore): http://localhost:3101
- Metabase: http://localhost:3002

Quick start:
```bash
docker compose up -d prometheus loki promtail grafana cadvisor metabase
# or the full stack
docker compose up -d
docker compose logs promtail
```

Grafana dashboards are auto-provisioned from `monitoring/grafana/provisioning/dashboards`.
Prometheus configuration lives in `monitoring/prometheus.yml`.
Loki and Promtail configs live in `monitoring/loki-config.yml` and `monitoring/promtail-config.yml`.
Metabase bootstrap helper: `monitoring/metabase/setup.sh` (uses MB_* env vars).
