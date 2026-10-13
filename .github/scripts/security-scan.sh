#!/usr/bin/env bash
set -Eeuo pipefail

readonly TRIVY_VERSION='0.74.0'
readonly TRIVY_SHA256='2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a'
readonly GITLEAKS_VERSION='8.30.1'
readonly GITLEAKS_SHA256='551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'
readonly OPENGREP_VERSION='v1.30.0'
readonly OPENGREP_SHA256='35779bdd72e92129c8df2a77f0c55e8c08356801ea92591ef32108d6b28d564c'

if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'Esta verificação requer Linux x86_64.' >&2
  exit 2
fi

for command in curl sha256sum tar python3; do
  command -v "$command" >/dev/null || {
    echo "Dependência ausente: $command" >&2
    exit 2
  }
done
command -v git >/dev/null || {
  echo 'Dependência ausente: git' >&2
  exit 2
}

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

fetch_verified() {
  local url="$1" expected_sha256="$2" archive="$3"
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --tlsv1.2 --connect-timeout 10 --max-time 300 --retry 2 --retry-all-errors \
    --output "$archive" "$url"
  printf '%s  %s\n' "$expected_sha256" "$archive" | sha256sum --check --status || {
    echo 'Checksum do scanner não confere; execução interrompida.' >&2
    exit 2
  }
}

fetch_verified \
  "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
  "$TRIVY_SHA256" "$work_dir/trivy.tar.gz"
fetch_verified \
  "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
  "$GITLEAKS_SHA256" "$work_dir/gitleaks.tar.gz"
fetch_verified \
  "https://github.com/opengrep/opengrep/releases/download/${OPENGREP_VERSION}/opengrep_manylinux_x86" \
  "$OPENGREP_SHA256" "$work_dir/opengrep"

tar -xzf "$work_dir/trivy.tar.gz" -C "$work_dir" trivy
tar -xzf "$work_dir/gitleaks.tar.gz" -C "$work_dir" gitleaks
chmod 700 "$work_dir/opengrep"

"$work_dir/trivy" --version | head -n 1 | grep -Fq "$TRIVY_VERSION" || {
  echo 'A versão do Trivy não corresponde à fixada.' >&2
  exit 2
}
"$work_dir/gitleaks" version | grep -Fq "$GITLEAKS_VERSION" || {
  echo 'A versão do Gitleaks não corresponde à fixada.' >&2
  exit 2
}
"$work_dir/opengrep" --version 2>&1 | grep -Fq "${OPENGREP_VERSION#v}" || {
  echo 'A versão do OpenGrep não corresponde à fixada.' >&2
  exit 2
}

echo "Scanners verificados: Trivy $TRIVY_VERSION; Gitleaks $GITLEAKS_VERSION; OpenGrep $OPENGREP_VERSION."

# Monta alvos apenas a partir do índice Git e de extensões de código/config.
# Arquivos ignorados locais, .env, PDFs e nomes de backup não são lidos/copied.
scan_tree="$work_dir/scan-tree"
mkdir -p "$scan_tree"
while IFS= read -r -d '' path; do
  case "$path" in
    *[Bb]ackup*|*.bak|*.pdf|*.env|*.env.*|.env*) continue ;;
  esac
  case "$path" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.yaml|*.yml|*.tf|*.tf.json|Dockerfile|Dockerfile.*|compose.yaml|compose.yml|docker-compose.yaml|docker-compose.yml|package.json|package-lock.json|tsconfig*.json|.eslintrc*.json)
      ;;
    *) continue ;;
  esac
  [[ -f "$path" && ! -L "$path" ]] || continue
  mkdir -p "$scan_tree/$(dirname "$path")"
  cp -- "$path" "$scan_tree/$path"
done < <(git ls-files --cached -z)

set +e
SEMGREP_SEND_METRICS=off "$work_dir/opengrep" scan \
  --config .github/security-rules.yml \
  --json \
  --output "$work_dir/opengrep-results.json" \
  --error \
  "$scan_tree" >"$work_dir/opengrep.log" 2>&1
opengrep_status=$?
set -e

if [[ -f "$work_dir/opengrep-results.json" ]]; then
  if python3 - "$work_dir/opengrep-results.json" "$opengrep_status" <<'PY'
import json
import sys

path, status = sys.argv[1], int(sys.argv[2])
try:
    with open(path, encoding="utf-8") as report:
        data = json.load(report)
