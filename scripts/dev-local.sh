#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
state="$PWD/tasks/dev-equipe"
action="${1:-preparar}"
workspace='@ete-conectada/portal'

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

port_ok() {
  [[ "$1" =~ ^[1-9][0-9]{3,4}$ && "$1" -le 65535 ]]
}

case "$action" in
  preparar|portal|site|parar-banco) ;;
  *) fail 'Use preparar, portal, site ou parar-banco.' ;;
esac
[[ "$#" -le 1 ]] || fail 'Informe uma operação por vez.'

if [[ "$action" == preparar ]]; then
  mkdir -p "$state"
  chmod 700 "$state"
  mkdir "$state/.preparando" 2>/dev/null || fail 'Já existe uma preparação neste clone.'
  trap 'rmdir "$state/.preparando"' EXIT
  if [[ ! -f "$state/config" ]]; then
    port="${ETE_DEV_DB_PORT:-55432}"
    port_ok "$port" || fail 'Informe uma porta local entre 1000 e 65535.'
    identity=$(node -p 'require("node:crypto").randomUUID()')
    maintenance_password=$(node -p 'require("node:crypto").randomBytes(24).toString("hex")')
    runtime_password=$(node -p 'require("node:crypto").randomBytes(24).toString("hex")')
    printf '%s\n' "$maintenance_password" > "$state/db-password"
    printf "COMMENT ON DATABASE ete_test_equipe IS 'ETE_CONECTADA_TEST:%s';\nCREATE ROLE ete_portal_local LOGIN PASSWORD '%s';\n" \
      "$identity" "$runtime_password" > "$state/init.sql"
    # O PostgreSQL lê os arquivos montados a partir de um diretório privado no host.
    chmod 644 "$state/db-password" "$state/init.sql"
    printf 'db_port=%s\ndb_identity=%s\nruntime_password=%s\n' \
      "$port" "$identity" "$runtime_password" > "$state/config"
  fi
fi

[[ -f "$state/config" ]] || fail 'Rode bash scripts/dev-local.sh preparar primeiro.'
# Gerado acima, em diretório privado e ignorado pelo Git.
source "$state/config"
port_ok "$db_port" || fail 'A porta do banco local é inválida.'
[[ "$db_identity" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]] ||
  fail 'A identidade do banco local é inválida.'
[[ "$runtime_password" =~ ^[a-f0-9]{48}$ ]] || fail 'A credencial local é inválida.'

export ETE_DEV_STATE_DIR="$state" ETE_DEV_DB_PORT="$db_port"
compose=(docker compose -f compose.dev.yaml -p "ete-equipe-${db_identity:0:8}")
portal_port="${ETE_DEV_PORTAL_PORT:-3001}"
site_port="${ETE_DEV_SITE_PORT:-3000}"
port_ok "$portal_port" && port_ok "$site_port" || fail 'Confira as portas do site e do portal.'
portal_url="http://127.0.0.1:$portal_port"
site_url="http://127.0.0.1:$site_port"

case "$action" in
  preparar)
    maintenance_password=$(<"$state/db-password")
    [[ "$maintenance_password" =~ ^[a-f0-9]{48}$ ]] || fail 'A credencial de manutenção local é inválida.'
    "${compose[@]}" up -d --wait --wait-timeout 60
    export NODE_ENV=test ALLOW_TEST_DATABASE_WRITES=true
    export TEST_DATABASE_NAME=ete_test_equipe TEST_DATABASE_ID="$db_identity"
    export TEST_DATABASE_URL="postgresql://ete_maint:$maintenance_password@127.0.0.1:$db_port/$TEST_DATABASE_NAME"
    export DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL"
    npm run db:generate --workspace "$workspace"
    npm run db:demo
    npm run db:demo:devops
    npm run db:provision-runtime --workspace "$workspace" -- ete_portal_local
    printf 'Banco preparado. Abra o site e o portal seguindo docs/ambiente-local.md.\n'
    ;;
  portal)
    unset DIRECT_URL
    export NODE_ENV=development
    export DATABASE_URL="postgresql://ete_portal_local:$runtime_password@127.0.0.1:$db_port/ete_test_equipe"
    export PORTAL_PUBLIC_URL="$portal_url" SITE_PUBLIC_URL="$site_url"
    export DECLARATION_REGISTRY_PREVIEW=true
    export EMAIL_TRANSPORT= EMAIL_FROM= RESEND_API_KEY= SMTP_HOST= SMTP_PORT= SMTP_TLS_MODE= SMTP_USER= SMTP_PASSWORD=
    exec npm run dev --workspace "$workspace" -- --hostname 127.0.0.1 --port "$portal_port"
    ;;
  site)
    export NEXT_PUBLIC_PORTAL_LOGIN_URL="$portal_url/login"
    exec npm run dev --workspace @ete-conectada/site -- --hostname 127.0.0.1 --port "$site_port"
    ;;
  parar-banco)
    "${compose[@]}" stop db
    ;;
esac
