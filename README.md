# ETE CONECTADA

Protótipo inicial com duas aplicações no mesmo repositório:

- `apps/site`: site público da ETE Advogado José David Gil Rodrigues.
- `apps/portal`: portal autenticado da escola, com primeiro acesso e solicitações de declaração.

`shared/` contém estilos, fontes, arte institucional e navegação usados pelas duas aplicações; faz parte do código necessário para executá-las. `.nvmrc` indica Node.js 24 para padronizar o ambiente. `package.json` define dependências/comandos e `package-lock.json` fixa as versões instaladas.

## Estado atual

Este projeto está em desenvolvimento. Cadastro, login e sessões estão desabilitados em produção. O modelo de declaração precisa de validação da escola/GRE antes da emissão oficial; assinatura eletrônica e consulta por QR Code ainda não estão implementadas.

## Colaboração e próximos passos

O andamento é acompanhado no [Trello ETE CONECTADA](https://trello.com/b/gOjNklJZ/ete-conectada): Product Backlog guarda planejamento e dependências; A Fazer contém apenas a seleção pronta da sprint; Em Andamento inclui desenvolvimento/revisão; Fase de Teste verifica critérios; Concluído guarda entregas verificadas e registros históricos FEITO DEV. Estes registros de desenvolvimento não representam produção homologada.

TH e Erick podem atuar em todas as áreas, com um dono por card e revisão do outro dev. Preferir branches curtas por card, PRs pequenas e testes pertinentes antes do merge em main. Combinar mudanças em Prisma/migrações, configurações raiz e componentes compartilhados. Push de uma branch não realiza merge ou deploy.

O [guia de contribuição](docs/contribuicao.md) reúne os comandos de branch, publicação e revisão. Use o [template de PR](.github/PULL_REQUEST_TEMPLATE.md) para registrar problema, solução, verificações e link do card.

A primeira seleção prioriza proteger os testes contra o banco errado e verificar a demonstração de solicitação/atendimento de declaração com contas sintéticas. Fluxo de PR, CI de build e testes puros entram na sequência conforme capacidade e dependências. GitHub Actions, Docker, CD e liberação de produção ainda não estão implementados. A escolha planejada da equipe é VPS Hostinger KVM4 por 24 meses, ainda não contratada.

Importação/atualização por planilha terá dois caminhos, integrado e subsequente; exportação e configuração de módulos dependem de contrato/dados aprovados. O importador existente lê backup JSON, não aceita o XLS recebido e não atualiza registros existentes. Certificados, histórico e diploma precisam de requisitos próprios; não são funcionalidades prontas.

## Rodar localmente

Use Node.js 24 LTS (`.nvmrc`). Instale as dependências pelo lockfile com `npm ci` e abra dois terminais:

```bash
npm run dev:site
npm run dev:portal
```

O site abre em `http://localhost:3000` e o portal em `http://localhost:3001/login`. Para acessar de outro aparelho na mesma rede, defina `NEXT_PUBLIC_LAN_HOST` com o IP desta máquina em `apps/site/.env.local` e `apps/portal/.env.local` (ex.: `192.168.1.120`) e reinicie os dois servidores. Em desenvolvimento, após carregar a página, os links entre as aplicações preservam o host usado no navegador e mudam apenas a porta (3000/3001); NEXT_PUBLIC_LAN_HOST fornece o endereço inicial e a configuração de acesso local. As chamadas da API usam o host da própria página. “Acessar portal” aponta para `/`: com sessão abre a página inicial; sem sessão redireciona para login. Uma sessão válida também redireciona `/login` para `/`. Após entrar com uma conta de teste, a página inicial privada abre em `/`.

## Banco Neon e acessos de teste

Crie uma branch de desenvolvimento no Neon e copie `apps/portal/.env.example` para `apps/portal/.env.local`. Coloque a connection string em `DATABASE_URL`. O acesso usa Prisma 7 com o adaptador PostgreSQL. Para migrações, `DIRECT_URL` pode conter a conexão direta do Neon; se omitida, usa `DATABASE_URL`. Depois rode:

```bash
npm run db:migrate --workspace @ete-conectada/portal
```

O seed e os testes agora exigem PostgreSQL local descartável com opt-in e identidade conferida; não executam no Neon da escola. Veja a preparação em [Testes isolados](docs/testes-isolados.md). Os três alunos sintéticos, matrícula, CPF e nascimento para testar estão em [apps/portal/prisma/README.md](apps/portal/prisma/README.md). Em banco novo, dois ficam sem conta e um recebe uma conta ativa para testar o login; reexecutar o seed preserva contas e senhas existentes. Cadastro e login consultam o banco pelo servidor. Sem `DATABASE_URL`, o formulário informa que a consulta está indisponível.

O envio do link de confirmação exige `RESEND_API_KEY` e `EMAIL_FROM`. Em desenvolvimento, sem provedor de e-mail, o link é mostrado na tela para testar a ativação no banco. Esse modo não existe em produção. O login de desenvolvimento cria uma sessão persistida no banco com cookie HTTP-only; a rota `/` consulta a sessão no servidor e o botão Sair a revoga. A declaração de vínculo já está no menu; histórico e diploma continuam informativos. A equipe confirmou matrícula/nascimento no primeiro acesso de desenvolvimento, CPF no modal e confirmação de e-mail. Esse fluxo não comprova titularidade por si só; a implantação em produção continua pendente da definição de proteção e recuperação com a escola.

Fechar a segunda etapa antes de enviar os dados não cria uma conta. Se a conta estiver aguardando confirmação, o primeiro acesso permite retomar com o mesmo CPF, e-mail e senha e gerar outro link; o link anterior é invalidado. Após expirar (30 minutos), o cadastro de desenvolvimento permite escolher novos dados de acesso, mantendo o CPF já vinculado. Contas ativas continuam usando o login. `npm run test:registration` verifica esses casos com registros temporários removidos ao terminar. O teste inicia seu próprio portal em loopback/porta livre, usando o banco descartável conferido e sem provedor de e-mail. `TEST_BASE_URL` não é aceito.

## Declaração de vínculo

Os modelos A4 ficam em `output/pdf/`. A reprodução alinhada preserva a referência fornecida; a proposta com campos variáveis e duas assinaturas precisa de revisão institucional. Pesquisa, fontes legais e próximos passos estão em [docs/declaracao-vinculo/viabilidade.md](docs/declaracao-vinculo/viabilidade.md). Na página `/declaracao`, o aluno apenas solicita a declaração e acompanha o atendimento; não há download de PDF pelo aluno. O fluxo é solicitada → em preparação após geração do PDF pela secretaria → pronta para retirada após confirmação explícita de impressão, assinaturas e carimbos. Uma matrícula pode ter somente uma solicitação aberta; clicar novamente retorna o pedido existente. A área `/secretaria/declaracoes` exige o papel `secretary`; nela é possível buscar por nome/matrícula, filtrar por turma, selecionar alunos ou turma inteira e gerar um PDF de até 100 páginas (uma declaração por aluno), depois de conferir todos os selecionados. A frequência é individual, com percentual de 0 a 100 e período de apuração válido; pode ser omitida para uma declaração apenas de vínculo. Nomes dos signatários podem ser preenchidos ou identificados pelo carimbo no papel. Campos preenchidos e lote ficam apenas na memória da tela, sem alterar o cadastro importado; ao sair, são perdidos. O modelo continua sujeito à validação da escola/GRE; não há documento oficialmente emitido, assinatura eletrônica ou consulta por QR code. Subsequente existe no modelo de dados e sua referência DOCX 2026.2 foi recebida; sua declaração própria ainda aguarda adequação/validação e implementação.

`npm run students:import -- /caminho/Backup.alunos.json` importa alunos pela matrícula com acesso bloqueado por padrão. A liberação em desenvolvimento foi autorizada para este teste. O backup e dados pessoais permanecem fora do repositório. Para atribuir secretaria a uma conta ativa autorizada, use `npm run access:secretary -- email-da-conta`.

No ambiente descartável preparado, `npm run test:declarations` inicia um portal temporário e verifica autorização, isolamento, campos obrigatórios, frequência, seleção por turma, limites/duplicação do lote e PDF com registros fictícios temporários removidos ao terminar. Não usa dados dos alunos importados. O exemplo em `output/pdf/declaracao-vinculo-exemplo-integrado.pdf` também é inteiramente fictício.

## Verificações disponíveis

```bash
npm run build
npm run test:guards
# Após preparar o banco descartável conforme docs/testes-isolados.md:
npm run test:registration
npm run test:declarations
npm run test:db --workspace @ete-conectada/portal
```

O build verifica os dois apps. `test:guards` verifica as recusas de configuração e identidade sem banco. Seed e testes HTTP exigem `TEST_DATABASE_URL`, `TEST_DATABASE_NAME`, `TEST_DATABASE_ID`, `ALLOW_TEST_DATABASE_WRITES=true` e `NODE_ENV=test` ou `development`. Conferem o marcador real antes de escrever, sem usar `DATABASE_URL` como fallback. Os testes HTTP iniciam e encerram seu próprio portal; a limpeza remove somente fixtures criadas pela execução. Execute-os em sequência, sem outro Next ativo na mesma pasta. O teste de declarações salva PDFs fictícios em um diretório temporário novo, informado no terminal. Ainda não há CI, lint ou comando dedicado de typecheck. Não declarar testes como aprovados sem executar e registrar resultado.

## Prisma

O modelo está em `apps/portal/prisma/schema.prisma`; as consultas usam `getDb()` em `apps/portal/src/lib/db.ts`. Exemplo: `getDb().student.findUnique({ where: { cpf } })`. Os campos TypeScript usam camelCase, mapeados para os nomes existentes no PostgreSQL.

`npm run dev:portal` e `npm run build` geram o cliente automaticamente. `npm run test:db --workspace @ete-conectada/portal` testa o fluxo com um aluno sintético temporário e o remove ao terminar. Ele exige o banco descartável e inicia seu próprio portal, conforme [testes isolados](docs/testes-isolados.md).

Consulte `apps/portal/prisma/README.md` para migrações, seed e Prisma Studio.

## Arquivos locais e publicação

Não envie `.env.local`, credenciais, backups de alunos, reuniões, dependências ou arquivos gerados do Next.js/Prisma. O `.gitignore` mantém esses itens fora do histórico. Os arquivos `.env.example` contêm somente exemplos de configuração.

Em `output/pdf`, somente os arquivos de referência/revisão e o exemplo fictício listados no `.gitignore` podem ser versionados. Declarações preenchidas com dados reais devem permanecer fora do repositório.

Planejamento de sprint, backlog, instruções locais de agentes, `DESIGN.md` e `premium-ui.json` ficam fora do rastreamento desta versão. Os dois últimos guardam contexto visual/configuração de auditoria local e não são dependências da aplicação. O Trello acompanha a execução da dupla; README e documentação técnica de uso permanecem versionados. Não ignore todos os arquivos `.md`, pois documentação técnica também faz parte do projeto.
