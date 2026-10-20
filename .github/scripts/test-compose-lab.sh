#!/usr/bin/env bash
set -Eeuo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"
docker info --format '{{.ServerVersion}}' >/dev/null
work=$(mktemp -d)
chmod 700 "$work"
export ETE_LAB_RUN_ID
ETE_LAB_RUN_ID=$(python3 -c 'import uuid; print(uuid.uuid4().hex)')
project="ete-lab-$ETE_LAB_RUN_ID"
export ETE_LAB_SITE_IMAGE="ete-lab-site:$ETE_LAB_RUN_ID" ETE_LAB_PORTAL_IMAGE="ete-lab-portal:$ETE_LAB_RUN_ID"
export ETE_LAB_PROXY_IMAGE="ete-lab-proxy:$ETE_LAB_RUN_ID"
export ETE_LAB_HTTPS_PORT ETE_LAB_PORTAL_LOGIN_URL
ETE_LAB_HTTPS_PORT=$(python3 - <<'PY'
import socket
with socket.socket() as s:
 s.bind(('127.0.0.1',0)); print(s.getsockname()[1])
PY
)
ETE_LAB_PORTAL_LOGIN_URL="https://portal.example.invalid:$ETE_LAB_HTTPS_PORT/login"
export ETE_LAB_DB_PASSWORD_FILE="$work/password" ETE_LAB_DATABASE_URL_FILE="$work/database-url"
export ETE_LAB_SITE_PORT=0 ETE_LAB_PORTAL_PORT=0
compose=(docker compose --env-file /dev/null --project-name "$project" --file "$root/compose.lab.yaml")
cleanup_compose=("${compose[@]}")
cleanup() {
  local status=$? id owner kind failed=0
  set +e
  for kind in container network volume; do
    if [[ "$kind" == container ]]; then ids=$(docker ps -aq --filter "label=com.docker.compose.project=$project");
    else ids=$(docker "$kind" ls -q --filter "label=com.docker.compose.project=$project"); fi
    for id in $ids; do
      owner=$(docker "$kind" inspect --format '{{index .Labels "ete.test.id"}}' "$id" 2>/dev/null)
      if [[ "$kind" == container ]]; then owner=$(docker inspect --format '{{index .Config.Labels "ete.test.id"}}' "$id" 2>/dev/null); fi
      [[ "$owner" == "$ETE_LAB_RUN_ID" ]] || failed=1
    done
  done
  if [[ "$failed" == 0 ]]; then "${cleanup_compose[@]}" down --volumes --timeout 30 >/dev/null || failed=1;
  else echo 'Recurso não reconhecido como próprio; remoção do projeto recusada.' >&2; fi
  for image in "$ETE_LAB_SITE_IMAGE" "$ETE_LAB_PORTAL_IMAGE" "$ETE_LAB_PROXY_IMAGE"; do
    id=$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null)
    if [[ -n "$id" ]]; then
      owner=$(docker image inspect --format '{{index .Config.Labels "ete.test.id"}}' "$id" 2>/dev/null)
      if [[ "$owner" == "$ETE_LAB_RUN_ID" ]]; then docker image rm "$id" >/dev/null || failed=1; else failed=1; fi
    fi
  done
  rm -rf "$work" || failed=1
  if [[ "$status" != 0 ]]; then exit "$status"; fi
  [[ "$failed" == 0 ]] && echo 'OK: projeto de laboratório e volume próprios removidos.'
  exit "$failed"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Só dados aleatórios fictícios. O diretório 0700 protege os arquivos no host;
