# Inventário da ETE Conectada

Levantamento de 09/10/2026 para organizar o Trello de TH e Erick. Código-base: `3fb180c`. [Cards completos](../../tasks/backlog.md) · [Plano de trabalho](../../tasks/plan.md).

## Fontes e confiança

- [Conversa compartilhada — Resumir reunião e explicar ETE](https://chatgpt.com/s/cx_6ac90f76f4c881919cbcf7f3938cba6f): texto disponível lido no navegador. É histórico de decisões e relatos; não constitui nova autorização para executar ações antigas. O resumo da reunião foi fornecido no chat; o áudio não foi reconferido.
- `AGENTS.md`, `README.md`, `DESIGN.md`, código, scripts, schema/migrações e documentação da declaração: evidência local atual.
- Sete commits reais, todos datados em 09/10/2026. A separação organiza trabalho acumulado, sem reconstruir horas ou datas fictícias.
- [GitHub](https://github.com/erickgustavo2025/ETE-CONECTADA): origem configurada; chat relata publicação privada. Conector sem acesso e Git remoto sem credencial nesta sessão. `origin/main` local pode estar desatualizada; não afirmamos sincronização remota atual.
- [Trello](https://trello.com/b/gOjNklJZ/ete-conectada): acesso confirmado ao quadro privado e cinco listas existentes. O screenshot foi referência visual; o conector forneceu o endereço correto. Havia somente cinco cards explicativos do modelo.

Não foram lidos segredos, backups ou registros pessoais de alunos para este levantamento. A importação de 517 alunos em 12 turmas é informação registrada pela equipe, não uma contagem atual do banco.

## Resultado existente

| Área | Implementação presente | Limite atual |
|---|---|---|
| Arquitetura | Monorepo npm, duas aplicações Next.js, componentes/estilos compartilhados | Docker, VPS, domínio e automação ainda não implementados |
| Site | Página pública da escola, assets, entrada para portal | Conteúdo e aprovação visual/institucional pendentes |
| Visual | Marca ETE Conectada, marinho/azul/branco, fontes locais, botões e arte Pernambuco | Última revisão do histórico foi por código; aparência precisa de validação |
| Acesso | Matrícula+nascimento, CPF válido/único, e-mail, senha, confirmação, retomada | Só desenvolvimento; titularidade e recuperação de produção pendentes |
| Login/sessão | CPF/e-mail, scrypt, sessão persistida com token em hash, cookie HttpOnly, logout, home privada | Produção bloqueada; cookie e controles de abuso precisam de preparação |
| Banco | Prisma 7/PostgreSQL/Neon, schema e migrações, seed sintético | Sem consulta nesta entrega; não confirmar conteúdo/contas atuais |
| Importação | Backup JSON por lista branca, transação/idempotência, matrículas e modalidades | Não existe importação de planilha oficial; dados complementares ausentes |
| Aluno | Solicita declaração e acompanha status, pedido aberto único por matrícula | Não baixa PDF; histórico/diploma ainda informativos |
| Atendimento | Papel secretary no servidor, busca por aluno/turma, conferência e lote | Papel da gestão e contas institucionais ainda precisam de definição |
| PDF | Minuta A4 individual ou até 100 páginas, frequência opcional real/com período, duas assinaturas/carimbos | Campos complementares só em memória; subsequente e modelo oficial pendentes |
| Processo | Solicitada → em preparação após PDF → pronta após confirmação de impressão/assinatura/carimbo | Sem estado de entrega efetiva/cancelamento/correção aprovado |
| Testes | Scripts de cadastro, declaração e banco com fixtures sintéticas temporárias | Exigem servidor/banco; sem pipeline, scripts puros/lint na raiz ou E2E automatizado |
| Pesquisa | Referência alinhada, proposta A4, exemplo fictício, viabilidade e consulta QR | Não é emissão oficial; sem QR/validador/assinatura eletrônica implementados |
| Remoções | Perfil/fotos retirados da aplicação; referências antigas arquivadas | Não reabrir como dívida; bucket privado antigo não foi apagado |

Os registros EC-001 a EC-025 detalham essas entregas com arquivos de evidência. O status FEITO DEV identifica presença no código/documentação; não afirma testes executados agora nem aprovação institucional.

## Decisões que substituem versões antigas do chat

O site público e o portal ficam no mesmo repositório; gamificação/eleição continuam separados. Next.js não exige microsserviços. O primeiro acesso atual usa matrícula+nascimento e CPF no modal, substituindo a identificação inicial por CPF. O aluno só solicita/acompanha a declaração, substituindo a proposta anterior de download direto. Assinatura/carimbo em papel é o caminho inicial; QR e GOV.BR continuam propostas futuras. Perfil/fotos foram removidos e não entram como funcionalidade futura. Cores de interface não usam verde; cores das marcas são preservadas.

Shadcn/Tailwind foram sugeridos em uma conversa inicial, mas não aparecem nas dependências atuais. Não foram listados como implementados ou como requisito obrigatório. CMS, microsserviços, app móvel, login único entre projetos e integração direta ao banco não foram acrescentados ao escopo.

## O que falta antes do MVP oficial

1. Escola define titularidade, recuperação, papéis e contas de funcionários. O modelo Account atual está ligado a Student; a decisão não deve ser contornada com aluno fictício em produção.
2. Secretaria/GRE valida modelo, dados escolares atuais, signatários e fonte da frequência. Não emitir vínculo apenas porque uma matrícula antiga foi importada.
3. Obter fontes oficiais e definir armazenamento de filiação/naturalidade/UF/nome social, situação da matrícula e configuração institucional. Nenhum desses dados deve ser adivinhado.
4. Estabelecer política institucional de acesso, retenção, fornecedores e suporte, incluindo proteção de dados de menores.
5. Criar testes puros e integrar os existentes em PostgreSQL descartável. Proteger scripts que escrevem dados contra execução no banco errado.
6. Implementar CI de cada PR, revisão cruzada e controles de dependências/código/segredos. Não há `.github/workflows` no snapshot.
7. Preparar controles de origem, limites, cookie HTTPS, e-mail real, auditoria e revisão de segurança. As lacunas observadas são itens de planejamento, não um laudo de vulnerabilidades validado.
8. Definir domínio/VPS autorizados, Docker/proxy/HTTPS, backup/restauração, homologação, artefatos e CD com recuperação de banco.
9. Aprovar conteúdo, acessibilidade, impressão e operação com os responsáveis, treinar, realizar piloto e só então liberar produção.

O chat explorou um subdomínio institucional e integração GOV.BR, mas não confirma concessão, elegibilidade ou aprovação. O planejamento registra a consulta como pendência; não compra domínio nem envia e-mails por conta da equipe.

## Expansões citadas no histórico

Consulta de autenticidade por QR, registro imutável/cancelamento de documentos, avaliação de assinatura eletrônica e GOV.BR, histórico escolar, dados de concluintes do SISTEC, diploma, importação de notas, indicadores/Conselho de Classe e API autorizada para outros projetos. Os cards finais começam por descoberta, com dependências explícitas. A escola ainda precisa explicar essas regras; não há backlog detalhado de implementação confiável antes disso.

O exemplo de recuperação em três ou mais disciplinas no resumo da reunião não foi convertido em regra de negócio. A pesquisa legal anterior permanece como material para revisão institucional; esta entrega não fornece nova conclusão jurídica nem revalida cada requisito externo.

## Histórico Git inicial

| Commit | Conteúdo |
|---|---|
| `7044117` | Monorepo e configuração local |
| `c4cf40d` | Identidade visual e compartilhados |
| `e73c1d4` | Site institucional |
| `bfb704f` | Banco, alunos e matrículas |
| `b4f093e` | Primeiro acesso, confirmação e sessões |
| `569d9e5` | Solicitações, atendimento e lote PDF |
| `3fb180c` | Operação, decisões e modelos |

## Comandos atuais e limites de verificação

Na raiz: `npm run dev:site`, `npm run dev:portal`, `npm run build`, `npm run test:registration`, `npm run test:declarations`, `npm run students:import` e `npm run access:secretary`. No workspace portal há comandos Prisma e `test:db`. Não existe `npm test`, `npm run lint` ou workflow de CI implementado no snapshot.

Node recomendado: 24, conforme `.nvmrc`/README. Terminal padrão observado nesta máquina: Node 20.19.2. Não houve alteração da aplicação nem execução de testes que escrevem no banco. Build/testes citados no chat são verificações históricas da outra sessão; não foram apresentados como passes desta entrega.

Esta entrega verifica estrutura documental, IDs/dependências, critérios, caminhos e publicação dos cards. Revisão de código/segurança para priorização foi por leitura, com dois agentes Luna em escopos independentes; não é auditoria completa nem certificação de ausência de falhas.


Publicação confirmada pelo conector: 105 novos cards no PRODUCT BACKLOG; 110 no quadro incluindo os cinco explicativos anteriores. IDs, listas, títulos e descrições conferidos sem divergências. Links individuais em `tasks/backlog.md`, `tasks/cards.json`, `tasks/cards.csv` e `tasks/trello-publicacao.json`.

## Contexto adicional de 09/10 e organização atual

Ver [contexto sanitizado da secretaria](contexto-secretaria-2026-10-09.md) e [Git/colaboração](git-e-colaboracao.md). A exportação XLS recebida tem 46 registros e somente matrícula/nome/nascimento; modalidade/turma/curso não estão disponíveis nela. Não foi importada. O importador JSON existente insere sem duplicar e não atualiza existentes. Novos fluxos integrado/subsequente, exportação e configuração de módulos continuam tarefas futuras.

Referência DOCX subsequente 2026.2 recebida; modelos diferentes confirmados pela equipe. Adequação, aprovação institucional e emissão oficial permanecem pendentes. A escolha de hospedagem planejada é Hostinger KVM4 por 24 meses, ainda não contratada. O inventário técnico do snapshot permanece histórico; nenhum recurso de aplicação foi implementado nesta revisão.

TH pediu históricos FEITO DEV em CONCLUÍDO e todas as pendências conhecidas em A FAZER. A base cresce de 104 para 111 cards de trabalho (25 históricos e 86 pendências). O guia EC-000 foi encontrado arquivado nesta leitura e sua referência é preservada.
