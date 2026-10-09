# Plano de trabalho e organização do Trello

Base: 09/10/2026. Equipe: TH (Tacyo) e Erick. Repositório inspecionado: `3fb180cf9bdbc279d389fb34f835af862ef11f81`, árvore inicialmente limpa. Esta entrega organiza o trabalho; não implementa CI, Docker nem libera produção.

## Onde acompanhar

O tracker escolhido é o [Trello ETE CONECTADA](https://trello.com/b/gOjNklJZ/ete-conectada). Na carga inicial, todos os cards foram para PRODUCT BACKLOG. Por novo pedido de TH em 09/10, os 25 históricos FEITO DEV foram destinados a **CONCLUÍDO** e os 86 itens futuros a **A FAZER**. Os cinco cards explicativos existentes são preservados. O guia EC-000 foi encontrado arquivado antes desta reorganização e permanece como referência arquivada, sem criar duplicata.

`backlog.md`, `cards.json` e `cards.csv` são a cópia revisável desta carga inicial, não trackers concorrentes. Após a carga, acompanhar andamento no Trello; atualizar/exportar a base quando necessário. `trello-publicacao.json` registra os cards realmente criados e suas URLs. Não há importador CSV implementado nem promessa de importação nativa do Trello: o CSV serve para consulta e transporte por ferramenta compatível.

Inventário: [o que existe e o que falta](../docs/planejamento/inventario.md). Cada ID EC corresponde a um card; `backlog.md` contém o índice e os critérios completos. Não foi criado `todo.md`, pois o tracker é o Trello.

## Como interpretar os cards

- **FEITO DEV:** código ou documentação presentes no snapshot. Não significa homologado, publicado ou revalidado por testes nesta entrega. Conferir evidência e ressalvas em cada card.
- **A FAZER:** necessidade técnica identificada e ainda sem implementação.
- **DEPENDE DA ESCOLA:** requer regra/dado/aprovação externa. O dono acompanha a decisão; não inventa a resposta.
- **FUTURO — DESCOBERTA / FUTURO CONDICIONAL:** visão citada no chat ou consequência técnica condicionada à aprovação. Refinar antes de implementar.
- **P0:** condição que bloqueia liberação oficial/segura do escopo relacionado; não significa começar tudo agora. **P1:** base e consolidação próximas. **P2:** expansão depois do MVP.
- **S/M:** tamanho inicial de escopo, não estimativa de horas. Se a implementação exceder uma sessão focada ou envolver subsistemas independentes, subdividir. Cards de descoberta produzem requisitos, não uma feature completa.

A lista cobre as necessidades conhecidas das fontes consultadas. Não podemos fechar antecipadamente todos os cards de histórico, diploma ou módulo pedagógico sem as regras e arquivos que a escola ainda fornecerá.

## Fluxo Kanban dentro das sprints

PRODUCT BACKLOG (novas ideias/refinamento) → A FAZER → EM ANDAMENTO → FASE DE TESTE → CONCLUÍDO.

A FAZER reúne todas as pendências conhecidas por pedido da equipe. Uma sprint é apenas uma seleção dessa fila, indicada pela janela/card e capacidade; ter 86 pendências na coluna não significa assumir 86 entregas. Etiquetas: BACKLOG, A fazer, Em andamento, Em teste e Concluído, reutilizadas do quadro. Etiquetas pertencem aos cards; listas mostram o estágio e o status deve ser atualizado junto ao movimento.

No fluxo atual de cinco listas, **EM ANDAMENTO inclui a revisão de PR**, indicada no título/descrição ou etiqueta. Só mover a FASE DE TESTE depois de o outro dev revisar. Se a dupla decidir criar uma coluna REVISÃO DE CÓDIGO, inserir entre andamento e teste; nenhuma coluna adicional foi imposta nesta carga.

Limite sugerido: um card de implementação ativo por pessoa, portanto dois no total. Revisar/testar antes de puxar mais trabalho. Limite de dois na fase de teste para evitar fila. Bloqueio fica visível no próprio card com motivo, dependência e próxima ação; não duplicar o mesmo card em outra lista.

Por pedido atualizado de TH, históricos FEITO DEV ficam em CONCLUÍDO preservando evidência e limitação de desenvolvimento. Não foram duplicados para deixar uma cópia no backlog. Para cards novos, concluído exige critérios e verificação cumpridos. Publicação é uma etapa separada e deve constar no card de release; concluir uma documentação não significa publicar o portal.

## Divisão da dupla e arquivos compartilhados

TH lidera inicialmente DevOps/CI/CD/infraestrutura/segurança; Erick, produto/backend/dados/interface. Ambos podem implementar em qualquer área. Os nomes dos cards são sugestões aceitas como ponto de partida, não atribuição retrospectiva de autoria. Não foram inventados membros, prazos ou horas trabalhadas.

Antes de começar: escolher um dono de execução e outro de revisão. Cada card usa uma branch curta, com o ID no nome, por exemplo `feature/ec-028-ci-build`. Se os dois precisarem trabalhar no mesmo arquivo, combinar o contrato/ordem e integrar uma mudança antes da outra; não editar simultaneamente o mesmo checkout sem coordenação. Configuração raiz, Prisma e `shared/` merecem esse acordo explícito. Não é necessário impedir que os dois aprendam ou atuem nas mesmas áreas. [Branches e colaboração](../docs/planejamento/git-e-colaboracao.md) detalha as oito branches locais de partida, PRs curtas e o modelo de passagem de contexto entre chats separados. Branches não são pastas nem cópias parciais do projeto.

Fluxo diário: atualizar a base de main → branch do card → implementar uma fatia → teste pertinente → commit → PR → revisão cruzada → teste/homologação → merge → release conforme gates. Commit e push são etapas distintas. O autor não aprova a própria mudança como substituição da revisão humana.

## Definition of Ready

Um card entra na sprint quando tem resultado claro, critérios observáveis, dependências disponíveis, dados sintéticos para teste e dono/revisor. Pendência institucional pode entrar como tarefa de levantamento com entrega verificável (obter decisão), mas não como implementação com regra presumida. A dupla estima o escopo e disponibilidade antes de assumir a sprint.

## Definition of Done

- Critérios do card atendidos e evidências anexadas sem dados pessoais/segredos.
- Testes proporcionais executados; correção de bug inclui regressão quando pertinente; ambos os apps compilam quando alteração afeta compartilhados.
- PR revisada pelo outro dev, checagens pertinentes verdes e documentação operacional atualizada.
- Para acesso/dados: autorização no servidor, caminhos negativos e privacidade conferidos.
- Para interface: celular/desktop, teclado, foco, rótulos e estados pertinentes avaliados; respeitar pedido específico de verificação por código quando houver e registrar a limitação.
- Nenhuma produção liberada sem as decisões institucionais; release exige homologação, monitoramento e plano de recuperação.

## Cadência inicial sugerida

Sprints de uma semana são uma proposta para testar a rotina, com planejamento curto, atualização diária assíncrona e revisão/retrospectiva ao fim. Sem disponibilidade informada, não há datas prometidas. Reservar cerca de um quarto da capacidade para revisão, bugs e aprendizado; ajustar depois da primeira semana. Não usar story points para comparar produtividade entre os dois.

**Sprint 0 — organizar e criar a primeira barreira de qualidade.** Seleção inicial de implementação: EC-026 (priorização), EC-027 (PR), EC-028 (CI/build), EC-030 (validações puras), EC-031 (isolamento dos testes). EC-029 (lint/tipos) entra se houver capacidade. Em paralelo, abrir os levantamentos EC-044 a EC-047 com a escola: titularidade, papéis, modelo e fontes de dados. São oportunidades, não compromisso de concluir dez cards numa semana.

**Checkpoint 0:** outro dev consegue instalar/executar comandos; build CI passa e falha quando deve; teste não pode atingir banco errado; pendências enviadas para responsável institucional por quem tiver autorização.

**Sprint 1 — testes reproduzíveis.** Escolher conforme capacidade dentre banco descartável, integração, bloqueios de produção, workflows seguros e testes de senha/declaração. Proteção de main depende de checks existentes e recursos do GitHub privado. Manter a produção bloqueada.

**Checkpoint 1:** migrações de zero e integração passam com banco sintético; nenhum job de PR recebe acesso de produção; smoke comprova bloqueios atuais. Guardar as URLs das execuções, não uma alegação genérica de sucesso.

**Sprint 2 — consolidar autorização e experiência.** Priorizar isolamento de sessão/dados, importação, E2E e acessibilidade. Quando a escola responder, puxar a próxima fatia de regras/dados do MVP. Refazer a seleção ao fim de cada sprint.

**Checkpoint do MVP:** instituição valida titularidade/recuperação, papéis, dados vigentes, modelo/signatários, e-mail e privacidade; testes e revisão de segurança concluem; restauração/rollback demonstrados; homologação de produção passa. Só então liberar login/cadastro e emissão oficial.

**Expansão conforme prioridade da escola:** refinar subsequente, retirada/correções, QR e assinatura eletrônica conforme prioridade aprovada; subsequente pode ser antecipado após regras/dados disponíveis, sem obrigação de seguir numeração ou ordem fixa dos cards. Histórico/SISTEC/diploma e módulo pedagógico começam por descoberta. Outros projetos mantêm repositório/login/deploy próprios; integração futura somente via API autorizada.

## CI/CD e DevSecOps planejados

CI verifica a mudança em cada PR: instalação determinística, tipos/lint, testes puros, migrações e integração em PostgreSQL descartável, build dos dois apps e análise de segurança adequada. O job de integração atual precisa iniciar `npm run dev:portal`, pois `next start` usa produção e as APIs de acesso permanecem desabilitadas nesse ambiente. Um job separado faz smoke do build de produção para comprovar esse bloqueio. Quando acesso oficial for habilitado, acrescentar jornadas sob build de produção em homologação.

CD vem depois: construir artefato por commit/digest, testar em homologação, aprovar promoção, aplicar migrações com recuperação planejada e verificar saúde. Rollback de imagem não reverte automaticamente o banco. Seed, importação e concessão de papel não pertencem ao deploy rotineiro.

Separar jobs de PR e deploy, limitar permissões e fixar actions por SHA verificado segue a [orientação oficial de segurança do GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use). Banco descartável pode usar [PostgreSQL como service container](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers). O desenho Docker/proxy deve ser refinado com o guia de [self-hosting do Next.js](https://nextjs.org/docs/app/guides/self-hosting). Ferramentas como CodeQL e proteção de ambiente dependem da disponibilidade/plano do repositório privado; não foram configuradas nesta entrega.

## Medir para ajustar

Acompanhar cards terminados por sprint, tempo entre início e conclusão, tempo bloqueado, bugs encontrados após merge e falhas de deploy/restauração. Começar com datas do próprio Trello e uma revisão semanal; nenhum dashboard adicional é necessário agora. Limitar trabalho ativo e reduzir retrabalho vale mais que encher a sprint.

## Limitações e verificação desta carga

Conversa compartilhada lida no navegador, código e sete commits locais inspecionados, quadro/listas/cards existentes lidos pelo conector. GitHub privado não acessível pelo conector nem pelo Git remoto nesta sessão; igualdade com origin/main refere-se à referência local. Não consultamos o estado atual de alunos/contas no Neon.

Sem alteração de aplicação, não foram reexecutados build, testes HTTP/banco ou avaliação visual das telas. O terminal padrão usa Node 20; o projeto exige Node 24. A carga documental foi validada por IDs únicos, dependências existentes/sem ciclos, critérios preenchidos, caminhos locais, JSON/CSV e diff sem problemas de whitespace. A confirmação dos cards criados consta em `trello-publicacao.json` e na leitura final do quadro.


## Atualização da secretaria e nova organização

[Contexto sanitizado de 09/10](../docs/planejamento/contexto-secretaria-2026-10-09.md): DOCX subsequente 2026.2 recebido e diferente do integrado; validação institucional/emissão continuam pendentes. Planilha XLS legado contém somente matrícula, nome e nascimento, sem turma/modalidade/curso. Dois fluxos explícitos de importação/atualização e exportação entram em EC-105/106/107; módulos/calendário em EC-108; testes em EC-109; troca de contexto em EC-110; certificados começam por descoberta EC-111. Nenhum deles foi implementado nesta organização.

VPS planejada por TH: Hostinger KVM4 por 24 meses, ainda não contratada. EC-050/081/083 registram a escolha e tarefas restantes.

Base atual: **111 cards de trabalho**, 25 históricos para CONCLUÍDO e 86 pendências para A FAZER, além dos cinco explicativos existentes e do guia EC-000 arquivado. O registro de publicação contém a conferência efetiva do quadro. A carga inicial criou 105 cards; esta revisão acrescenta 7, atualiza o contexto de 10 e move os existentes sem duplicá-los.

Publicação Git: identidade local configurada como Tacyo Henrique, conforme pedido. Commit inicial do planejamento: `7a02860`. Consulta HTTPS ao remoto nesta revisão continua sem autenticação; branches são locais. [Script revisável de publicação](publicar-branches.sh) fica pronto para execução pela dupla após login. Nenhum push, merge ou deploy foi realizado.
