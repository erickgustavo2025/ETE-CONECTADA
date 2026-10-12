#!/usr/bin/env bash
set -euo pipefail

# Release oficial v1.7.12, Linux x86_64; conferir o checksum antes de executar.
# https://github.com/rhysd/actionlint/releases/tag/v1.7.12
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  printf '%s\n' 'A verificação requer Linux x86_64.' >&2
  exit 1
fi

lint_tmp=$(mktemp -d)
trap 'rm -rf "$lint_tmp"' EXIT
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --connect-timeout 10 --max-time 60 --retry 2 \
  https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
  --output "$lint_tmp/actionlint.tar.gz"
printf '%s  %s\n' \
  8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 \
  "$lint_tmp/actionlint.tar.gz" | sha256sum --check --status

tar -xzf "$lint_tmp/actionlint.tar.gz" -C "$lint_tmp" actionlint
"$lint_tmp/actionlint" -color "$@"
