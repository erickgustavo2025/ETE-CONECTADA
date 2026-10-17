# Seed e testes em PostgreSQL descartável

Seed, `test:db`, `test:registration`, `test:declarations`, `test:session` e `test:import` escrevem registros sintéticos. Esses comandos exigem um banco local separado: não usam `DATABASE_URL`/`DIRECT_URL` de `.env.local` como destino nem permitem Neon ou host remoto. O portal normal continua usando sua configuração atual.

## Preparar o banco

Use Node.js 24, `npm ci` e um PostgreSQL **novo e descartável**, acessível exclusivamente em loopback. Para execução local, a instalação do PostgreSQL é uma pré-condição. O exemplo usa porta 55432 e um usuário local de teste. Adapte somente para a sua instância descartável. O CI provisiona sua própria instância, conforme a seção abaixo; não provisiona VPS nem produção.

Crie o banco e uma identidade própria (UUID gerado, por exemplo, com `node -e 'console.log(require("node:crypto").randomUUID())'`). Em `psql`, conectado ao PostgreSQL descartável:

```sql
CREATE DATABASE ete_test_portal;
-- Substitua o UUID abaixo pelo que acabou de gerar.
COMMENT ON DATABASE ete_test_portal IS
  'ETE_CONECTADA_TEST:5ed51bf1-2d61-42a8-9a7c-146cce815fe2';
```

Não marque um banco da escola ou um banco existente como descartável para contornar a guarda. O marcador é uma declaração explícita de quem prepara o ambiente, não uma prova de isolamento físico. Não use túnel/proxy apontando ao banco real.

No terminal de teste, defina as cinco variáveis; use somente credenciais dessa instância:

```bash
export NODE_ENV=test
export ALLOW_TEST_DATABASE_WRITES=true
export TEST_DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:55432/ete_test_portal'
export TEST_DATABASE_NAME=ete_test_portal
export TEST_DATABASE_ID=5ed51bf1-2d61-42a8-9a7c-146cce815fe2
```

A URL deve usar PostgreSQL, loopback (`127.0.0.1`, `localhost` ou `::1`), o nome exato `ete_test_*` e nenhum parâmetro/hash. Opt-in deve ser exatamente `true`; `NODE_ENV=production` sempre é recusado. O UUID deve corresponder exatamente ao comentário do banco.

Gere o cliente e aplique as migrações **somente nesse banco novo**. As guardas dos testes não envolvem comandos administrativos Prisma; por isso o destino é explícito na chamada de migração:

```bash
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" \
  npm run db:generate --workspace @ete-conectada/portal
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" \
  npm run db:migrate --workspace @ete-conectada/portal
npm run db:seed --workspace @ete-conectada/portal
```

O seed mantém três alunos fictícios e uma conta de teste. Reexecução preserva contas/senhas; colisão com aluno ou matrícula divergente cancela a transação. Ele não faz reset ou exclusão geral.

## Executar

```bash
npm run test:guards
npm run test:schema
npm run test:integration
# Somente em banco NOVO, sem seed ou outros dados:
npm run test:cleanup
npm run build
```

Execute os testes HTTP em sequência, sem outro `next dev` na pasta do portal: o Next compartilha `.next/dev` e seu lock. Cada teste inicia um servidor próprio com a URL já conferida, em `127.0.0.1`/porta livre, e `RESEND_API_KEY`/`EMAIL_FROM` vazios. Não precisa iniciar `dev:portal`. `TEST_BASE_URL` é recusado, inclusive localhost, para evitar uma instância que use outro banco.

Antes de Prisma/servidor/fixtures, a guarda valida a configuração e consulta apenas `current_database()` e o comentário em `pg_database`. Nome ou UUID divergente impedem escritas. Sem configuração completa, nem essa conexão ocorre. Erros não imprimem connection strings.

Ao terminar (inclusive por falha), os scripts tentam excluir somente os IDs criados por eles e encerram o portal e as conexões. Se o banco ficar indisponível ou o processo sofrer SIGKILL, a limpeza não pode ser garantida; descarte a instância de teste inteira. SIGINT/SIGTERM cancela a inicialização e encerra o servidor próprio.

`test:declarations` salva `declaracao.pdf` e `lote.pdf` sintéticos em um diretório novo `ete-declarations-test-*` na pasta temporária do sistema, com criação exclusiva dos arquivos. O caminho é informado para conferência visual; remova esse diretório após a conferência. `TEST_PDF_OUTPUT` e `TEST_BATCH_PDF_OUTPUT` são recusados para não sobrescrever arquivos existentes. Nenhum PDF real deve entrar nesse ambiente.

Testes aprovados verificam o protótipo em desenvolvimento; não homologam o modelo da escola, não validam titularidade do primeiro acesso nem liberam autenticação/emissão em produção.

