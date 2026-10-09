#!/usr/bin/env bash
set -euo pipefail

# Executar na raiz, após autenticar Git/GitHub. Publica somente estas referências.
# Sem force push: divergência no remoto deve ser resolvida pela dupla antes de repetir.
git push -u origin \
  main \
  feature/declaracoes \
  feature/certificados \
  feature/importacao-integrado \
  feature/importacao-subsequente \
  feature/frontend \
  feature/autenticacao \
  feature/ci-cd \
  feature/infraestrutura
