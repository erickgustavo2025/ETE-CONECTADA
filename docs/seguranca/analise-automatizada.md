# Análise automatizada de código, configuração e segredos

O workflow `Análise automatizada de segurança` roda em pull requests para `main`, pushes para `main` e `feature/**`, execução manual e agenda semanal. Ele usa `pull_request`, concede somente `contents: read` no job, faz checkout do histórico completo sem persistir credenciais e não declara secrets, cache, upload de relatórios ou `pull_request_target`. As actions executadas são fixadas por SHA. O workflow não instala dependências do projeto nem executa seus scripts.

## Ferramentas e escopo

O job baixa três executáveis Linux x86_64 de releases oficiais e compara cada arquivo com o SHA-256 versionado em `.github/scripts/security-scan.sh` antes de executá-lo:

| Ferramenta | Versão  | Uso                                                            | Release oficial                                                       |
| ---------- | ------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| OpenGrep   | v1.30.0 | Regras SAST locais para JavaScript/TypeScript                  | [v1.30.0](https://github.com/opengrep/opengrep/releases/tag/v1.30.0)  |
| Trivy      | 0.74.0  | Misconfigurations em IaC compatível                            | [v0.74.0](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0) |
| Gitleaks   | 8.30.1  | Segredos no conteúdo e em commits alcançáveis do histórico Git | [v8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)  |

O OpenGrep carrega somente `.github/security-rules.yml`, um arquivo local fixado no próprio commit. As regras atuais detectam `eval`, `new Function`, `dangerouslySetInnerHTML` e chamadas Prisma `$queryRawUnsafe`/`$executeRawUnsafe`. Essa análise por padrões ajuda a encontrar erros conhecidos, mas não acompanha fluxo de dados entre arquivos e não prova ausência de vulnerabilidades. A regra Prisma tem uma exceção estreita para `apps/portal/scripts/test-student-import.ts`: o teste cria e remove DDL temporário com valores gerados internamente para provar rollback. A exceção não vale para arquivos da aplicação nem para as demais regras.

O Trivy lê uma área temporária criada exclusivamente de arquivos rastreados pelo Git e de uma lista de extensões de código/configuração. Arquivos `.env*`, PDFs e caminhos com `backup` são excluídos antes da cópia; arquivos ignorados e não rastreados não entram nessa análise. O escopo depende dos tipos de IaC suportados pelo Trivy. Nesta versão, o bundle Rego é o que acompanha o executável: `--skip-check-update` impede que uma execução use um bundle externo mutável. A documentação do Trivy informa que as checks são distribuídas separadamente e atualizadas por padrão; por isso, uma atualização futura do bundle deve ser revisada e fixada junto com a ferramenta, não habilitada implicitamente.

O Gitleaks recebe o checkout completo e varre `--all`, cobrindo também valores que foram removidos do `HEAD` mas permanecem em commits alcançáveis. Não há baseline que esconda achados antigos. O relatório completo e os logs ficam em diretório temporário removido ao final; somente contagens e estado são impressos. Nada é enviado como artifact. A opção `--redact` também protege mensagens que o Gitleaks produziria diretamente.

## Critérios e triagem

Qualquer resultado das regras locais do OpenGrep reprova o job. O Trivy reprova configuração de severidade alta ou crítica. O Gitleaks reprova qualquer segredo detectado. Falhas de download, checksum, versão, leitura de relatório ou execução também reprovam a verificação; um erro do scanner não equivale a resultado limpo.

Para investigar, reproduza a execução em ambiente local e consulte os detalhes sem copiar valores secretos para logs, issues ou documentos compartilhados. Confirme o contexto no código e classifique o resultado como problema confirmado, falso positivo ou comportamento que requer decisão. Correções de código devem remover a causa. Para um segredo confirmado, revogue/rotacione primeiro e verifique a extensão do histórico; remover o arquivo atual não elimina o segredo de commits antigos. Reescrita do histórico compartilhado exige coordenação com responsáveis pelo repositório e não é automatizada por este workflow.

Uma exceção só deve ser adicionada após revisão do caso, com regra, arquivo ou fingerprint estritos, justificativa sanitizada, responsável e data de reavaliação. Não use allowlist global, não ignore todos os SQL raw e não registre o valor detectado. A exceção Prisma atual fica limitada à regra e ao arquivo de teste citados acima.

O comando local reproduz a varredura sobre o conteúdo rastreado do checkout:

```bash
bash .github/scripts/security-scan.sh
```

Requer Linux x86_64, `curl`, `sha256sum`, `tar`, `python3` e acesso às releases oficiais. O script não usa credenciais, cache compartilhado nem dados do banco.

## Limites de GitHub e verificação

CodeQL não foi configurado porque o repositório é privado e GitHub documenta que code scanning em repositórios privados requer GitHub Code Security habilitado. A conta com acesso de escrita não confirmou acesso administrativo ou licença, então este fluxo não presume esse recurso. Os resultados deste job também não aparecem no painel Code Scanning: são apenas o status do workflow.

A disponibilidade de workflows de PR de forks e a proteção de branches dependem de configurações administrativas que não foram verificadas. O administrador deve configurar `scan` como check obrigatório na proteção de `main` e manter desativado o envio de secrets e tokens graváveis a PRs externos. Até isso ser confirmado, o workflow produz um gate de CI, mas a exigência de aprovação para merge não está comprovada.

## Verificações desta entrega

Em 12/10/2026, os três checks locais foram executados após validar os SHA-256 fixados. O scan do checkout registrou zero resultados OpenGrep, zero configurações Trivy altas/críticas e nenhum segredo detectado pelo Gitleaks. Em fixtures descartáveis fora do repositório, um `eval` artificial, uma configuração Kubernetes privilegiada e um marcador de segredo fictício apenas em commit antigo foram detectados com saída 1; os controles negativos passaram com saída 0. O valor sintético foi confirmado ausente dos logs. As fixtures, o histórico de teste e os relatórios foram removidos ao terminar.
