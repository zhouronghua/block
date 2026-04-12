#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-zrh.asia}"
EMAIL="${2:-admin@zrh.asia}"

mkdir -p build/certbot/conf build/certbot/www

docker run --rm \
  -v "$(pwd)/build/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/build/certbot/www:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  --agree-tos --no-eff-email \
  -m "${EMAIL}" \
  -d "${DOMAIN}" -d "www.${DOMAIN}"

echo "Certificate created for ${DOMAIN}. Enable HTTPS block in infra/nginx/conf.d/site.conf."
