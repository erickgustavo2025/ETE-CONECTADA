# Seed e testes em PostgreSQL descartável

Seed, `test:db`, `test:registration` e `test:declarations` escrevem registros sintéticos. Esses comandos exigem um banco local separado: não usam `DATABASE_URL`/`DIRECT_URL` de `.env.local` como destino nem permitem Neon ou host remoto. O portal normal continua usando sua configuração atual.

## Preparar o banco

Use Node.js 24, `npm ci` e um PostgreSQL **novo e descartável**, acessível exclusivamente em loopback. A instalação do PostgreSQL é uma pré-condição; este documento não provisiona VPS, Docker, CI ou produção. O exemplo usa porta 55432 e um usuário local de teste. Adapte somente para a sua instância descartável.

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
npm run test:db --workspace @ete-conectada/portal
npm run test:registration
npm run test:declarations
npm run build
```

Execute os testes HTTP em sequência, sem outro `next dev` na pasta do portal: o Next compartilha `.next/dev` e seu lock. Cada teste inicia um servidor próprio com a URL já conferida, em `127.0.0.1`/porta livre, e `RESEND_API_KEY`/`EMAIL_FROM` vazios. Não precisa iniciar `dev:portal`. `TEST_BASE_URL` é recusado, inclusive localhost, para evitar uma instância que use outro banco.

Antes de Prisma/servidor/fixtures, a guarda valida a configuração e consulta apenas `current_database()` e o comentário em `pg_database`. Nome ou UUID divergente impedem escritas. Sem configuração completa, nem essa conexão ocorre. Erros não imprimem connection strings.

Ao terminar (inclusive por falha), os scripts tentam excluir somente os IDs criados por eles e encerram o portal e as conexões. Se o banco ficar indisponível ou o processo sofrer SIGKILL, a limpeza não pode ser garantida; descarte a instância de teste inteira. SIGINT/SIGTERM cancela a inicialização e encerra o servidor próprio.

`test:declarations` salva `declaracao.pdf` e `lote.pdf` sintéticos em um diretório novo `ete-declarations-test-*` na pasta temporária do sistema, com criação exclusiva dos arquivos. O caminho é informado para conferência visual; remova esse diretório após a conferência. `TEST_PDF_OUTPUT` e `TEST_BATCH_PDF_OUTPUT` são recusados para não sobrescrever arquivos existentes. Nenhum PDF real deve entrar nesse ambiente.

Testes aprovados verificam o protótipo em desenvolvimento; não homologam o modelo da escola, não validam titularidade do primeiro acesso nem liberam autenticação/emissão em produção.
