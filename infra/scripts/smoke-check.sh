#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://zrh.asia}"

echo "[check] ${BASE_URL}/api/health"
curl -fsSL "${BASE_URL}/api/health" >/dev/null

echo "[check] ${BASE_URL}/api/repos?limit=6"
curl -fsSL "${BASE_URL}/api/repos?limit=6" >/dev/null

echo "[check] ${BASE_URL}/"
curl -fsSL "${BASE_URL}/" >/dev/null

echo "[check] ${BASE_URL}/play.html"
curl -fsSL "${BASE_URL}/play.html" >/dev/null

echo "[check] ${BASE_URL}/api/game/leaderboard?limit=5"
curl -fsSL "${BASE_URL}/api/game/leaderboard?limit=5" >/dev/null

echo "[check] ${BASE_URL}/api/game/score (submit)"
curl -fsSL -X POST "${BASE_URL}/api/game/score" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"smoke_check_user","nickname":"smoke","score":1,"coins":0,"level_index":0,"duration_ms":1000,"run_id":"smoke"}' \
  >/dev/null

echo "Smoke checks passed."
