#!/bin/bash
set -e

echo "==> Instalando dependências..."
npm ci --production=false

echo "==> Buildando frontend..."
npm run build

echo "==> Iniciando servidor..."
NODE_ENV=production npx tsx server.ts
