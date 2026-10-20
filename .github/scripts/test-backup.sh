#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${TEST_PG_BIN:?Informe clientes PostgreSQL 16}"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT

# A mesma entrada precisa recusar a origem quando seu marcador não coincide.
negative=0
TEST_DATABASE_ID=00000000-0000-4000-8000-000000000000 \
  npm run test:backup > "$work/wrong-source.log" 2>&1 || negative=$?
[[ "$negative" == 1 ]]
grep -q 'Banco não identificado como o descartável esperado' "$work/wrong-source.log"
echo 'OK: origem com identidade incorreta recusada.'
npm run test:backup