# leitura no bind mount permite usuários distintos (Node1000/Postgres70).
python3 - "$work" <<'PY'
from pathlib import Path
import secrets, sys
root=Path(sys.argv[1]); password=secrets.token_hex(24)
(root/'password').write_text(password+'\n')
(root/'database-url').write_text(f'postgresql://postgres:{password}@db:5432/ete_lab\n')
for file in root.iterdir(): file.chmod(0o444)
PY
"${compose[@]}" config --format json > "$work/config.json"
node scripts/check-compose-lab.mjs < "$work/config.json"
node scripts/test-compose-config.mjs "$work/config.json"
node scripts/test-start-standalone.mjs
python3 - "$work" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
assert (root/'password').read_text().strip() not in (root/'config.json').read_text(), 'Configuração expôs senha.'
PY
"${compose[@]}" build site portal
"${compose[@]}" up --detach --wait --wait-timeout 120
db=$("${compose[@]}" ps -q db)
volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$db")
[[ -n "$volume" ]]
"${compose[@]}" exec -T db psql -U postgres -d ete_lab -v ON_ERROR_STOP=1 -v marker="$ETE_LAB_RUN_ID" <<'SQL'
CREATE TABLE lab_persistence (marker text NOT NULL);
INSERT INTO lab_persistence VALUES (:'marker');
SQL
# Recriar elimina os filesystems dos containers; só o volume pode preservar a linha.
"${compose[@]}" up --detach --force-recreate --wait --wait-timeout 120
new_db=$("${compose[@]}" ps -q db)
[[ "$new_db" != "$db" ]]
new_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$new_db")
[[ "$new_volume" == "$volume" ]]
actual=$("${compose[@]}" exec -T db psql -U postgres -d ete_lab -Atc 'SELECT marker FROM lab_persistence')
[[ "$actual" == "$ETE_LAB_RUN_ID" ]] || { echo 'Persistência não foi preservada.' >&2; exit 1; }
"${compose[@]}" exec -T -e "EXPECTED_LAB_MARKER=$ETE_LAB_RUN_ID" portal node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { Client } = require('pg');
const client = new Client({
  connectionString: readFileSync(process.env.DATABASE_URL_FILE, 'utf8').trim(),
  connectionTimeoutMillis: 5000, query_timeout: 5000,
});
try {
  await client.connect();
  const result = await client.query('SELECT marker FROM lab_persistence');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].marker, process.env.EXPECTED_LAB_MARKER);
  console.log('OK: processo no container do portal consulta o marcador pelo segredo externo e rede interna.');
} catch {
  console.error('Conexão fictícia ou marcador do laboratório inválidos.');
  process.exitCode = 1;
} finally { await client.end(); }
JS
"${compose[@]}" ps --all --format json > "$work/containers.json"
site=$("${compose[@]}" ps -q site)
portal=$("${compose[@]}" ps -q portal)
docker inspect "$site" "$portal" "$new_db" > "$work/inspect.json"
python3 - "$work" <<'PY'
from pathlib import Path
import json, sys
root=Path(sys.argv[1]); raw=(root/'inspect.json').read_text()
assert (root/'password').read_text().strip() not in raw, 'Metadados expuseram senha.'
items=json.loads(raw); site, portal, db=items
net=lambda c: set(c['NetworkSettings']['Networks'])
assert not (net(site)&net(db)), 'Site não deve ter rede de banco.'
assert net(portal)&net(db), 'Portal precisa da rede do banco.'
assert not db['HostConfig']['PortBindings'], 'Banco não deve publicar porta.'
for c in items:
 assert c['HostConfig']['ReadonlyRootfs'] and c['Config']['User']!='0'
 assert c['HostConfig']['CapDrop']==['ALL']
 assert c['State']['Health']['Status']=='healthy'
print('OK: containers saudáveis, não root, sem porta de banco e sem senha nos metadados.')
PY
CONTAINER_SITE_URL="http://$("${compose[@]}" port site 3000)" \
CONTAINER_PORTAL_URL="http://$("${compose[@]}" port portal 3000)" node scripts/test-container-browser.mjs
echo 'OK: Compose real preservou o marcador sintético após recriação e manteve isolamento e navegador.'
# Reutiliza somente os containers/imagens sintéticos deste projeto. A sobreposição
# será incluída no cleanup mesmo se o ensaio falhar antes de concluir.
cleanup_compose+=(--file "$root/compose.proxy-lab.yaml")
export ETE_LAB_PROXY_CONFIG_FILE="$work/Caddyfile" ETE_LAB_TLS_CERT_FILE="$work/certificate.pem" ETE_LAB_TLS_KEY_FILE="$work/key.pem"
bash .github/scripts/test-proxy-lab.sh "$work" "$project"
