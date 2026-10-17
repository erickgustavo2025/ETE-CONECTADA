# ETE Conectada

O ETE Conectada reúne o site institucional e o portal da ETE Advogado José David Gil Rodrigues. Pelo portal, o aluno solicita sua declaração de vínculo e acompanha o atendimento, enquanto a secretaria confere os dados e prepara o documento para retirada.

O projeto está em desenvolvimento. Cadastro e login funcionam apenas nesse ambiente; a escola e a GRE ainda precisam validar o modelo e quem assina as declarações antes da emissão oficial.

## O que já funciona

- Site institucional com acesso ao portal.
- Primeiro acesso com matrícula, nascimento e nome completo de um dos pais, cadastro de CPF, e-mail e senha, confirmação de e-mail e login.
- Recuperação de senha pelo e-mail confirmado, com encerramento das sessões anteriores.
- Solicitação de declaração pelo aluno e acompanhamento do pedido.
- Atendimento pela secretaria, com busca por aluno ou turma e geração de PDF individual ou em lote.

O código está organizado assim:

| Pasta         | Conteúdo                                                   |
| ------------- | ---------------------------------------------------------- |
| `apps/site`   | Site público da escola                                     |
| `apps/portal` | Portal dos alunos e da secretaria                          |
| `shared`      | Estilos, fontes e elementos visuais usados pelos dois apps |

As aplicações usam Next.js e TypeScript. O portal usa PostgreSQL, com Prisma para as consultas e migrações.

## Rodar localmente

Use Node.js 24, conforme a versão indicada em `.nvmrc`. Se você usa nvm, execute `nvm use` na raiz do projeto. Com o repositório clonado, instale as dependências:

```bash
npm ci --ignore-scripts
```

### Configurar o banco do portal

Use um banco de desenvolvimento. No Neon, crie uma branch própria para isso. Crie `apps/portal/.env.local` a partir de [`.env.example`](apps/portal/.env.example) e preencha `DATABASE_URL` com a conexão desse banco. `DIRECT_URL` é opcional e permite usar uma conexão direta nos comandos do Prisma.

Aplique as migrações nesse banco:

```bash
npm run db:migrate --workspace @ete-conectada/portal
```

Os comandos de desenvolvimento e build geram o cliente Prisma automaticamente. Mais detalhes sobre o banco, as migrações e o Prisma Studio estão no [guia do banco](apps/portal/prisma/README.md).

### Abrir as aplicações

Abra dois terminais na raiz do projeto:

```bash
# Terminal 1
npm run dev:site
```

```bash
# Terminal 2
npm run dev:portal
```

