# Banco de dados do portal

O portal usa PostgreSQL (Neon). Configure `DATABASE_URL` em `apps/portal/.env.local` usando a connection string do Neon, depois execute na raiz:

```sh
npm install
npm run db:migrate --workspace @ete-conectada/portal
```

`db:migrate` aplica as migrações pendentes em ordem, incluindo a tabela de sessões. Para seed e testes, prepare outro PostgreSQL local descartável conforme [testes isolados](../../../docs/testes-isolados.md); esses scripts não usam o Neon configurado em `.env.local`. `db:seed` pode ser executado novamente sem duplicar os estudantes; ele cria a conta de teste ativa apenas se ela ainda não existir, preservando senhas existentes. Os três registros são inteiramente fictícios. Os CPFs foram gerados para passar no cálculo de dígitos verificadores, mas são dados sintéticos de teste.

| Matrícula sintética | CPF sintético para a segunda etapa | Nascimento | Acesso de teste                                                                        |
| ------------------- | ---------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `9900001`           | `45278196319`                      | 17/04/2008 | Primeiro acesso, se ainda não houver conta ativa                                       |
| `9900002`           | `63820517480`                      | 03/11/2007 | `aluno.teste@eteconectada.invalid` / `Teste@12345`, se a senha não tiver sido alterada |
| `9900003`           | `29471638500`                      | 26/08/2009 | Primeiro acesso, se ainda não houver conta ativa                                       |

Para experimentar o primeiro acesso dessas fixtures, o seed registra o nome
**Filiação Fictícia de Demonstração**. Não substitua essa referência por dados
reais no ambiente de testes. Reexecutar o seed preserva complementos existentes.

O seed preserva contas, senhas e estados já existentes no banco descartável; colisões com aluno ou matrícula divergente cancelam a transação. Não use CPF no primeiro formulário: use matrícula e nascimento. No modal, informe CPF válido, e-mail, senha com pelo menos 8 caracteres e confirmação. O CPF já informado permanece vinculado mesmo se o link de e-mail expirar. Login aceita CPF ou e-mail.

