# Horários da conexão com o banco

O portal abre conexões PostgreSQL com `TimeZone=UTC`. Isso mantém o mesmo instante entre JavaScript, adapter Prisma/pg e banco, mesmo quando o servidor está em outro fuso. Datas sem horário, como nascimento e períodos letivos, continuam `DATE`. A correção não muda o calendário escolar nem o fuso usado para apresentar datas ao público.

Na reprodução com PostgreSQL em `America/Fortaleza`, os adapters instalados 7.10.0 e 7.10.1 substituíram o offset de `timestamptz` ao converter resultados. A leitura SQL ficou três horas atrás; uma escrita ORM de `Date` armazenou um instante três horas à frente. A leitura ORM da própria escrita escondia o erro. Por isso a regressão compara também o epoch SQL.

`database-config.ts` acrescenta UTC às opções de abertura de cada conexão, preservando os demais parâmetros da URI, inclusive TLS. Mantém a precedência das opções da URI sobre `PGOPTIONS` e recusa parâmetros `options` duplicados. Erros de configuração não incluem URL ou credenciais. O diagnóstico de login usa a mesma configuração. Não foi necessário alterar dependências.

## Atualização de uma instalação existente

Antes de aplicar `20261017020000_utc_authorization_cutover`, pare todos os processos antigos do portal e mantenha o banco ligado. Faça o backup operacional normal, aplique as migrações e inicie somente o código atualizado. O pool antigo não pode continuar emitindo autorizações com a interpretação anterior. Recarregar a página ou esperar o hot reload não substitui reiniciar o processo.

A migração invalida, em uma transação, sessões, links de confirmação de e-mail, links de recuperação de senha e prévias de importação anteriores. Após atualizar:

- Quem estava conectado precisa entrar novamente com a mesma senha.
- Quem tinha um link pendente precisa solicitar outro.
- Quem preparou uma importação precisa refazer a prévia antes de confirmar.

Contas, senhas, papéis, alunos, matrículas, solicitações de declaração e histórico de importação são preservados. Contas pendentes continuam pendentes. A migração não desloca timestamps históricos: não é possível deduzir apenas pelo valor se ele veio do relógio SQL ou de uma escrita do cliente anterior. Essa preservação evita corromper registros corretos e impede uma correção indiscriminada de datas.

Na demonstração local, pare `bash tasks/demo-start.sh` antes de atualizar o código. Na próxima execução, a preparação aplica migrações antes de abrir o portal. Não execute a suíte sintética contra esse banco persistente.

## Verificação

`npm run test:database-time` exige as guardas do PostgreSQL descartável. Confere a conexão real de `getDb`, opções inicialmente UTC/Fortaleza, preservação de `statement_timeout`, leitura SQL, escrita ORM, timestamp gerado pelo banco e `DATE`. As escritas são desfeitas por rollback. Participa de `test:integration`. Os unitários verificam configuração, parâmetros e erros sem dados da conexão.

Referências: [opções de conexão PostgreSQL](https://www.postgresql.org/docs/16/libpq-connect.html#LIBPQ-CONNECT-OPTIONS) e [configuração de client do node-postgres](https://node-postgres.com/apis/client).
