#!/usr/bin/env bash
set -Eeuo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"
docker info --format '{{.ServerVersion}}' >/dev/null
work=$(mktemp -d)
run_id=$(python3 -c 'import uuid; print(uuid.uuid4().hex)')
source_commit=$(git rev-parse HEAD)
marker="PRIVATE_CONTAINER_FIXTURE_$run_id"
containers=()
images=()
cleanup() {
  local status=$? id owner failed=0
  set +e
  for id in "${containers[@]}"; do
    owner=$(docker inspect --format '{{index .Config.Labels "ete.test.id"}}' "$id" 2>/dev/null || true)
    if [[ "$owner" == "$run_id" ]]; then
      docker rm --force "$id" >/dev/null || failed=1
    elif docker inspect "$id" >/dev/null 2>&1; then
      echo 'Container não reconhecido como próprio; remoção recusada.' >&2
      failed=1
    fi
  done
  for id in "${images[@]}"; do
    owner=$(docker image inspect --format '{{index .Config.Labels "ete.test.id"}}' "$id" 2>/dev/null || true)
    if [[ "$owner" == "$run_id" ]]; then
      docker image rm "$id" >/dev/null || failed=1
    elif docker image inspect "$id" >/dev/null 2>&1; then
      echo 'Imagem não reconhecida como própria; remoção recusada.' >&2
      failed=1
    fi
  done
  rm -rf "$work" || failed=1
  if [[ "$status" != 0 ]]; then exit "$status"; fi
  if [[ "$failed" == 0 ]]; then echo 'OK: containers e imagens próprios removidos; nenhum volume do usuário alterado.'; fi
  exit "$failed"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# HEAD evita copiar .env e dados locais do desenvolvedor. Os canários abaixo
# exercitam a .dockerignore real, inclusive dentro das pastas permitidas.
mkdir "$work/context"
git archive HEAD | tar -x -C "$work/context"
for file in .env apps/portal/.env.local apps/portal/src/.ENV.production apps/site/public/alunos.xls apps/site/public/ALUNOS.XLS shared/Backup.alunos.json shared/BACKUP.alunos.json apps/portal/src/local.dump apps/portal/src/LOCAL.DUMP apps/site/public/images/private-photo.png; do
  printf 'PRIVATE_FIXTURE=%s\n' "$marker" > "$work/context/$file"
done
cat > "$work/context-check.Dockerfile" <<'DOCKER'
FROM scratch
COPY . /context
DOCKER
docker build --file "$work/context-check.Dockerfile" --output "type=local,dest=$work/context-export" "$work/context"
python3 - "$work/context-export" "$marker" <<'PY'
from pathlib import Path
import sys
root, marker = Path(sys.argv[1]), sys.argv[2].encode()
files = [p for p in root.rglob('*') if p.is_file()]
assert files, 'Contexto exportado vazio; verificação inconclusiva.'
leaked = [str(p.relative_to(root)) for p in files if marker in p.read_bytes()]
assert not leaked, f'Canário fictício entrou no contexto de build: {leaked}'
print('OK: env, planilha, backup e dump fictícios fora do contexto Docker.')
PY

# Prova negativa real: apagar o arquivo em uma camada posterior não o protege.
mkdir "$work/negative"
printf '%s\n' "$marker" > "$work/negative/.env"
cat > "$work/negative/Dockerfile" <<'DOCKER'
FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
COPY .env /tmp/removed-fixture
RUN rm /tmp/removed-fixture
USER node
DOCKER
negative="ete-negative:$run_id"
docker build --label "ete.test.id=$run_id" --tag "$negative" "$work/negative"
images+=("$(docker image inspect --format '{{.Id}}' "$negative")")
docker image save "$negative" --output "$work/negative.tar"
result=0
python3 scripts/check-container-layers.py "$work/negative.tar" "$marker" || result=$?
[[ "$result" == 1 ]] || { echo 'Controle negativo não reprovou no vazamento esperado.' >&2; exit 1; }
echo 'OK: controle negativo detectou dado apagado que persistiu na camada anterior.'

declare -A urls image_ids
for app in site portal; do
  image="ete-$app:$run_id"
  docker build --file "$work/context/Dockerfile" --target "$app" \
    --build-arg NEXT_PUBLIC_PORTAL_LOGIN_URL=https://portal.example.invalid/login \
    --label "org.opencontainers.image.revision=$source_commit" \
    --label "org.opencontainers.image.title=ete-$app" \
    --label "ete.test.id=$run_id" --tag "$image" "$work/context"
  image_ids[$app]=$(docker image inspect --format '{{.Id}}' "$image")
  images+=("${image_ids[$app]}")
  docker image save "$image" --output "$work/$app.tar"
  python3 scripts/check-container-layers.py "$work/$app.tar" "$marker"
  id=$(docker run --detach --init --read-only --cap-drop ALL --security-opt no-new-privileges \
    --pids-limit 128 --memory 768m --cpus 1 --label "ete.test.id=$run_id" \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,uid=1000,gid=1000,mode=0700 \
    --tmpfs "/app/apps/$app/.next/cache:rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=0700" \
    --publish 127.0.0.1::3000 \
    --env PORTAL_PUBLIC_URL=https://portal.example.invalid --env SITE_PUBLIC_URL=https://site.example.invalid \
    --env DATABASE_URL=postgresql://probe@127.0.0.1:5432/ete_test_container_invalid "$image")
  containers+=("$id")
  docker exec --interactive --env "TEST_APP=$app" "$id" node --input-type=module < scripts/check-container-runtime.mjs
  urls[$app]="http://$(docker port "$id" 3000/tcp)"
  docker image inspect --format 'Imagem conferida: {{.Id}}; usuário={{.Config.User}}' "$image"
done
CONTAINER_SITE_URL="${urls[site]}" CONTAINER_PORTAL_URL="${urls[portal]}" node scripts/test-container-browser.mjs

# Scanner fixo e verificado, sem ler configurações/segredos do desenvolvedor.
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  --connect-timeout 10 --max-time 180 --retry 2 \
  https://github.com/aquasecurity/trivy/releases/download/v0.74.0/trivy_0.74.0_Linux-64bit.tar.gz \
  --output "$work/trivy.tar.gz"
printf '%s  %s\n' 2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a "$work/trivy.tar.gz" | sha256sum --check --status
tar -xzf "$work/trivy.tar.gz" -C "$work" trivy
"$work/trivy" --version
for app in site portal; do
  scan_status=0
  "$work/trivy" image --image-src docker --scanners vuln --severity HIGH,CRITICAL --exit-code 1 \
    --timeout 5m --cache-dir "$work/trivy-cache" --no-progress \
    --format json --output "$work/$app-audit.json" "ete-$app:$run_id" \
    2>"$work/$app-audit.log" || scan_status=$?
  cat "$work/$app-audit.log"
  [[ "$scan_status" == 0 ]] || exit "$scan_status"
  node scripts/check-image-audit.mjs "$work/$app-audit.json" "$work/$app-audit.log" "${image_ids[$app]}"
done
echo 'OK: duas imagens reais, contexto/camadas privados, runtime/navegador e auditoria de vulnerabilidades aprovados.'
if [[ -n "${TEST_IMAGE_OUTPUT_DIR:-}" ]]; then
  python3 scripts/release-artifact.py create "$work" "$source_commit" "$TEST_IMAGE_OUTPUT_DIR" "${image_ids[site]}" "${image_ids[portal]}"
fi