Para manter também um acesso fictício de secretaria, use `npm run db:demo` no banco local identificado. Preparação e credenciais iniciais estão em [acessos fixos de demonstração](../../../docs/testes-isolados.md#acessos-fixos-para-demonstração-local). O comando preserva senhas e recusa contas com papel/estado divergente.

## Importação de alunos

`students` guarda nome, nascimento, matrícula e CPF opcional. `enrollments` distingue INTEGRADO e SUBSEQUENTE, turma, série, sigla do curso e período letivo opcional. O backup fornecido não contém CPF, filiação, naturalidade nem ano/período letivo. A sigla ADM/DS é preservada sem inventar o nome oficial do curso.

Na raiz:

```sh
npm run students:import -- '/caminho/Backup.alunos.json'
```

A importação valida o arquivo inteiro antes de escrever, usa transação e identificadores únicos, não duplica alunos/matrículas e preserva registros já importados. Matrícula e identificador de origem devem continuar vinculados ao mesmo aluno; conflitos cancelam o lote inteiro. O identificador da matrícula de curso também precisa pertencer ao aluno correspondente. Não importa senhas, e-mails, permissões, fotos ou dados da gamificação. Não cria contas. O primeiro acesso fica bloqueado por padrão; a equipe autorizou explicitamente `--enable-development-registration` para testar matrícula/nascimento em desenvolvimento. A aplicação continua sem autenticação/cadastro em produção. O CPF é incluído no banco quando os dados da segunda etapa são aceitos, com validação matemática e unicidade.

A prova automática desse fluxo é `npm run test:import`, usando apenas fixtures sintéticas em [PostgreSQL descartável](../../../docs/testes-isolados.md#importação-json). Ela cobre repetição, preservação, lista branca, bloqueio padrão e rollback após falha de escrita.

## Acesso à secretaria

O papel padrão de toda conta é `student`. Somente uma conta ativa autorizada pela equipe pode receber `secretary`:

```sh
npm run access:secretary -- 'email-da-conta-autorizada'
```

O comando não cria conta nem redefine senha. O servidor consulta o papel da conta em cada requisição; esconder ou mostrar o menu não substitui autorização. O aluno apenas solicita e acompanha o atendimento; o atendimento escolar prepara o PDF, imprime e confirma quando estiver pronto para retirada. Não há emissão oficial ou assinatura eletrônica nesta etapa.

## Migrações Prisma

O schema está em `schema.prisma`. `migrations/00000000000000_existing_schema` registra as tabelas anteriores, incluindo as restrições SQL CHECK. As migrações são executadas exclusivamente pelo Prisma.

No Neon existente, essa migração inicial já foi registrada como aplicada. Não é preciso repetir esse registro. Em banco vazio, `db:migrate` cria a estrutura. Para outro banco preexistente, compare o schema antes de registrar uma baseline; não use reset nem db push para substituir dados.

Para alterações futuras, crie uma migração em uma branch Neon exclusiva de desenvolvimento, com um banco separado para shadow database, revise o SQL e aplique com `db:migrate`. Preserve os CHECKs existentes: eles não são representados integralmente pelo schema Prisma.

Comandos na raiz:

```sh
npm run db:generate --workspace @ete-conectada/portal
npm run db:validate --workspace @ete-conectada/portal
npm run db:status --workspace @ete-conectada/portal
npm run db:studio --workspace @ete-conectada/portal
npm run test:db --workspace @ete-conectada/portal
```

`test:db` exige configuração e identidade do banco descartável. Inicia seu próprio portal em loopback/porta livre, com e-mail desativado, e encerra o processo ao terminar. `TEST_BASE_URL` não é aceito. Cria um aluno sintético temporário e remove somente esse aluno ao terminar. Verifica concorrência na reivindicação, confirmação única, login CPF/e-mail, sessão e logout.

O runtime limita o pool a cinco conexões com espera de conexão de 15 segundos. Credenciais ficam exclusivamente em `.env.local`.

## Solicitações de declaração

A migração `20261003010000_declaration_requests` cria o atendimento persistido e aposenta a funcionalidade de fotos. Execute `npm run db:migrate --workspace @ete-conectada/portal` antes de iniciar o portal atualizado.

`declaration_requests` vincula aluno e matrícula, com status `REQUESTED`, `IN_PREPARATION` e `READY_FOR_PICKUP`. Datas/contas responsáveis registram a preparação e a liberação. Um índice parcial impede solicitações abertas duplicadas, inclusive com chamadas concorrentes. O aluno não gera PDF; o atendimento valida os dados, gera o arquivo A4 individual/lote, imprime e confirma a retirada. Baixar novamente não reabre pedidos já liberados.

Dados complementares do PDF permanecem apenas no editor; não são acrescentados ao cadastro. O modelo ainda depende da validação institucional. `test:declarations` cria e remove somente registros sintéticos para verificar permissões, concorrência, transições e impressão A4.

## Perfil removido

UI, API, modelo Prisma ativo, SDK S3 e variáveis de storage foram removidos. A tabela anterior é arquivada como `retired_profile_photos`, sem acesso pela aplicação. Fotos antigas permanecem no bucket privado, preservadas para limpeza separada se a equipe solicitar; não há upload, leitura ou exclusão de fotos no portal. Migrações já aplicadas permanecem no histórico do Prisma.

## Situação e vigência

A migração `20261013200000_enrollment_validity` acrescenta situação, período, datas e última conferência à matrícula. Vínculos antigos ficam não conferidos, sem datas inventadas. PDF e liberação exigem situação ativa, vigência e período compatíveis; o painel de conferência permanece futuro. Antes de usar o portal atualizado, aplique migrações; para contas fictícias em banco local identificado, `npm run db:demo` faz a preparação preservando senhas e conferências anteriores. Veja [Vigência das matrículas](../../../docs/vigencia-matriculas.md).

## Fonte escolar XLS

A migração `20261015150000_sheet_import` acrescenta `school_import_key` (associação da oferta/turma à pessoa), `module_number` separado da série e `sheet_import_previews` com hashes/expiração/contagens, sem arquivo bruto. As origens do importador JSON são preservadas. Cadastros/vínculos antigos não recebem associação, módulo nem mudança de situação automaticamente. Veja o [núcleo de prévia e confirmação](../../../docs/importacao-nucleo.md).

O histórico `enrollment_import_history` preserva versões acadêmicas substituídas pela confirmação de XLS, na mesma transação. A migração aditiva não fabrica versões de matrículas antigas. Consulta e limites estão no [núcleo de importação](../../../docs/importacao-nucleo.md#histórico-das-alterações-escolares).
