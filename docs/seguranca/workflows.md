# Segurança dos workflows

O CI verifica código de branches e pull requests em runners hospedados pelo GitHub. Ele não publica a aplicação nem acessa a VPS ou o banco da escola. A auditoria de dependências consulta o lockfile por agendamento ou execução manual. A publicação das imagens é um fluxo separado, manual e restrito à `main`, descrito em [Publicação no GHCR](../publicacao-ghcr.md).

## Permissões e execução

Os workflows começam com `permissions: {}`. Cada job concede somente `contents: read` para obter o repositório; novas tarefas precisam declarar suas próprias permissões. O GitHub também fornece `metadata: read`. O checkout usa `persist-credentials: false`, sem deixar o token na configuração Git para os comandos seguintes.

CI, imagens e análise de segurança usam `pull_request` para propostas à `main` e `push` somente em `main`. Assim, atualizar um PR não dispara também outra suíte pelo push da branch. A execução manual permite conferir uma branch quando necessário; a análise de segurança mantém seu agendamento. Não foram removidos jobs nem checks obrigatórios. Não usa `pull_request_target`, `workflow_run`, runners próprios ou ambientes de implantação. Nenhum passo recebe `secrets.*`. As credenciais do PostgreSQL são aleatórias, geradas durante o job, e servem apenas ao banco descartável em loopback; os testes confirmam sua identidade antes de escrever.

Os jobs têm timeout e o workflow cancela execuções anteriores da mesma referência. A instalação usa `npm ci --ignore-scripts`. Os comandos de testes e build ainda executam código do repositório: uma aprovação de execução de PR não substitui a revisão do código.

## Dependências da automação

As actions são fixadas por commit. Os SHAs foram conferidos nos respectivos repositórios oficiais:

| Action                                                                  | Release conferida | Commit                                     |
| ----------------------------------------------------------------------- | ----------------- | ------------------------------------------ |
| [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1)     | v7.0.1            | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| [setup-node](https://github.com/actions/setup-node/releases/tag/v6.5.0) | v6.5.0            | `249970729cb0ef3589644e2896645e5dc5ba9c38` |

O Dependabot pode propor novas versões; a revisão deve conferir o SHA e os efeitos da atualização antes do merge.

O job **Validar workflows** roda [actionlint v1.7.12](https://github.com/rhysd/actionlint/releases/tag/v1.7.12). O script baixa o binário Linux x86_64 em diretório temporário, compara seu SHA256 fixado com o arquivo recebido e só então extrai e executa. Falha de download ou checksum reprova o job. Build e integração dependem dessa validação. O actionlint confere YAML, expressões, referências entre jobs e comandos; não comprova sozinho a segurança de uma alteração.

Para executar a mesma verificação em Linux x86_64, com `curl`, `sha256sum` e `tar`:

```bash
bash .github/scripts/check-workflows.sh
```

O cache npm fica habilitado apenas em `push`. Em qualquer PR, inclusive do próprio repositório, a expressão resulta em string vazia e `package-manager-cache: false` impede a ativação automática pelo setup-node. A auditoria também não usa cache automático. Isso mantém a execução do código sob revisão fora do caminho de leitura/gravação desse cache.

## PRs de forks e limites da revisão

A simulação estática considerou um evento `pull_request` com `head.repo` externo e base `main`:

| Verificação             | Resultado do workflow atual                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| Token solicitado        | Somente `contents: read`; outras permissões não concedidas pelo YAML      |
| Cache npm               | Desativado porque o evento não é `push`                                   |
| Runner                  | `ubuntu-latest`, hospedado pelo GitHub                                    |
| Credenciais de produção | Nenhuma referência a secrets, ambiente de deploy ou servidor da escola    |
| Banco dos testes        | Instância criada no próprio job, com identidade e credenciais temporárias |

Essa análise não foi uma execução de fork real. Em repositórios privados, a disponibilidade de workflows de forks e as opções de envio de tokens/secrets dependem de configurações administrativas. A consulta dessas opções retornou 404 para a conta com acesso de escrita, portanto seu estado permanece **não verificado**. O administrador deve conferir as opções de forks em **Settings → Actions → General**, mantendo desativado o envio de tokens de escrita e secrets a PRs de forks e exigindo a aprovação apropriada para colaboradores externos.

Alterações em workflows e scripts de CI precisam de revisão: o autor de um PR pode propor mudanças nesses próprios arquivos. A proteção de merge e os checks obrigatórios seguem a EC-034; não são garantidos por este documento nem pelo actionlint.

Quando houver CD, usar um fluxo separado, disparado por código já integrado/revisado, com permissões e credenciais restritas ao job de deploy. Não executar o código de um PR externo com acesso à produção.

Referências: [permissões dos workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions), [eventos e PRs de forks](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request), [configuração administrativa do Actions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).
