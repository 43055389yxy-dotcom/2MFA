#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="itms-mfa"
APP_DIR="${WORKSPACE:-$(pwd)}"

cd "$APP_DIR"

docker network inspect caddy-net >/dev/null
docker compose -p "$APP_NAME" build --pull
docker compose -p "$APP_NAME" up -d

for attempt in $(seq 1 30); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' "$APP_NAME")"
  if [ "$health" = "healthy" ]; then
    docker exec "$APP_NAME" wget -qO- http://127.0.0.1:3000/health
    exit 0
  fi
  if [ "$health" = "unhealthy" ]; then
    docker logs --tail 80 "$APP_NAME"
    exit 1
  fi
  sleep 2
done

docker logs --tail 80 "$APP_NAME"
exit 1