- Site: [localhost:3000](http://localhost:3000)
- Portal: [localhost:3001/login](http://localhost:3001/login)

Para acessar pelo celular ou por outro computador na mesma rede, configure `NEXT_PUBLIC_LAN_HOST` com o IP da sua máquina em `apps/site/.env.local` e `apps/portal/.env.local`, por exemplo `192.168.1.120`. Reinicie os servidores e abra esse endereço com a porta do app.

### Experimentar o primeiro acesso

O aluno informa matrícula, nascimento e nome completo do pai ou da mãe, conforme o registro escolar; depois, CPF, e-mail, senha e confirmação da senha. A conta é ativada pelo link de confirmação. O login aceita CPF ou e-mail.

O nome é uma conferência adicional. Se os dados estiverem ausentes ou diferentes, o aluno precisa procurar a secretaria. As regras e os limites dessa conferência estão em [Acesso e entrega de documentos](docs/acesso-e-documentos.md).

Para enviar o link por e-mail, configure `RESEND_API_KEY` e `EMAIL_FROM`. Sem essas variáveis, o link aparece na tela apenas em desenvolvimento, permitindo experimentar a ativação.

### Recuperar a senha

Use **Esqueci minha senha** no login. O link dura 30 minutos; depois da troca,
é preciso entrar novamente. Quem perdeu acesso ao e-mail deve procurar a secretaria.

O envio exige `RESEND_API_KEY`, `EMAIL_FROM` e `PORTAL_PUBLIC_URL`, a origem do
portal, como `http://localhost:3002` no desenvolvimento local. A recuperação não
mostra links de teste na tela. Sem o envio configurado, não chega e-mail; a resposta
permanece genérica para não revelar contas. As [regras de acesso](docs/acesso-e-documentos.md)
explicam os limites e a configuração. Produção continua bloqueada.

Há três alunos fictícios para os testes. A preparação do banco local descartável está no [guia de testes isolados](docs/testes-isolados.md), e as matrículas e acessos estão no [guia do banco](apps/portal/prisma/README.md). O seed e os testes usam esse banco separado, em vez do Neon configurado para a aplicação.

## Declaração de vínculo

A área da secretaria exige uma conta com esse acesso. O atendimento funciona em três etapas:

1. O aluno faz o pedido em `/declaracao` e acompanha a situação pelo portal.
2. A secretaria confere os dados em `/secretaria/declaracoes` e gera o PDF. O pedido passa para **Em preparação**.
3. Depois da impressão, das assinaturas e dos carimbos, a secretaria confirma que o documento está **Pronto para retirada**.

A liberação para retirada depende da confirmação da secretaria, depois de preparar o documento no papel. Se o aluno repetir o pedido enquanto houver uma solicitação aberta, o portal mostra a mesma solicitação.

Para gerar e liberar o documento, a matrícula precisa estar conferida pela secretaria, ativa e dentro da vigência registrada. O período do PDF deve corresponder ao cadastrado. Registros antigos começam como não conferidos; importar um aluno não confirma seu vínculo. Veja as [regras de situação e vigência](docs/vigencia-matriculas.md).

A secretaria pode gerar até 100 declarações por lote, uma por aluno. Quando incluir frequência, precisa informar o percentual e o período de apuração. Os dados complementares preenchidos no editor ficam na tela e são perdidos ao sair; eles não alteram o cadastro dos alunos.

A versão atual prepara o documento para impressão e assinatura no papel. Os [modelos e o exemplo fictício](output/pdf/) estão disponíveis para revisão. O modelo próprio do subsequente, assinatura eletrônica e consulta por QR Code ainda fazem parte do trabalho futuro. A pesquisa sobre a emissão está em [Declaração de vínculo](docs/declaracao-vinculo/viabilidade.md).

O [guia do banco](apps/portal/prisma/README.md) também explica a importação pelo backup JSON e a concessão de acesso à secretaria. O [núcleo de importação XLS](docs/importacao-nucleo.md) já valida arquivos, aplica alterações após confirmação e preserva o histórico das mudanças de matrícula pela API de desenvolvimento; a secretaria pode escolher a entrada do integrado ou do subsequente no menu do portal. Para o subsequente, cadastre antes o calendário da turma e do ingresso e confira as divergências de módulo e período na prévia.

## Verificações disponíveis

Tipos, lint e formatação: veja os comandos e o escopo no [guia de qualidade](docs/qualidade.md).

Estes comandos podem ser executados sem banco:

```bash
npm run test:unit
npm run test:guards
npm run build
npm run audit:dependencies
```

Os unitários verificam as regras do primeiro acesso, das senhas e das entradas de login/cadastro. O cliente Prisma é gerado automaticamente, sem consultar banco. As guardas verificam a recusa de configurações de teste inadequadas. O build compila os dois apps, e a auditoria aponta vulnerabilidades nas dependências. Os alertas conhecidos e sua avaliação estão na [triagem de dependências](docs/seguranca/dependencias.md).

Para testar o banco e os fluxos completos, siga primeiro a preparação do [ambiente de testes isolados](docs/testes-isolados.md):

```bash
npm run test:schema
npm run test:access-throttle
npm run test:integration
# Somente em banco novo, sem seed ou outros registros:
npm run test:cleanup
```

Os testes de integração executam importação, limites de tentativas, cadastro, recuperação de senha, declaração, sessão, bloqueios de produção e banco em sequência, com dados fictícios. Os limites e as janelas de acesso estão no [guia de tentativas de acesso](docs/seguranca/limites-acesso.md). Eles iniciam e encerram seu próprio portal; execute-os sem outro Next ativo na mesma pasta. `test:cleanup` confere se o banco novo ficou vazio.

Para testar as telas em Chromium, use `npm run test:browser` com o mesmo banco descartável. A suíte faz o primeiro acesso, retoma a confirmação, redefine a senha, entra e sai do portal e acompanha um pedido de declaração até a liberação para retirada. A instalação do navegador e os cuidados com os relatórios estão no [guia de testes de navegador](docs/testes-navegador.md). O CI também executa essa suíte.

O [GitHub Actions](.github/workflows/ci.yml) já compila os apps, aplica as migrações e executa a integração em PostgreSQL temporário. Isso acontece nos PRs para `main` e nos pushes para `main`, `feature/...` ou `codex/...`. O banco de cada execução é removido ao terminar. Os workflows também são validados antes do build. As permissões e os cuidados com PRs estão no [guia de segurança do CI](docs/seguranca/workflows.md).

O [Dependabot](.github/dependabot.yml) propõe atualizações semanais, que são revisadas antes do merge. A [auditoria de dependências](.github/workflows/dependency-audit.yml) também roda semanalmente e pode ser iniciada manualmente.

## Como colaborar

As tarefas estão no [Trello ETE CONECTADA](https://trello.com/b/gOjNklJZ/ete-conectada). Escolhemos uma tarefa por vez, trabalhamos em uma branch própria e abrimos um PR para revisão antes de integrar à `main`. Se a mudança envolver banco, dependências ou código compartilhado, combinamos os arquivos com o outro dev antes de começar.

O [guia de contribuição](docs/contribuicao.md) mostra os comandos e o processo de revisão. O [template de PR](.github/PULL_REQUEST_TEMPLATE.md) ajuda a explicar o que mudou e como foi verificado. O [guia de segurança por funcionalidade](docs/seguranca/verificacao-por-funcionalidade.md) orienta os testes de acesso e de uso indevido de cada mudança.

## O que vem depois

- Homologar com a escola as duas entradas de importação e criar a exportação. O importador de backup JSON continua separado.
- Adequar e validar os modelos de declaração com a escola.
- Definir com a escola a proteção do primeiro acesso e a recuperação de contas antes de liberar o portal em produção.
- Concluir as verificações de qualidade, a proteção da `main` e a preparação de Docker, hospedagem e publicação.
- Levantar os requisitos de certificados, histórico e diploma.

## Arquivos e dados

Configurações e credenciais ficam em `.env.local`. Backups de alunos, planilhas, documentos preenchidos com dados reais e arquivos de reunião ficam fora do Git. Em `output/pdf`, mantemos apenas as referências e o exemplo fictício permitidos pelo `.gitignore`.
