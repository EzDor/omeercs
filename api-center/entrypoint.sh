#!/bin/sh
set -eE

download_certificate() {
  echo "Certificate download placeholder"
}

if [ "$ENVIRONMENT" = "local-development" ]; then
  echo "Running in development mode..."
  cd api-center
  exec pnpm run start:debug
else
  echo "Running in production mode..."
  cd api-center
  download_certificate
  exec pnpm run start:prod
fi

