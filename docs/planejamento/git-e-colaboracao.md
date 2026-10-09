# Git e colaboração de TH/Tacyo e Erick

A dupla pode atuar nos mesmos módulos. TH lidera inicialmente DevOps/segurança e Erick produto/backend, com dono por card e revisão do outro dev. Esta organização cria branches locais de partida; não altera aplicação nem realiza merge ou deploy.

## Branches de partida

| Branch | Escopo inicial | Referências |
|---|---|---|
| `feature/declaracoes` | Modelos e atendimento por modalidade | EC-046, EC-069 a EC-075 |
| `feature/certificados` | Descobrir requisitos de certificados antes de codificar | EC-111 |
| `feature/importacao-integrado` | Entrada/atualização do integrado | EC-055 a EC-057, EC-105 |
| `feature/importacao-subsequente` | Entrada/atualização do subsequente e módulos | EC-106, EC-108 |
| `feature/frontend` | Site/portal, conteúdo, acessibilidade | EC-076 a EC-079 |
| `feature/autenticacao` | Titularidade, recuperação, acesso e sessão | EC-044, EC-058 a EC-066 |
| `feature/ci-cd` | Testes, Actions e qualidade | EC-028 a EC-043, EC-086 a EC-088, EC-109 |
| `feature/infraestrutura` | Docker, VPS, backup, operação | EC-050, EC-080 a EC-085, EC-089/090 |

Uma branch é uma linha de commits do **projeto inteiro**. O nome com `/` organiza visualmente referências, não cria uma branch dentro de outra nem restringe os arquivos presentes. Não criar a branch isolada `feature`, pois ela conflita com os nomes `feature/...` no Git. Usamos nomes ASCII.

Estas branches começam na mesma base documental. Para cada fatia pequena, preferir uma branch por card, como `feature/ec-105-importacao-integrado`. Não transformar cada branch de área em meses de mudanças independentes: integrar PRs pequenos quando estiverem estáveis e testados, sem esperar todo o produto ficar pronto. Reutilizar uma branch de área exige atualizar a base e combinar o escopo com o colega.

## Rotina por tarefa

1. Atualizar `main`, conferir árvore limpa e escolher card/dono/revisor.
2. Criar ou selecionar a branch; informar ao colega arquivos e contrato de dados a modificar.
3. Implementar uma fatia e executar verificações pertinentes. Banco de testes isolado; nenhum teste usa dados reais de alunos.
4. Fazer commit e publicar a branch; abrir PR com ID do card, comportamento, comandos/resultados e limitações.
5. Outro dev revisa; checagens obrigatórias e testes devem passar e demonstrar falha quando o comportamento estiver incorreto.
6. Testar/homologar a fatia, fazer merge em `main` e registrar o commit no Trello. Release segue gates próprios; merge não libera produção automaticamente.

Exemplo após a publicação inicial e com árvore limpa:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/ec-105-importacao-integrado
# implementar e verificar
git add caminhos-revisados
git commit -m "feat: importar integrado conforme EC-105"
git push -u origin feature/ec-105-importacao-integrado
```

Sem `force push` em `main`. Se houver commits locais divergentes, combinar integração/rebase antes de continuar; não usar reset destrutivo. A proteção de main e os workflows ainda serão implementados em EC-034/028, conforme plano e recursos do GitHub privado.

## Evitar colisões no mesmo arquivo

Prisma/migrações, `package.json`/lockfile, `shared/` e configurações raiz exigem acordo prévio: um dev integra a alteração e o outro atualiza sua branch antes de modificar o mesmo contrato. Separar commits por responsabilidade; não editar simultaneamente o mesmo checkout sem coordenação. Durante conflito, preservar intenção e testes dos dois, revisar o diff completo e executar verificações compartilhadas.

Se cada dev trabalha em sua máquina, ambos usam clone próprio e sincronizam pelo remoto. Branches não sincronizam arquivos automaticamente entre chats/máquinas.

## Passagem de contexto entre chats

```text
Card: EC-xxx | Dono: TH ou Erick | Revisor: outro dev
Branch: feature/... | Commit base: hash verificado
Objetivo/critério: ...
Arquivos/contratos a alterar: ...
Decisões da escola: ... (registradas em docs/AGENTS)
Feito e verificado: comando + resultado + commit/PR
Pendente/bloqueado: motivo + próxima ação
```

Não colar credenciais, planilhas de alunos ou documentos preenchidos. Contexto recebido de chat/anexo é fonte; decisões atuais da equipe e código conferido orientam execução. Atualizar AGENTS quando a equipe mudar regra/etapa, e o Trello quando mudar estado. A ordem dos cards pode mudar conforme dependências e capacidade; não é necessário seguir o número EC em sequência.

## Publicação inicial

Na organização de 09/10, a consulta ao remoto falhou por falta de autenticação do Git HTTPS neste terminal. Nome/e-mail locais identificam commits, mas não autenticam GitHub. As oito branches serão criadas localmente na base documental final; não presumir referências publicadas no remoto.

Depois de autenticar, conferir remoto/branches e executar na raiz `bash tasks/publicar-branches.sh`. O script publica apenas main e as oito referências listadas, sem force push; uma divergência exige integração com a dupla. Não foi executado nesta organização.
