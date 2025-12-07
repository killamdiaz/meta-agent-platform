#!/usr/bin/env bash
set -euo pipefail

EXHAUST_ID="0dd5dfaf-0bd8-4992-acee-7a99ac4fba80"
SECRET="exh_live_ob93p2ff0w76"        # the x-atlas-secret
CONTAINER="meta-agent-platform-exhaust-1"  # the container to tail
URL="http://localhost:4100/exhausts/$EXHAUST_ID/ingest"
BATCH=1                              # lines per POST

echo "[streamLogs] starting tail for container=$CONTAINER -> $URL"
echo "[streamLogs] batch size: $BATCH"

buffer=""
count=0

flush() {
  if [ "$count" -gt 0 ]; then
    echo "[streamLogs] flushing $count lines..."
    printf "%b" "$buffer" | curl -sS -X POST "$URL" \
      -H "x-atlas-secret: $SECRET" \
      --data-binary @-
    buffer=""
    count=0
  fi
}

docker logs -f "$CONTAINER" --tail 0 | while IFS= read -r line; do
  echo "[streamLogs] captured: $line"
  # turn each log line into a JSON object
  json=$(jq -Rn --arg c "$CONTAINER" --arg msg "$line" '{container:$c,message:$msg}')
  buffer+="${json}\n"
  count=$((count + 1))
  if [ "$count" -ge "$BATCH" ]; then
    flush
  fi
done

# send any remaining logs on exit
flush
