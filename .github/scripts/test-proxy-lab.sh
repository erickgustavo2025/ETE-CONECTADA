#!/usr/bin/env bash
# Chamado pelo ensaio Compose, que mantém o trap de remoção dos recursos próprios.
set -Eeuo pipefail
root=$(git rev-parse --show-toplevel)
cd "$root"
work=${1:?Informe diretório temporário do laboratório}
project=${2:?Informe projeto próprio}
[[ "$ETE_LAB_RUN_ID" =~ ^[a-f0-9]{32}$ && "$project" == "ete-lab-$ETE_LAB_RUN_ID" ]]
[[ -d "$work" && "$work" != "$root" && "$work" != "$root/"* ]]
base=(docker compose --env-file /dev/null --project-name "$project" --file "$root/compose.lab.yaml")
for id in $("${base[@]}" ps -q); do
  [[ "$(docker inspect --format '{{index .Config.Labels "ete.test.id"}}' "$id")" == "$ETE_LAB_RUN_ID" ]]
done
export ETE_LAB_HTTP_PORT=0
[[ "$ETE_LAB_HTTPS_PORT" =~ ^[0-9]{4,5}$ ]]
export ETE_LAB_PROXY_CONFIG_FILE="$work/Caddyfile" ETE_LAB_TLS_CERT_FILE="$work/certificate.pem" ETE_LAB_TLS_KEY_FILE="$work/key.pem"
export PROXY_TEST_CA_FILE="$work/ca.pem" PROXY_TEST_HTTP_PORT PROXY_TEST_SPKI PROXY_TEST_PREVIOUS_FINGERPRINT
compose=("${base[@]}" --file "$root/compose.proxy-lab.yaml")
recreate_proxy() {
  "${compose[@]}" up --detach --force-recreate --no-deps proxy
  # A publicação HTTP em porta 0 é novamente alocada a cada recriação.
  PROXY_TEST_HTTP_PORT=$("${compose[@]}" port proxy 8080 | cut -d: -f2)
}
probe_pid=''
cleanup_probe() {
  # O processo Node de teste vive no container próprio, removido pelo trap externo.
  if [[ -n "$probe_pid" ]]; then kill "$probe_pid" 2>/dev/null || true; wait "$probe_pid" 2>/dev/null || true; fi
}
trap cleanup_probe EXIT
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 1 \
  -subj '/CN=ETE laboratorio sintetico CA' -keyout "$work/ca-key.pem" -out "$PROXY_TEST_CA_FILE" >/dev/null 2>&1
certificate() {
  if [[ -f "$ETE_LAB_TLS_KEY_FILE" ]]; then chmod u+w "$ETE_LAB_TLS_KEY_FILE" "$ETE_LAB_TLS_CERT_FILE"; fi
  openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
    -subj '/CN=site.example.invalid' -keyout "$ETE_LAB_TLS_KEY_FILE" -out "$work/request.csr" >/dev/null 2>&1
  printf '%s\n' 'subjectAltName=DNS:site.example.invalid,DNS:portal.example.invalid' 'extendedKeyUsage=serverAuth' > "$work/extensions"
  openssl x509 -req -in "$work/request.csr" -CA "$PROXY_TEST_CA_FILE" -CAkey "$work/ca-key.pem" \
    -set_serial "0x$(openssl rand -hex 16)" -days 1 -extfile "$work/extensions" -out "$ETE_LAB_TLS_CERT_FILE" >/dev/null 2>&1
  chmod 444 "$ETE_LAB_TLS_CERT_FILE" "$ETE_LAB_TLS_KEY_FILE"
}
certificate
# A configuração real só troca o upstream nesta fase para medir a fronteira do proxy.
sed 's/reverse_proxy site:3000/reverse_proxy site:4100/' infra/caddy/lab.Caddyfile > "$ETE_LAB_PROXY_CONFIG_FILE"
chmod 444 "$ETE_LAB_PROXY_CONFIG_FILE"
"${compose[@]}" config --format json > "$work/proxy-config.json"
node scripts/check-proxy-lab.mjs < "$work/proxy-config.json"
node scripts/test-proxy-config.mjs "$work/proxy-config.json"
mkdir "$work/proxy-context"
cp infra/caddy/{Dockerfile,.dockerignore,go.mod,go.sum,main.go} "$work/proxy-context/"
cp -R infra/caddy/third_party "$work/proxy-context/third_party"
printf '%s\n' "PRIVATE_PROXY_CANARY_$ETE_LAB_RUN_ID" > "$work/proxy-context/.env"
cp "$work/proxy-context/.env" "$work/proxy-context/student.xls"
cp "$work/proxy-context/.env" "$work/proxy-context/private.key"
printf '%s\n' 'FROM scratch' 'COPY . /context' > "$work/proxy-context.Dockerfile"
docker build --file "$work/proxy-context.Dockerfile" --output "type=local,dest=$work/proxy-context-export" "$work/proxy-context"
python3 - "$work/proxy-context-export/context" "$ETE_LAB_RUN_ID" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); marker=('PRIVATE_PROXY_CANARY_'+sys.argv[2]).encode()
assert (p/'main.go').is_file() and (p/'go.sum').is_file()
assert not any(marker in f.read_bytes() for f in p.rglob('*') if f.is_file())
print('OK: contexto do proxy excluiu env, planilha e chave fictícios.')
PY
"${compose[@]}" build proxy
# Audita o binário efetivamente reconstruído, sem ignorar alertas do candidato.
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --connect-timeout 10 --max-time 120 --retry 2 \
  https://github.com/aquasecurity/trivy/releases/download/v0.74.0/trivy_0.74.0_Linux-64bit.tar.gz --output "$work/proxy-trivy.tar.gz"
