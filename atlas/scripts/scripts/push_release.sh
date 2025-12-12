#!/usr/bin/env bash
set -euo pipefail

REGISTRY="registry.atlasos.app/forge"
SERVICES=("forge-api" "forge-orchestrator" "slack-enterprise-bot" "ingestor" "atlas-bridge")

VERSION="${VERSION:-${1:-}}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: VERSION=<x.y.z> scripts/push_release.sh"
  exit 1
fi

echo "Pushing release version ${VERSION} to ${REGISTRY}"
for svc in "${SERVICES[@]}"; do
  IMAGE="${REGISTRY}/${svc}:${VERSION}"
  LATEST="${REGISTRY}/${svc}:latest"
  echo "Tagging ${svc} -> ${IMAGE}"
  docker tag "${svc}:${VERSION}" "${IMAGE}"
  docker tag "${svc}:${VERSION}" "${LATEST}"
  echo "Pushing ${IMAGE}"
  docker push "${IMAGE}"
  echo "Pushing ${LATEST}"
  docker push "${LATEST}"
done

echo "Done."
