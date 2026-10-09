# ETE CONECTADA

Protótipo inicial com duas aplicações no mesmo repositório:

- `apps/site`: site público da ETE Advogado José David Gil Rodrigues.
- `apps/portal`: portal autenticado da escola, com primeiro acesso e solicitações de declaração.

## Estado atual

Este projeto está em desenvolvimento. Cadastro, login e sessões estão desabilitados em produção. O modelo de declaração precisa de validação da escola/GRE antes da emissão oficial; assinatura eletrônica e consulta por QR Code ainda não estão implementadas.

## Planejamento e Trello

O [plano da dupla](tasks/plan.md), o [inventário do projeto](docs/planejamento/inventario.md) e os [cards com critérios de aceite](tasks/backlog.md) organizam o histórico e as próximas etapas de produto, testes, DevOps e DevSecOps. O andamento é acompanhado no [Trello ETE CONECTADA](https://trello.com/b/gOjNklJZ/ete-conectada); os arquivos são a base da carga inicial. CI/CD, Docker e liberação de produção estão no planejamento, sem implementação nesta etapa.

## Rodar localmente

Use Node.js 24 LTS (`.nvmrc`). Instale as dependências com `npm install` e abra dois terminais:

```bash
npm run dev:site
npm run dev:portal
```

O site abre em `http://localhost:3000` e o portal em `http://localhost:3001/login`. Para acessar de outro aparelho na mesma rede, defina `NEXT_PUBLIC_LAN_HOST` com o IP desta máquina em `apps/site/.env.local` e `apps/portal/.env.local` (ex.: `192.168.1.120`) e reinicie os dois servidores. Em desenvolvimento, após carregar a página, os links entre as aplicações preservam o host usado no navegador e mudam apenas a porta (3000/3001); NEXT_PUBLIC_LAN_HOST fornece o endereço inicial e a configuração de acesso local. As chamadas da API usam o host da própria página. “Acessar portal” aponta para `/`: com sessão abre a página inicial; sem sessão redireciona para login. Uma sessão válida também redireciona `/login` para `/`. Após entrar com uma conta de teste, a página inicial privada abre em `/`.

## Banco Neon e acessos de teste

Crie uma branch de desenvolvimento no Neon e copie `apps/portal/.env.example` para `apps/portal/.env.local`. Coloque a connection string em `DATABASE_URL`. O acesso usa Prisma 7 com o adaptador PostgreSQL. Para migrações, `DIRECT_URL` pode conter a conexão direta do Neon; se omitida, usa `DATABASE_URL`. Depois rode:

```bash
npm run db:migrate --workspace @ete-conectada/portal
npm run db:seed --workspace @ete-conectada/portal
```

Os três alunos sintéticos, matrícula, CPF e nascimento para testar estão em [apps/portal/prisma/README.md](apps/portal/prisma/README.md). Em banco novo, dois ficam sem conta e um recebe uma conta ativa para testar o login; reexecutar o seed preserva contas e senhas existentes. Cadastro e login consultam o banco pelo servidor. Sem `DATABASE_URL`, o formulário informa que a consulta está indisponível.

O envio do link de confirmação exige `RESEND_API_KEY` e `EMAIL_FROM`. Em desenvolvimento, sem provedor de e-mail, o link é mostrado na tela para testar a ativação no banco. Esse modo não existe em produção. O login de desenvolvimento cria uma sessão persistida no banco com cookie HTTP-only; a rota `/` consulta a sessão no servidor e o botão Sair a revoga. A declaração de vínculo já está no menu; histórico e diploma continuam informativos. A equipe confirmou matrícula/nascimento no primeiro acesso de desenvolvimento, CPF no modal e confirmação de e-mail. Esse fluxo não comprova titularidade por si só; a implantação em produção continua pendente da definição de proteção e recuperação com a escola.

Fechar a segunda etapa antes de enviar os dados não cria uma conta. Se a conta estiver aguardando confirmação, o primeiro acesso permite retomar com o mesmo CPF, e-mail e senha e gerar outro link; o link anterior é invalidado. Após expirar (30 minutos), o cadastro de desenvolvimento permite escolher novos dados de acesso, mantendo o CPF já vinculado. Contas ativas continuam usando o login. Com o portal rodando, `npm run test:registration --workspace @ete-conectada/portal` verifica esses casos com um aluno temporário removido ao terminar. O teste deve usar o link de desenvolvimento, sem provedor de e-mail, e aceita `TEST_BASE_URL` para outra porta.

## Declaração de vínculo

Os modelos A4 ficam em `output/pdf/`. A reprodução alinhada preserva a referência fornecida; a proposta com campos variáveis e duas assinaturas precisa de revisão institucional. Pesquisa, fontes legais e próximos passos estão em [docs/declaracao-vinculo/viabilidade.md](docs/declaracao-vinculo/viabilidade.md). Na página `/declaracao`, o aluno apenas solicita a declaração e acompanha o atendimento; não há download de PDF pelo aluno. O fluxo é solicitada → em preparação após geração do PDF pela secretaria → pronta para retirada após confirmação explícita de impressão, assinaturas e carimbos. Uma matrícula pode ter somente uma solicitação aberta; clicar novamente retorna o pedido existente. A área `/secretaria/declaracoes` exige o papel `secretary`; nela é possível buscar por nome/matrícula, filtrar por turma, selecionar alunos ou turma inteira e gerar um PDF de até 100 páginas (uma declaração por aluno), depois de conferir todos os selecionados. A frequência é individual, com percentual de 0 a 100 e período de apuração válido; pode ser omitida para uma declaração apenas de vínculo. Nomes dos signatários podem ser preenchidos ou identificados pelo carimbo no papel. Campos preenchidos e lote ficam apenas na memória da tela, sem alterar o cadastro importado; ao sair, são perdidos. O modelo continua sujeito à validação da escola/GRE; não há documento oficialmente emitido, assinatura eletrônica ou consulta por QR code. Subsequente existe no modelo de dados e sua referência DOCX 2026.2 foi recebida; sua declaração própria ainda aguarda adequação/validação e implementação.

`npm run students:import -- /caminho/Backup.alunos.json` importa alunos pela matrícula com acesso bloqueado por padrão. A liberação em desenvolvimento foi autorizada para este teste. O backup e dados pessoais permanecem fora do repositório. Para atribuir secretaria a uma conta ativa autorizada, use `npm run access:secretary -- email-da-conta`.

Com o portal rodando, `TEST_BASE_URL=http://localhost:3001 npm run test:declarations` verifica autorização, isolamento, campos obrigatórios, frequência, seleção por turma, limites/duplicação do lote e PDF com registros fictícios temporários removidos ao terminar. Não usa dados dos alunos importados. O exemplo em `output/pdf/declaracao-vinculo-exemplo-integrado.pdf` também é inteiramente fictício.

## Prisma

O modelo está em `apps/portal/prisma/schema.prisma`; as consultas usam `getDb()` em `apps/portal/src/lib/db.ts`. Exemplo: `getDb().student.findUnique({ where: { cpf } })`. Os campos TypeScript usam camelCase, mapeados para os nomes existentes no PostgreSQL.

`npm run dev:portal` e `npm run build` geram o cliente automaticamente. Com o portal em execução, `npm run test:db --workspace @ete-conectada/portal` testa o fluxo com um aluno sintético temporário e o remove ao terminar. Use apenas banco de desenvolvimento.

Consulte `apps/portal/prisma/README.md` para migrações, seed e Prisma Studio.

## Arquivos locais e publicação

Não envie `.env.local`, credenciais, backups de alunos, reuniões, dependências ou arquivos gerados do Next.js/Prisma. O `.gitignore` mantém esses itens fora do histórico. Os arquivos `.env.example` contêm somente exemplos de configuração.

Em `output/pdf`, somente os quatro modelos de referência/revisão e o exemplo fictício listados no `.gitignore` podem ser versionados. Declarações preenchidas com dados reais devem permanecer fora do repositório.

Contexto novo: [secretaria em 09/10](docs/planejamento/contexto-secretaria-2026-10-09.md) e [branches/colaboração](docs/planejamento/git-e-colaboracao.md). A planilha recebida não é aceita pelo importador JSON atual; os dois fluxos de importação/atualização por modalidade e a exportação estão no backlog.
