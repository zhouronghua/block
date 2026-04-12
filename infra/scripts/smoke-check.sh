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

echo "Smoke checks passed."
