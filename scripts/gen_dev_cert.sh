#!/usr/bin/env bash
# Генерирует самоподписанный сертификат для локальной разработки.
# Для продакшна используйте Let's Encrypt или корпоративный CA.
set -euo pipefail

CERTS_DIR="$(dirname "$0")/../nginx/certs"
mkdir -p "$CERTS_DIR"

openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout "$CERTS_DIR/privkey.pem" \
  -out "$CERTS_DIR/fullchain.pem" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Сертификат создан: $CERTS_DIR/fullchain.pem"
echo "Ключ создан:       $CERTS_DIR/privkey.pem"