except (OSError, json.JSONDecodeError):
    print("OpenGrep não produziu um relatório legível; detalhes omitidos.", file=sys.stderr)
    raise SystemExit(2)

errors = data.get("errors") or []
if not isinstance(data.get("results"), list) or not isinstance(errors, list):
    print("OpenGrep retornou um relatório incompleto; detalhes omitidos.", file=sys.stderr)
    raise SystemExit(2)
if errors:
    print("OpenGrep retornou erro(s) de análise; detalhes omitidos.", file=sys.stderr)
    raise SystemExit(2)
findings = len(data.get("results") or [])
print(f"OpenGrep: {findings} achado(s) nas regras locais.")
if status not in (0, 1):
    print("OpenGrep falhou ao analisar; detalhes omitidos.", file=sys.stderr)
    raise SystemExit(status)
if findings or status == 1:
    raise SystemExit(1)
PY
  then
    report_status=0
  else
    report_status=$?
  fi
  if [[ "$report_status" -ne 0 ]]; then exit "$report_status"; fi
else
  echo 'OpenGrep não produziu relatório; resultado inconclusivo e detalhes omitidos.' >&2
  exit 2
fi

# Só detectores locais, sem exportar resultados. O banco/cache do Trivy é efêmero
# e não compartilhado entre PRs; não há leitura nem escrita em cache de workflow.
set +e
"$work_dir/trivy" fs \
  --scanners misconfig \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  --format json \
  --output "$work_dir/trivy-results.json" \
  --cache-dir "$work_dir/trivy-cache" \
  --skip-check-update \
  --no-progress \
  "$scan_tree" >"$work_dir/trivy.log" 2>&1
trivy_status=$?
set -e

if [[ -f "$work_dir/trivy-results.json" ]]; then
  if python3 - "$work_dir/trivy-results.json" "$trivy_status" <<'PY'
import json
import sys

path, status = sys.argv[1], int(sys.argv[2])
try:
    with open(path, encoding="utf-8") as report:
        data = json.load(report)
except (OSError, json.JSONDecodeError):
    print("Trivy não produziu um relatório legível; detalhes omitidos.", file=sys.stderr)
    raise SystemExit(2)

counts = {"CRITICAL": 0, "HIGH": 0}
if not isinstance(data.get("Results"), list):
    print("Trivy retornou um relatório incompleto; detalhes omitidos.", file=sys.stderr)
    raise SystemExit(2)
if data.get("Errors"):
    print("Trivy retornou erro(s) de análise; detalhes omitidos.", file=sys.stderr)
    raise SystemExit(2)
for result in data["Results"]:
    for finding in result.get("Misconfigurations") or []:
        severity = finding.get("Severity", "UNKNOWN").upper()
        if severity in counts:
            counts[severity] += 1
print(f"Trivy: {counts['CRITICAL']} críticos, {counts['HIGH']} altos.")
if any(counts.values()):
    raise SystemExit(1)
if status not in (0, 1):
    print("Trivy falhou ao analisar; detalhes omitidos.", file=sys.stderr)
    raise SystemExit(status)
PY
  then
    report_status=0
  else
    report_status=$?
  fi
  if [[ "$report_status" -ne 0 ]]; then exit "$report_status"; fi
else
  echo 'Trivy não produziu relatório; resultado inconclusivo e detalhes omitidos.' >&2
  exit 2
fi
if [[ "$trivy_status" -eq 1 ]]; then
  echo 'Trivy encontrou configuração crítica/alta; revisar o diagnóstico local sem divulgar evidências.' >&2
  exit 1
elif [[ "$trivy_status" -ne 0 ]]; then
  echo 'Trivy falhou ao analisar; detalhes omitidos.' >&2
  exit "$trivy_status"
fi

# O comando git percorre o histórico local completo. Redact protege a saída
# padrão; os detalhes não são persistidos como artifact nem impressos no job.
set +e
"$work_dir/gitleaks" git --redact --log-opts='--all' . \
  >"$work_dir/gitleaks.log" 2>&1
gitleaks_status=$?
set -e

if [[ "$gitleaks_status" -eq 0 ]]; then
  echo 'Gitleaks: nenhum segredo detectado no conteúdo/histórico.'
elif [[ "$gitleaks_status" -eq 1 ]]; then
  echo 'Gitleaks: segredo detectado no conteúdo/histórico; valores e detalhes foram omitidos.' >&2
  exit 1
else
  echo 'Gitleaks falhou ao analisar; detalhes omitidos.' >&2
  exit "$gitleaks_status"
fi