## Migrações no GitHub Actions

O job **Migrações e integração em PostgreSQL descartável** do workflow CI roda em PRs para `main` e pushes para `main`/`feature/**`. Cada job inicia um contêiner oficial PostgreSQL 16, fixado por digest, com nome de banco e senha aleatórios, porta livre publicada somente em `127.0.0.1` e armazenamento em memória. Não monta diretório do projeto, volume persistente ou arquivo `.env`, nem recebe credenciais do Neon/escola. A preparação confirma banco vazio e grava um UUID no comentário usado pela guarda. Senha/URL são mascaradas nos logs do Actions; as variáveis de teste ficam apenas no ambiente do job.

Depois da preparação, executa `db:validate`, `db:migrate`, `db:status` e `test:schema`. Reexecuta `db:migrate` e `test:schema` para comprovar ausência de migrações pendentes. A etapa `always()` remove somente o contêiner criado para aquele run/attempt, inclusive após falha; se o runner for encerrado abruptamente, a VM hospedada e seu armazenamento descartável também não são reutilizados.

`test:schema` é somente leitura e exige a mesma identidade/opt-in dos demais testes. Confere histórico/checksums das migrações, tabelas e colunas esperadas, campos essenciais, enums, FKs, índices únicos e CHECKs do banco. Inclui `retired_profile_photos`, preservada como arquivo histórico, e o índice parcial de solicitação aberta. A conferência explícita cobre regras SQL fora do modelo Prisma; não usa um diff que proponha apagar esse arquivo. Ao mudar o contrato do banco, revise também esse teste. A documentação [Prisma migrate diff](https://docs.prisma.io/docs/cli/v7/migrate/diff) descreve o limite da comparação para recursos não representados no Prisma.

## Integração no GitHub Actions

O mesmo job, **Migrações e integração em PostgreSQL descartável**, gera explicitamente o cliente Prisma após validar as migrações e executa `npm run test:integration`: importação → cadastro → declaração → sessão/autorização → produção → dados complementares → vigência de matrícula → importação XLS → histórico das alterações escolares → banco, em sequência. O comando usa `&&`, portanto uma falha interrompe os testes seguintes e reprova a etapa. Os testes de desenvolvimento usam o helper existente para conferir identidade do banco, iniciar seu próprio Next dev em loopback/porta livre, aguardar readiness e encerrar servidor/conexões/fixtures. `TEST_BASE_URL` permanece recusado; não se inicia `dev:portal` externo. O subprocesso força `NODE_ENV=development` e e-mail desabilitado. Nenhuma autenticação em produção é liberada.

Após a integração, `test:cleanup` confere que as tabelas de dados estão vazias, sem apagar nada. Essa etapa também executa depois de uma falha, desde que o banco e o cliente tenham sido preparados. Ela falha se restarem alunos, contas, matrículas, sessões, tokens, solicitações ou fotos arquivadas. Esse comando só faz sentido no banco **novo e sem seed** do job; num banco de demonstração com fixtures preexistentes, um resultado não vazio é esperado. A guarda de identidade é a mesma dos demais testes.

A remoção do contêiner segue com `always()`, independentemente do resultado da conferência de limpeza. Registros residuais são sinalizados, não apagados para disfarçar a falha. PDFs sintéticos temporários e processos restantes em encerramentos abruptos são descartados junto com a VM hospedada. As saídas dos testes ficam nos logs do Actions, sem tokens, senhas ou connection strings; não se publicam PDFs como artifacts. O job não depende de servidor, seed, e-mail ou banco da escola.

## Acessos fixos para demonstração local

Para explorar as telas, use um banco local separado dos testes automáticos e dos dados da escola. Prepare um banco novo e identificado como acima, aplique as migrações e execute na raiz:

```bash
npm run db:demo
# Neste mesmo terminal, com as variáveis do banco de demonstração:
export DATABASE_URL="$TEST_DATABASE_URL"
export DIRECT_URL="$TEST_DATABASE_URL"
export NODE_ENV=development
export RESEND_API_KEY=
export EMAIL_FROM=
npm run dev:portal
```

Se já houver um portal rodando nesta pasta, encerre-o antes de iniciar outro. Abra `http://localhost:3001/login`. Estes acessos são inteiramente fictícios:

| Papel            | E-mail                                 | Senha inicial |
| ---------------- | -------------------------------------- | ------------- |
| Aluno (Lucas)    | `aluno.teste@eteconectada.invalid`     | `Teste@12345` |
| Secretaria (Ana) | `secretaria.demo@eteconectada.invalid` | `Teste@12345` |

O aluno acessa `/declaracao`; a secretaria acessa `/secretaria/declaracoes`. Use perfis separados do navegador ou saia de uma conta antes de entrar na outra.

`db:demo` confere a identidade antes de aplicar migrações e preparar as três matrículas fictícias para emissão no período `2026`. Não ativa matrículas reais nem desfaz situações já conferidas. Usa as mesmas guardas do seed: somente loopback, nome e UUID identificados, opt-in explícito e ambiente test/development. Não cria acesso em Neon nem em produção. As contas permanecem após encerrar o portal e não são removidas pelos testes automáticos; a persistência entre reinícios depende de manter o armazenamento do PostgreSQL. Não rode `test:cleanup` neste banco, pois ele exige banco vazio.

Reexecutar o comando preserva senhas existentes. Conta com e-mail, papel ou estado divergente cancela toda a transação; não promove uma conta existente nem redefine sua senha. A senha da tabela só vale para uma conta criada pelo comando e ainda não modificada. O seed normal mantém Marina e Ana disponíveis para primeiro acesso quando não têm conta; `db:demo` ocupa a conta de Ana para demonstrar a secretaria.

## Sessão e autorização

`npm run test:session` usa o mesmo banco descartável identificado e portal próprio. Verifica cookies inválidos/adulterados, expiração, contas pendentes/não reivindicadas, revogação e logout; prova isolamento entre dois alunos e restrição da secretaria, inclusive após mudança do papel no banco. Geração de PDF por secretaria é o controle positivo. Fixtures são removidas em finally; não executar na instância de demonstração ou da escola.

## Bloqueios de produção

`npm run test:production` usa uma cópia/checkout isolado, sem arquivos `.env` na raiz ou no portal. Não execute onde há um Next em uso: o comando compila o portal e substitui seu `.next`. Gere antes o cliente com `npm run db:generate --workspace @ete-conectada/portal`; use as mesmas variáveis e o banco novo identificado dos demais testes.

O teste cria uma conta e sessão sintéticas e confirma que a sessão é válida no banco descartável. Depois compila e inicia seu próprio `next start`, em loopback/porta livre, com `NODE_ENV=production`. Esse subprocesso não recebe credenciais do banco da fixture: `DATABASE_URL` e `DIRECT_URL` apontam para um servidor TCP local que conta e recusa conexões. Qualquer tentativa de consultar o banco durante o build ou as rotas exercitadas reprova a suíte.

Confere login/cadastro bloqueados, páginas privadas redirecionadas, APIs privadas negadas mesmo com cookie válido de desenvolvimento e ausência de dados/link/token nas respostas verificadas. Logout remove o cookie sem consultar o banco em produção. A sessão original continua intacta. Servidor, conexões e fixture próprios são encerrados/removidos no `finally`; não habilita acesso nem emissão em produção.

No CI, essa prova roda em sequência depois dos testes de desenvolvimento, recompila apenas o portal e participa da mesma conferência de limpeza. Não recebe arquivos locais, dados reais ou credenciais institucionais.

## Entradas de login e cadastro

As quatro rotas de acesso aceitam objetos JSON de até 4096 bytes (4 KiB), medidos durante a leitura. Corpo maior retorna 413, JSON/tipos inválidos retornam 400 e mídia diferente de `application/json` retorna 415. `Content-Length` permite rejeição antecipada, mas não substitui a contagem real; corpos sem esse cabeçalho também têm limite. Produção continua recusando acesso antes de ler o corpo.

Login e cadastro aceitam senhas de 8 a 128 unidades UTF-16, conforme a regra existente de comprimento JavaScript, sem truncar nem remover espaços. Os campos têm limites antes da normalização: identificador/e-mail 320, matrícula/CPF 32, nascimento 10 e token 50; e-mail normalizado continua limitado a 254 e os formatos existentes continuam validados. Dados fora do contrato são recusados antes de consulta ou scrypt. Esse controle de tamanho não substitui limites de frequência das requisições.

`test:unit` gera o cliente Prisma antes dos testes, sem consultar banco, e inclui `test-access-input.ts`: corpos no limite, UTF-8, stream cancelado, cabeçalhos ausentes/subestimados, arrays/null, tipos e tamanhos de campos. Os handlers reais usam sentinelas instrumentadas para contar tentativas de banco e scrypt; entradas recusadas não podem acioná-las. Controles válidos comprovam que as sentinelas estão ativas, sem consultar banco ou calcular senha nessa prova. O teste HTTP de cadastro confirma recusas também com envio chunked e mantém o fluxo positivo completo no banco descartável.

## Importação JSON

`npm run test:import` exercita o CLI real com um backup pequeno e inteiramente fictício, no mesmo PostgreSQL descartável identificado. Não inicia portal, não envia e-mail e não lê a planilha de alunos da escola. A identidade é conferida antes de criar a fixture ou iniciar o importador; o subprocesso recebe explicitamente a URL já validada.

Confere lista branca, acesso bloqueado por padrão, repetição sem duplicar alunos/matrículas, preservação de dados e contas existentes e conflitos entre matrícula e identificador de origem. O teste também libera um aluno sintético com o opt-in de desenvolvimento e confirma que reimportar não altera essa permissão.

Para provar rollback depois de uma escrita, cria uma restrição temporária em `enrollments`, limitada ao identificador aleatório da fixture. Ela força a falha da matrícula após a criação do aluno; nenhum registro parcial pode permanecer. A restrição é removida em `finally`, assim como o arquivo JSON temporário e apenas os alunos gerados pelo teste. Este teste requer permissão para adicionar/remover essa restrição exclusivamente no banco descartável.

A prova participa de `test:integration` antes dos testes HTTP e da conferência final de limpeza no CI. Não executá-la no banco de demonstração nem no banco da escola.

## Situação e vigência das matrículas

`npm run test:enrollments` exige banco novo e identificado, sem seed. Verifica conferência exclusiva da secretaria, matrículas múltiplas, período/datas, mudanças entre geração e liberação e preparação idempotente da demonstração. Cria e remove suas fixtures, inclusive as contas de demonstração criadas durante a prova. O comando participa de `test:integration`; não deve rodar no banco de demonstração em uso. Regras e migração em [Vigência das matrículas](vigencia-matriculas.md).

## Importação XLS

`test:sheet-input` lê somente arquivos fictícios gerados em memória e integra os unitários, sem banco. `npm run test:sheet-import` exige banco novo identificado e inicia seu próprio portal; prova a API de prévia/confirmacão, autorização, limites, repetição, proteção de dados e rollback após falha intermediária. Integra `test:integration`. O teste remove seus alunos/contas/prévias no finally e nunca deve ser executado no banco de demonstração em uso. Regras em [Núcleo de importação](importacao-nucleo.md).

## Recuperação de senha

`npm run test:password-reset` usa o banco descartável identificado e um portal
próprio. O transporte de entrega é substituído no serviço por uma função local;
não lê chaves, não envia e-mail real e não expõe um endpoint de token de teste.
Verifica recibo genérico, validade/uso único, concorrência, intervalo de envio,
mudança de contato, senha, revogação de sessões e rollback após falha intermediária.
Inclui recuperação de aluno e secretaria, sem redefinir contas pendentes.

A suíte participa de `test:integration`. Os unitários validam entradas, bloqueio
antes de consultar banco e o transporte Resend com `fetch` simulado. A prova de
produção exercita as duas APIs sem acesso ao banco. O navegador testa teclado,
telas pequenas, links abertos novamente na mesma aba e resposta perdida após
uma troca efetiva. Fixtures e servidores próprios são encerrados em `finally`.
Essas provas não confirmam entrega real na caixa de e-mail.

## Relógio da conexão

`npm run test:database-time` compara timestamps SQL/ORM e epoch, confere o pool real e opções de conexão inicialmente UTC/Fortaleza. Verifica preservação de DATE e statement_timeout, com marcador conferido antes de escrever e rollback das fixtures. A prova integra `test:integration`; não usa banco persistente. O procedimento de atualização está em [Horários do banco](seguranca/horarios-banco.md).

## Leitura das APIs privadas

As rotas privadas que recebem JSON limitam os bytes durante a leitura, antes de converter o corpo inteiro. Cabeçalho ausente ou subestimado não altera o teto. Corpo excessivo retorna413; JSON, UTF-8 ou raiz inválidos retornam400; mídia diferente deapplication/json retorna415. As respostas mantêm cache privado/no-store e nosniff. Sessão, papel e origem continuam conferidos antes de processar o corpo.

| Operação                                       | Limite em bytes |
| ---------------------------------------------- | --------------: |
| Pedido de declaração e liberação para retirada |           1.000 |
| Busca de alunos                                |           4.096 |
| PDF individual                                 |          16.000 |
| Lote de PDFs                                   |         400.000 |

O acesso mantém4.096bytes; o importador XLS mantém seu leitor próprio de3MiB e limite de arquivo de2MiB. Os controles de tamanho não substituem autorização, validação de campos ou limites de infraestrutura.

`npm run test:private-input` usa contas de aluno e secretaria fictícias, PostgreSQL identificado e portal próprio. Em cada rota, aquece a compilação e envia um stream acima do limite sem concluir o upload: o servidor precisa responder413antes deEOF. Confere origens, papel, ausência de cookie, mídia/JSON inválidos, headers e preservação de contas/sessões/solicitações. Integra a suíte serial `test:integration` e remove as fixtures no finally. Os unitários do leitor compartilhado cobrem fronteiras UTF-8 de cada limite e cancelamento antecipado, inclusive quando a promessa de cancelamento não termina. Não executar no banco persistente da demonstração.