printf '%s  %s\n' 2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a "$work/proxy-trivy.tar.gz" | sha256sum --check --status
tar -xzf "$work/proxy-trivy.tar.gz" -C "$work" trivy
"$work/trivy" image --image-src docker --scanners vuln --severity HIGH,CRITICAL --exit-code 1 \
  --timeout 5m --cache-dir "$work/proxy-trivy-cache" --no-progress "$ETE_LAB_PROXY_IMAGE"
"${compose[@]}" run --rm --no-deps proxy validate --config /etc/caddy/Caddyfile --adapter caddyfile
"${compose[@]}" up --detach --wait --wait-timeout 120
"${base[@]}" exec -T site node --input-type=module < scripts/proxy-test-backend.mjs &
probe_pid=$!
PROXY_TEST_HTTP_PORT=$("${compose[@]}" port proxy 8080 | cut -d: -f2)
for attempt in $(seq 1 30); do
  if curl --silent --fail --noproxy '*' --cacert "$PROXY_TEST_CA_FILE" \
    --resolve "site.example.invalid:$ETE_LAB_HTTPS_PORT:127.0.0.1" "https://site.example.invalid:$ETE_LAB_HTTPS_PORT/" >/dev/null; then break; fi
  [[ "$attempt" != 30 ]] || exit 1
  sleep 1
done
node scripts/test-proxy-lab.mjs probe
# Controle negativo real: um limite permissivo precisa reprovar o mesmo teste.
chmod u+w "$ETE_LAB_PROXY_CONFIG_FILE"
cp "$ETE_LAB_PROXY_CONFIG_FILE" "$work/probe-positive.Caddyfile"
sed 's/max_size 3145728/max_size 6291456/' "$work/probe-positive.Caddyfile" > "$ETE_LAB_PROXY_CONFIG_FILE"
chmod 444 "$ETE_LAB_PROXY_CONFIG_FILE"
recreate_proxy
for attempt in $(seq 1 30); do
  if curl --silent --fail --noproxy '*' --cacert "$PROXY_TEST_CA_FILE" \
    --resolve "site.example.invalid:$ETE_LAB_HTTPS_PORT:127.0.0.1" "https://site.example.invalid:$ETE_LAB_HTTPS_PORT/" >/dev/null; then break; fi
  [[ "$attempt" != 30 ]] || exit 1
  sleep 1
done
negative=0
node scripts/test-proxy-lab.mjs probe > "$work/proxy-negative.log" 2>&1 || negative=$?
[[ "$negative" == 1 ]]
grep -q 'Limite de upload precisa recusar' "$work/proxy-negative.log"
echo 'OK: controle negativo real reprovou o limite de upload permissivo.'
chmod u+w "$ETE_LAB_PROXY_CONFIG_FILE"
cp infra/caddy/lab.Caddyfile "$ETE_LAB_PROXY_CONFIG_FILE"
chmod 444 "$ETE_LAB_PROXY_CONFIG_FILE"
recreate_proxy
# O bind da chave não muda de inode: a troca abaixo é seguida de recriação real.
PROXY_TEST_SPKI=$(openssl x509 -in "$ETE_LAB_TLS_CERT_FILE" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | openssl dgst -sha256 -binary | openssl base64 -A)
for attempt in $(seq 1 30); do
  if curl --silent --fail --noproxy '*' --cacert "$PROXY_TEST_CA_FILE" \
    --resolve "portal.example.invalid:$ETE_LAB_HTTPS_PORT:127.0.0.1" "https://portal.example.invalid:$ETE_LAB_HTTPS_PORT/login" >/dev/null; then break; fi
  [[ "$attempt" != 30 ]] || exit 1
  sleep 1
done
node scripts/test-proxy-lab.mjs apps
"${compose[@]}" ps -q | xargs docker inspect > "$work/proxy-inspect.json"
python3 - "$work/proxy-inspect.json" <<'PY'
import json,sys
items=json.load(open(sys.argv[1])); assert len(items)==4
for c in items:
 service=c['Config']['Labels']['com.docker.compose.service']
 ports=c['NetworkSettings']['Ports'] or {}
 published=[p for values in ports.values() if values for p in values]
 assert c['HostConfig']['ReadonlyRootfs'] and c['Config']['User']!='0'
 assert c['HostConfig']['CapDrop']==['ALL']
 if service=='proxy':
  assert len(published)==2 and all(p['HostIp']=='127.0.0.1' for p in published)
  assert len(c['NetworkSettings']['Networks'])==1
  assert not any(m['Destination']=='/var/run/docker.sock' for m in c['Mounts'])
 else: assert not published, f'{service} publicou porta direta'
print('OK: inspeção real confirma somente duas portas locais do proxy; apps/banco sem publicação.')
PY
old_proxy=$("${compose[@]}" ps -q proxy)
PROXY_TEST_PREVIOUS_FINGERPRINT=$(openssl x509 -in "$ETE_LAB_TLS_CERT_FILE" -noout -fingerprint -sha256 | cut -d= -f2)
certificate
recreate_proxy
[[ "$("${compose[@]}" ps -q proxy)" != "$old_proxy" ]]
for attempt in $(seq 1 30); do
  if curl --silent --fail --noproxy '*' --cacert "$PROXY_TEST_CA_FILE" \
    --resolve "site.example.invalid:$ETE_LAB_HTTPS_PORT:127.0.0.1" "https://site.example.invalid:$ETE_LAB_HTTPS_PORT/" >/dev/null; then break; fi
  [[ "$attempt" != 30 ]] || exit 1
  sleep 1
done
node scripts/test-proxy-lab.mjs rotated
echo 'OK: HTTPS sintético validado; DNS público e renovação ACME não fazem parte deste ensaio.'
