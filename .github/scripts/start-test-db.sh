#!/usr/bin/env bash
set -euo pipefail
umask 077

# Apenas instâncias novas de teste. Nunca reutiliza contêiner, volume ou .env.
[[ "${TEST_DB_CONTAINER:-}" =~ ^ete-test-[a-z0-9-]+$ ]]
: "${GITHUB_ENV:?Informe o arquivo de ambiente exclusivo desta execução}"
export POSTGRES_USER=fixture
export POSTGRES_DB="ete_test_$(node -e 'console.log(require("node:crypto").randomBytes(8).toString("hex"))')"
export POSTGRES_PASSWORD="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
identity="$(node -e 'console.log(require("node:crypto").randomUUID())')"
created=false
trap 'if [[ "$created" == true ]]; then docker rm --force "$TEST_DB_CONTAINER" >/dev/null; fi' ERR

docker run --detach --rm --name "$TEST_DB_CONTAINER" \
  --publish 127.0.0.1::5432 \
  --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=512m \
  --env POSTGRES_USER --env POSTGRES_DB --env POSTGRES_PASSWORD \
  postgres:16@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d >/dev/null
created=true

ready=false
for attempt in {1..30}; do
  if docker exec "$TEST_DB_CONTAINER" pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null; then
    ready=true
    break
  fi
  sleep 2
done
[[ "$ready" == true ]]
[[ "$(docker exec "$TEST_DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")" == 0 ]]
printf "COMMENT ON DATABASE %s IS 'ETE_CONECTADA_TEST:%s';\n" "$POSTGRES_DB" "$identity" |
  docker exec -i "$TEST_DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 >/dev/null

port="$(docker port "$TEST_DB_CONTAINER" 5432/tcp)"
[[ "$port" =~ ^127\.0\.0\.1:([0-9]+)$ ]]
url="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:${BASH_REMATCH[1]}/$POSTGRES_DB"
if [[ "${GITHUB_ACTIONS:-}" == true ]]; then
  printf '::add-mask::%s\n' "$POSTGRES_PASSWORD"
  printf '::add-mask::%s\n' "$url"
fi
{
  printf 'NODE_ENV=test\nALLOW_TEST_DATABASE_WRITES=true\n'
  printf 'TEST_DATABASE_URL=%s\nTEST_DATABASE_NAME=%s\nTEST_DATABASE_ID=%s\n' "$url" "$POSTGRES_DB" "$identity"
  printf 'DATABASE_URL=%s\nDIRECT_URL=%s\n' "$url" "$url"
  printf 'RESEND_API_KEY=\nEMAIL_FROM=\n'
} >> "$GITHUB_ENV"
trap - ERR
echo 'PostgreSQL novo, vazio e identificado; porta exclusiva em loopback.'
