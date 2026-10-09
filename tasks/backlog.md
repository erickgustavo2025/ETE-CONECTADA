# Cards da ETE Conectada — base de 09/10/2026

104 cards: 25 registros históricos e 79 itens futuros. Todos destinados inicialmente ao PRODUCT BACKLOG, conforme pedido de TH. Ver [plano](plan.md) e [inventário](../docs/planejamento/inventario.md).

Esta lista é uma base revisável das necessidades conhecidas, não garantia de requisitos completos para todos os módulos futuros. Datas e autores históricos não foram inventados.

## Índice

| ID | Área | Estado | Prioridade | Dono sugerido | Card |
|---|---|---|---|---|---|
| EC-001 | Arquitetura | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Estruturar monorepositório Next.js com duas aplicações](#ec-001) |
| EC-002 | Gestão | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Documentar arquitetura, operação e decisões da equipe](#ec-002) |
| EC-003 | Design | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Consolidar identidade ETE/Pernambuco e estilos compartilhados](#ec-003) |
| EC-004 | Site | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Criar site institucional público](#ec-004) |
| EC-005 | Site | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Corrigir navegação entre aplicações e acesso pela rede local](#ec-005) |
| EC-006 | Dados | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Integrar Prisma 7 com PostgreSQL/Neon](#ec-006) |
| EC-007 | Dados | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Versionar migrações de alunos, acesso e solicitações](#ec-007) |
| EC-008 | Testes | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Preparar seed de três alunos sintéticos](#ec-008) |
| EC-009 | Dados | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Implementar importação por lista branca e matrícula](#ec-009) |
| EC-010 | Acesso | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Implementar primeiro acesso com matrícula e nascimento](#ec-010) |
| EC-011 | Acesso | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Validar CPF e credenciais na criação de conta](#ec-011) |
| EC-012 | Segurança | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Armazenar senhas com scrypt](#ec-012) |
| EC-013 | Acesso | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Confirmar e-mail com token de uso único](#ec-013) |
| EC-014 | Acesso | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Corrigir retomada de cadastro pendente](#ec-014) |
| EC-015 | Acesso | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Implementar login por CPF ou e-mail em desenvolvimento](#ec-015) |
| EC-016 | Segurança | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Persistir sessões e revogá-las no logout](#ec-016) |
| EC-017 | Portal | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Proteger página inicial e apresentar menu de serviços](#ec-017) |
| EC-018 | Desempenho | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Reduzir consultas de sessão e diagnosticar login](#ec-018) |
| EC-019 | Declarações | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Persistir pedido de declaração e acompanhamento pelo aluno](#ec-019) |
| EC-020 | Declarações | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Criar atendimento protegido pelo papel secretary](#ec-020) |
| EC-021 | Declarações | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Gerar minuta A4 individual e em lotes de até 100](#ec-021) |
| EC-022 | Declarações | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Separar geração do PDF e liberação para retirada](#ec-022) |
| EC-023 | Portal | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Remover perfil e fotos do front e backend ativos](#ec-023) |
| EC-024 | Pesquisa | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Preparar modelos e pesquisas de declaração/QR](#ec-024) |
| EC-025 | Gestão | FEITO DEV | Histórico | Não atribuído retrospectivamente | [Organizar trabalho acumulado em sete commits](#ec-025) |
| EC-026 | Gestão | A FAZER | P1 | TH + Erick | [Revisar inventário e priorizar primeira sprint](#ec-026) |
| EC-027 | Gestão | A FAZER | P1 | TH | [Definir padrão de branch e pull request por card](#ec-027) |
| EC-028 | CI/CD | A FAZER | P1 | TH | [Criar CI de instalação e build dos dois workspaces](#ec-028) |
| EC-029 | CI/CD | A FAZER | P1 | TH | [Adicionar comandos de tipos, lint e formatação](#ec-029) |
| EC-030 | Testes | A FAZER | P1 | Erick | [Cobrir validações puras de primeiro acesso](#ec-030) |
| EC-031 | Testes | A FAZER | P0 | Erick | [Impedir testes e seeds no banco errado](#ec-031) |
| EC-032 | CI/CD | A FAZER | P1 | TH | [Criar PostgreSQL descartável e aplicar migrações no CI](#ec-032) |
| EC-033 | CI/CD | A FAZER | P1 | TH | [Automatizar testes existentes de cadastro e declaração](#ec-033) |
| EC-034 | Gestão | A FAZER | P1 | TH | [Proteger main com revisão e checks obrigatórios](#ec-034) |
| EC-035 | Testes | A FAZER | P1 | Erick | [Cobrir senha e hash malformado com testes puros](#ec-035) |
| EC-036 | Testes | A FAZER | P1 | Erick | [Cobrir campos e frequência da declaração em testes puros](#ec-036) |
| EC-037 | Testes | A FAZER | P1 | Erick | [Cobrir importação idempotente e rollback](#ec-037) |
| EC-038 | Testes | A FAZER | P0 | Erick | [Ampliar regressão de sessão e autorização](#ec-038) |
| EC-039 | Testes | A FAZER | P1 | Erick | [Criar testes de navegador das jornadas principais](#ec-039) |
| EC-040 | Testes | A FAZER | P0 | TH | [Testar bloqueios atuais em build de produção](#ec-040) |
| EC-041 | Segurança | A FAZER | P1 | TH | [Definir triagem de dependências e automatizar alertas](#ec-041) |
| EC-042 | Segurança | A FAZER | P1 | TH | [Adicionar análise de código e segredos ao CI](#ec-042) |
| EC-043 | Segurança | A FAZER | P0 | TH | [Revisar segurança dos workflows](#ec-043) |
| EC-044 | Acesso | DEPENDE DA ESCOLA | P0 | Erick | [Definir titularidade e recuperação com a escola](#ec-044) |
| EC-045 | Acesso | DEPENDE DA ESCOLA | P0 | Erick | [Confirmar papéis de secretaria e gestão](#ec-045) |
| EC-046 | Declarações | DEPENDE DA ESCOLA | P0 | Erick | [Validar modelo e signatários da declaração](#ec-046) |
| EC-047 | Dados | DEPENDE DA ESCOLA | P0 | Erick | [Obter dicionário e exportação autorizada de dados escolares](#ec-047) |
| EC-048 | Declarações | DEPENDE DA ESCOLA | P0 | Erick | [Confirmar finalidade e fonte da frequência](#ec-048) |
| EC-049 | Segurança | DEPENDE DA ESCOLA | P0 | TH | [Definir política de acesso, retenção e suporte a dados pessoais](#ec-049) |
| EC-050 | Infraestrutura | DEPENDE DA ESCOLA | P0 | TH | [Confirmar domínio, hospedagem e responsável institucional](#ec-050) |
| EC-051 | Acesso | DEPENDE DA ESCOLA | P0 | Erick | [Definir contas de servidores e revogação de privilégios](#ec-051) |
| EC-052 | Dados | A FAZER | P1 | Erick | [Persistir dados complementares aprovados do aluno](#ec-052) |
| EC-053 | Dados | A FAZER | P0 | Erick | [Registrar situação e vigência da matrícula](#ec-053) |
| EC-054 | Declarações | A FAZER | P0 | Erick | [Cadastrar configuração institucional aprovada](#ec-054) |
| EC-055 | Dados | A FAZER | P1 | Erick | [Especificar importação de planilha oficial da secretaria](#ec-055) |
| EC-056 | Dados | A FAZER | P1 | Erick | [Implementar prévia e importação da planilha aprovada](#ec-056) |
| EC-057 | Dados | A FAZER | P1 | Erick | [Sincronizar novas turmas e alterações sem apagar histórico](#ec-057) |
| EC-058 | Acesso | A FAZER | P0 | Erick | [Implementar verificação de titularidade aprovada](#ec-058) |
| EC-059 | Acesso | A FAZER | P0 | Erick | [Implementar recuperação de acesso aprovada](#ec-059) |
| EC-060 | Segurança | A FAZER | P0 | Erick | [Limitar tentativas de login e primeiro acesso](#ec-060) |
| EC-061 | Segurança | A FAZER | P0 | Erick | [Limitar corpo e custo de processamento nas rotas de acesso](#ec-061) |
| EC-062 | Segurança | A FAZER | P0 | TH | [Padronizar proteção de origem e URL de confirmação](#ec-062) |
| EC-063 | Segurança | A FAZER | P0 | TH | [Configurar cookie e sessão para HTTPS](#ec-063) |
| EC-064 | Segurança | A FAZER | P1 | TH | [Aplicar cabeçalhos de segurança e cache privado](#ec-064) |
| EC-065 | Acesso | A FAZER | P0 | TH | [Configurar remetente e envio de e-mail real](#ec-065) |
| EC-066 | Testes | A FAZER | P0 | Erick | [Testar falhas e garantir ausência de link de teste em produção](#ec-066) |
| EC-067 | Segurança | A FAZER | P0 | Erick | [Registrar ações sensíveis com auditoria mínima](#ec-067) |
| EC-068 | Segurança | A FAZER | P0 | TH | [Revisar segurança antes de habilitar produção](#ec-068) |
| EC-069 | Declarações | A FAZER | P0 | Erick | [Aplicar modelo aprovado à geração A4](#ec-069) |
| EC-070 | Declarações | DEPENDE DA ESCOLA | P1 | Erick | [Confirmar dados e modelo do subsequente](#ec-070) |
| EC-071 | Declarações | A FAZER | P1 | Erick | [Implementar declaração do subsequente](#ec-071) |
| EC-072 | Declarações | DEPENDE DA ESCOLA | P1 | Erick | [Definir retirada, cancelamento, correção e novo pedido](#ec-072) |
| EC-073 | Declarações | A FAZER | P1 | Erick | [Implementar transições de atendimento aprovadas](#ec-073) |
| EC-074 | Testes | A FAZER | P1 | Erick | [Testar impressão e casos extremos do lote](#ec-074) |
| EC-075 | Declarações | DEPENDE DA ESCOLA | P1 | Erick | [Decidir guarda e versão do documento final](#ec-075) |
| EC-076 | Site | DEPENDE DA ESCOLA | P0 | Erick | [Receber textos e assets oficiais do site](#ec-076) |
| EC-077 | Site | A FAZER | P1 | Erick | [Publicar conteúdo aprovado na interface](#ec-077) |
| EC-078 | Design | A FAZER | P1 | Erick | [Revisar acessibilidade e responsividade das jornadas](#ec-078) |
| EC-079 | Desempenho | A FAZER | P1 | TH | [Medir desempenho com metas realistas](#ec-079) |
| EC-080 | Infraestrutura | A FAZER | P1 | TH | [Criar imagens Docker para site e portal](#ec-080) |
| EC-081 | Infraestrutura | A FAZER | P1 | TH | [Orquestrar aplicações e volumes na VPS](#ec-081) |
| EC-082 | Infraestrutura | A FAZER | P0 | TH | [Configurar DNS, proxy reverso e HTTPS](#ec-082) |
| EC-083 | Infraestrutura | A FAZER | P0 | TH | [Preparar acessos e atualizações da VPS](#ec-083) |
| EC-084 | Infraestrutura | A FAZER | P0 | TH | [Definir backup e demonstrar restauração](#ec-084) |
| EC-085 | Infraestrutura | A FAZER | P1 | TH | [Disponibilizar homologação isolada](#ec-085) |
| EC-086 | CI/CD | A FAZER | P1 | TH | [Construir e versionar artefato de release no CI](#ec-086) |
| EC-087 | CI/CD | A FAZER | P0 | TH | [Criar deploy automatizado com aprovação e rollback](#ec-087) |
| EC-088 | CI/CD | A FAZER | P0 | TH | [Definir operação segura de migrações na release](#ec-088) |
| EC-089 | Infraestrutura | A FAZER | P0 | TH | [Monitorar disponibilidade e erros sem expor dados](#ec-089) |
| EC-090 | Infraestrutura | A FAZER | P1 | TH | [Documentar incidentes, suporte e manutenção](#ec-090) |
| EC-091 | Acesso | A FAZER | P0 | Erick | [Habilitar acesso de produção após aprovação](#ec-091) |
| EC-092 | Gestão | A FAZER | P0 | TH + Erick | [Realizar piloto assistido e aprovar MVP](#ec-092) |
| EC-093 | Gestão | A FAZER | P0 | TH + Erick | [Lançar MVP e revisar operação](#ec-093) |
| EC-094 | Futuro | FUTURO — DESCOBERTA | P2 | Erick | [Aprovar escopo e privacidade da consulta por QR](#ec-094) |
| EC-095 | Futuro | FUTURO CONDICIONAL | P2 | Erick | [Persistir registro imutável e cancelamento do documento](#ec-095) |
| EC-096 | Futuro | FUTURO CONDICIONAL | P2 | Erick | [Implementar QR e consulta de documento](#ec-096) |
| EC-097 | Futuro | FUTURO — DESCOBERTA | P2 | TH | [Revalidar assinatura eletrônica e integração GOV.BR](#ec-097) |
| EC-098 | Futuro | FUTURO CONDICIONAL | P2 | Erick | [Detalhar e implementar método de assinatura aprovado](#ec-098) |
| EC-099 | Futuro | FUTURO — DESCOBERTA | P2 | Erick | [Levantar regras do histórico escolar](#ec-099) |
| EC-100 | Futuro | FUTURO — DESCOBERTA | P2 | Erick | [Levantar arquivo e vínculo de dados do SISTEC](#ec-100) |
| EC-101 | Futuro | FUTURO — DESCOBERTA | P2 | Erick | [Levantar requisitos de diploma e futura emissão](#ec-101) |
| EC-102 | Futuro | FUTURO — DESCOBERTA | P2 | Erick | [Levantar importação de notas e acesso pedagógico](#ec-102) |
| EC-103 | Futuro | FUTURO — DESCOBERTA | P2 | Erick | [Definir indicadores e apoio ao Conselho de Classe](#ec-103) |
| EC-104 | Futuro | FUTURO — DESCOBERTA | P2 | TH | [Especificar API autorizada para outros projetos](#ec-104) |

## EC-001

[Abrir card no Trello](https://trello.com/c/ABr85ZdO/2-feito-dev-ec-001-estruturar-monoreposit%C3%B3rio-nextjs-com-duas-aplica%C3%A7%C3%B5es)

### Estruturar monorepositório Next.js com duas aplicações

**Estado:** FEITO DEV
**Área:** Arquitetura | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

npm workspaces, site na porta 3000 e portal na 3001. Outros projetos permanecem em repositórios próprios.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** package.json; apps/site/package.json; apps/portal/package.json

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-002

[Abrir card no Trello](https://trello.com/c/cIvGDqBQ/3-feito-dev-ec-002-documentar-arquitetura-opera%C3%A7%C3%A3o-e-decis%C3%B5es-da-equipe)

### Documentar arquitetura, operação e decisões da equipe

**Estado:** FEITO DEV
**Área:** Gestão | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Regras de escopo, comandos, pendências institucionais e direção visual registradas.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** AGENTS.md; README.md; DESIGN.md

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-003

[Abrir card no Trello](https://trello.com/c/3gmIunHQ/4-feito-dev-ec-003-consolidar-identidade-ete-pernambuco-e-estilos-compartilhados)

### Consolidar identidade ETE/Pernambuco e estilos compartilhados

**Estado:** FEITO DEV
**Área:** Design | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Marca própria ETE Conectada, azul/marinho/branco, fontes locais, arte de Pernambuco e botões padronizados. Aprovação visual final ainda pendente.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** shared/brand/; shared/fonts/; shared/styles/; DESIGN.md

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-004

[Abrir card no Trello](https://trello.com/c/ny4wuscA/5-feito-dev-ec-004-criar-site-institucional-p%C3%BAblico)

### Criar site institucional público

**Estado:** FEITO DEV
**Área:** Site | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Página da escola e acesso ao portal implementados; conteúdo institucional ainda precisa de aprovação.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/site/app/page.tsx; apps/site/app/globals.css

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-005

[Abrir card no Trello](https://trello.com/c/ChroKhn8/6-feito-dev-ec-005-corrigir-navega%C3%A7%C3%A3o-entre-aplica%C3%A7%C3%B5es-e-acesso-pela-rede-local)

### Corrigir navegação entre aplicações e acesso pela rede local

**Estado:** FEITO DEV
**Área:** Site | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Links preservam host em desenvolvimento e mudam portas; NEXT_PUBLIC_LAN_HOST e origens de desenvolvimento configuráveis.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** shared/navigation/cross-app-link.tsx; apps/site/next.config.ts; apps/portal/next.config.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-006

[Abrir card no Trello](https://trello.com/c/I5JyeD8n/7-feito-dev-ec-006-integrar-prisma-7-com-postgresql-neon)

### Integrar Prisma 7 com PostgreSQL/Neon

**Estado:** FEITO DEV
**Área:** Dados | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Cliente tipado e adaptador PostgreSQL; falta de DATABASE_URL impede consultas. Não foi consultado banco nesta entrega.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/db.ts; apps/portal/prisma/schema.prisma

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-007

[Abrir card no Trello](https://trello.com/c/RgqQF5T8/8-feito-dev-ec-007-versionar-migra%C3%A7%C3%B5es-de-alunos-acesso-e-solicita%C3%A7%C3%B5es)

### Versionar migrações de alunos, acesso e solicitações

**Estado:** FEITO DEV
**Área:** Dados | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Histórico de schema versionado, inclusive migração que retira o modelo ativo de fotos.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/prisma/migrations/; apps/portal/prisma.config.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-008

[Abrir card no Trello](https://trello.com/c/W5hXnmFV/9-feito-dev-ec-008-preparar-seed-de-tr%C3%AAs-alunos-sint%C3%A9ticos)

### Preparar seed de três alunos sintéticos

**Estado:** FEITO DEV
**Área:** Testes | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Seed contém cenários de primeiro acesso e login e preserva contas existentes quando reexecutado.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/scripts/seed.ts; apps/portal/prisma/README.md

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-009

[Abrir card no Trello](https://trello.com/c/rIeP8NDR/10-feito-dev-ec-009-implementar-importa%C3%A7%C3%A3o-por-lista-branca-e-matr%C3%ADcula)

### Implementar importação por lista branca e matrícula

**Estado:** FEITO DEV
**Área:** Dados | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Importação transacional/idempotente sem senhas, e-mails, fotos ou papéis externos. Importação de 517 alunos/12 turmas registrada pela equipe, não recontada no banco nesta entrega.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/student-import.ts; apps/portal/scripts/import-students.ts; AGENTS.md

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-010

[Abrir card no Trello](https://trello.com/c/7GQ4bbVb/11-feito-dev-ec-010-implementar-primeiro-acesso-com-matr%C3%ADcula-e-nascimento)

### Implementar primeiro acesso com matrícula e nascimento

**Estado:** FEITO DEV
**Área:** Acesso | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Consulta de elegibilidade e abertura de modal em desenvolvimento; a verificação de titularidade para produção continua pendente.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/app/cadastro/page.tsx; apps/portal/src/app/api/registration/check/route.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-011

[Abrir card no Trello](https://trello.com/c/GKFntRa2/12-feito-dev-ec-011-validar-cpf-e-credenciais-na-cria%C3%A7%C3%A3o-de-conta)

### Validar CPF e credenciais na criação de conta

**Estado:** FEITO DEV
**Área:** Acesso | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Dígitos verificadores, unicidade do CPF, e-mail, senha de 8 a 128 caracteres e confirmação validados no servidor.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/registration.ts; apps/portal/src/app/api/registration/start/route.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-012

[Abrir card no Trello](https://trello.com/c/QX34xtZP/13-feito-dev-ec-012-armazenar-senhas-com-scrypt)

### Armazenar senhas com scrypt

**Estado:** FEITO DEV
**Área:** Segurança | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Hash e comparação separados; a aplicação não armazena a senha em texto simples.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/password.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-013

[Abrir card no Trello](https://trello.com/c/yOaI5GXm/14-feito-dev-ec-013-confirmar-e-mail-com-token-de-uso-%C3%BAnico)

### Confirmar e-mail com token de uso único

**Estado:** FEITO DEV
**Área:** Acesso | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Token com validade limitada e hash; integração Resend condicionada à configuração. Link local de teste só em desenvolvimento; envio real não configurado nesta organização.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/account-registration.ts; apps/portal/src/app/api/registration/verify/route.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-014

[Abrir card no Trello](https://trello.com/c/TYsbOIw0/15-feito-dev-ec-014-corrigir-retomada-de-cadastro-pendente)

### Corrigir retomada de cadastro pendente

**Estado:** FEITO DEV
**Área:** Acesso | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Renovação com mesmas credenciais invalida link anterior; após expiração é possível redefinir dados conforme fluxo atual. Conta ativa não é sobrescrita.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/account-registration.ts; apps/portal/scripts/test-registration.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-015

[Abrir card no Trello](https://trello.com/c/JwC63Cad/16-feito-dev-ec-015-implementar-login-por-cpf-ou-e-mail-em-desenvolvimento)

### Implementar login por CPF ou e-mail em desenvolvimento

**Estado:** FEITO DEV
**Área:** Acesso | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Somente conta ativa com senha correta inicia sessão. API permanece bloqueada fora de desenvolvimento.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/app/api/login/route.ts; apps/portal/src/components/login-form.tsx

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-016

[Abrir card no Trello](https://trello.com/c/7gJfcP5D/17-feito-dev-ec-016-persistir-sess%C3%B5es-e-revog%C3%A1-las-no-logout)

### Persistir sessões e revogá-las no logout

**Estado:** FEITO DEV
**Área:** Segurança | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Token de sessão guardado como hash no banco, cookie HttpOnly, expiração e logout.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/session.ts; apps/portal/src/lib/session-record.ts; apps/portal/src/app/api/logout/route.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-017

[Abrir card no Trello](https://trello.com/c/5S8vnZba/18-feito-dev-ec-017-proteger-p%C3%A1gina-inicial-e-apresentar-menu-de-servi%C3%A7os)

### Proteger página inicial e apresentar menu de serviços

**Estado:** FEITO DEV
**Área:** Portal | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Sem sessão, / redireciona para login. Home autenticada, menu à esquerda; histórico e diploma são apenas informativos.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/app/page.tsx; apps/portal/src/components/portal-home.tsx

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-018

[Abrir card no Trello](https://trello.com/c/vMJb3XD5/19-feito-dev-ec-018-reduzir-consultas-de-sess%C3%A3o-e-diagnosticar-login)

### Reduzir consultas de sessão e diagnosticar login

**Estado:** FEITO DEV
**Área:** Desempenho | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Consulta de sessão consolidada, idle do pool em 60 segundos e script de diagnóstico. Tempos do chat são medições históricas, não SLA atual.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/session-record.ts; apps/portal/src/lib/db.ts; apps/portal/scripts/diagnose-login.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-019

[Abrir card no Trello](https://trello.com/c/4kOt8AvK/20-feito-dev-ec-019-persistir-pedido-de-declara%C3%A7%C3%A3o-e-acompanhamento-pelo-aluno)

### Persistir pedido de declaração e acompanhamento pelo aluno

**Estado:** FEITO DEV
**Área:** Declarações | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Um pedido aberto por matrícula, repetição retorna existente, aluno consulta seus pedidos e não recebe PDF.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declaration-requests.ts; apps/portal/src/app/api/declaracao/solicitacoes/route.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-020

[Abrir card no Trello](https://trello.com/c/5SGlv5tQ/21-feito-dev-ec-020-criar-atendimento-protegido-pelo-papel-secretary)

### Criar atendimento protegido pelo papel secretary

**Estado:** FEITO DEV
**Área:** Declarações | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Busca e consulta autorizadas no servidor; concessão via script a conta ativa. Papel definitivo da gestão ainda precisa ser aprovado.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declaration-access.ts; apps/portal/src/app/secretaria/declaracoes/page.tsx; apps/portal/scripts/set-secretary.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-021

[Abrir card no Trello](https://trello.com/c/ugh0D99Q/22-feito-dev-ec-021-gerar-minuta-a4-individual-e-em-lotes-de-at%C3%A9-100)

### Gerar minuta A4 individual e em lotes de até 100

**Estado:** FEITO DEV
**Área:** Declarações | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Seleção por aluno/turma e conferência; dados complementares em memória. Frequência real e intervalo quando incluída; dois espaços de assinatura/carimbo. Modelo subsequente bloqueado.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declaration-pdf.ts; apps/portal/src/lib/declarations.ts; apps/portal/src/components/secretary-declarations.tsx

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-022

[Abrir card no Trello](https://trello.com/c/7DU8Bav8/23-feito-dev-ec-022-separar-gera%C3%A7%C3%A3o-do-pdf-e-libera%C3%A7%C3%A3o-para-retirada)

### Separar geração do PDF e liberação para retirada

**Estado:** FEITO DEV
**Área:** Declarações | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Solicitada → em preparação após geração → pronta para retirada após confirmação explícita de impressão/assinaturas/carimbos. Não há estado de entrega efetiva implementado.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declaration-requests.ts; apps/portal/src/components/staff-declaration-requests.tsx

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-023

[Abrir card no Trello](https://trello.com/c/1eciDlom/24-feito-dev-ec-023-remover-perfil-e-fotos-do-front-e-backend-ativos)

### Remover perfil e fotos do front e backend ativos

**Estado:** FEITO DEV
**Área:** Portal | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Referências antigas arquivadas; nenhum fluxo ativo de upload, SDK S3 ou modelo Prisma de perfil. Arquivos antigos do bucket não foram apagados.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** AGENTS.md; apps/portal/prisma/migrations/20261003000000_students_enrollments/migration.sql

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-024

[Abrir card no Trello](https://trello.com/c/0qBUHrlQ/25-feito-dev-ec-024-preparar-modelos-e-pesquisas-de-declara%C3%A7%C3%A3o-qr)

### Preparar modelos e pesquisas de declaração/QR

**Estado:** FEITO DEV
**Área:** Pesquisa | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Referência alinhada, proposta A4 e exemplo fictício. Pesquisa de assinatura/consulta, sem validador QR ou assinatura digital implementados e sem revalidação legal nesta entrega.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** docs/declaracao-vinculo/viabilidade.md; docs/declaracao-vinculo/consulta-qr-2026-10-09.md; output/pdf/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-025

[Abrir card no Trello](https://trello.com/c/EbntmBhv/26-feito-dev-ec-025-organizar-trabalho-acumulado-em-sete-commits)

### Organizar trabalho acumulado em sete commits

**Estado:** FEITO DEV
**Área:** Gestão | **Prioridade:** Histórico | **Escopo:** Registro histórico
**Responsável sugerido:** Não atribuído retrospectivamente | **Revisão:** TH + Erick
**Janela sugerida:** Histórico (não é prazo ou compromisso)
**Dependências:** Nenhuma

Sete commits locais reais de 09/10/2026; HEAD inicial 3fb180c igual à referência local origin/main. Chat relata envio ao GitHub privado; acesso remoto atual não pôde ser confirmado.

**Critérios de aceite**
- [ ] Resultado presente no código/documentação do snapshot 3fb180c.
- [ ] Registro histórico não equivale a serviço homologado ou disponível em produção.

**Verificação:** Conferência do código e histórico nesta organização; testes anteriores relatados no chat, não reexecutados nesta entrega.

**Evidência / arquivos prováveis:** git log; README.md; .gitignore; chat compartilhado

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-026

[Abrir card no Trello](https://trello.com/c/HKDfuYpw/27-p1-ec-026-revisar-invent%C3%A1rio-e-priorizar-primeira-sprint)

### Revisar inventário e priorizar primeira sprint

**Estado:** A FAZER
**Área:** Gestão | **Prioridade:** P1 | **Escopo:** S
**Responsável sugerido:** TH + Erick | **Revisão:** TH + Erick
**Janela sugerida:** Sprint 0 (não é prazo ou compromisso)
**Dependências:** Nenhuma

Validar esta base juntos; todo card começa no PRODUCT BACKLOG por solicitação da equipe.

**Critérios de aceite**
- [ ] Confirmar status, prioridades e dono dos cards selecionados.
- [ ] Registrar disponibilidade dos dois e selecionar capacidade real, sem prometer o backlog inteiro.

**Verificação:** Reunião curta com decisões registradas.

**Evidência / arquivos prováveis:** tasks/plan.md; tasks/backlog.md

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-027

[Abrir card no Trello](https://trello.com/c/zklVaWMp/28-p1-ec-027-definir-padr%C3%A3o-de-branch-e-pull-request-por-card)

### Definir padrão de branch e pull request por card

**Estado:** A FAZER
**Área:** Gestão | **Prioridade:** P1 | **Escopo:** S
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 0 (não é prazo ou compromisso)
**Dependências:** EC-026

Os dois podem atuar em todas as áreas; cada alteração fica rastreável ao card.

**Critérios de aceite**
- [ ] Uma branch curta por mudança e PR com problema, testes e limitações.
- [ ] Outro dev revisa; mudanças nos mesmos arquivos são combinadas antes de integrar.

**Verificação:** Abrir PR de exemplo e conferir vínculo ao ID do card.

**Evidência / arquivos prováveis:** README.md; futuro .github/PULL_REQUEST_TEMPLATE.md

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-028

[Abrir card no Trello](https://trello.com/c/NaOGVMf1/29-p1-ec-028-criar-ci-de-instala%C3%A7%C3%A3o-e-build-dos-dois-workspaces)

### Criar CI de instalação e build dos dois workspaces

**Estado:** A FAZER
**Área:** CI/CD | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 0 (não é prazo ou compromisso)
**Dependências:** EC-027

Primeiro pipeline sem banco real e sem deploy; usar Node 24 e npm ci.

**Critérios de aceite**
- [ ] PR/push executam npm ci e npm run build com ambiente de build sem credenciais reais.
- [ ] Falha em qualquer app torna o check vermelho; compartilhados verificam ambos.

**Verificação:** PR deliberadamente quebrada falha; correção passa; guardar URL da execução.

**Evidência / arquivos prováveis:** package.json; .nvmrc; futuro .github/workflows/ci.yml

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-029

[Abrir card no Trello](https://trello.com/c/pKUUOBWJ/30-p1-ec-029-adicionar-comandos-de-tipos-lint-e-formata%C3%A7%C3%A3o)

### Adicionar comandos de tipos, lint e formatação

**Estado:** A FAZER
**Área:** CI/CD | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 0 (não é prazo ou compromisso)
**Dependências:** EC-028

Hoje não há scripts explícitos de lint/typecheck/teste unitário na raiz.

**Critérios de aceite**
- [ ] Comandos reproduzíveis para ambos os apps documentados.
- [ ] CI reprova erros reais sem reformatação gigante misturada a feature.

**Verificação:** Executar comandos locais e verificar falha controlada no CI.

**Evidência / arquivos prováveis:** package.json; apps/*/package.json

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-030

[Abrir card no Trello](https://trello.com/c/T531jv9k/31-p1-ec-030-cobrir-valida%C3%A7%C3%B5es-puras-de-primeiro-acesso)

### Cobrir validações puras de primeiro acesso

**Estado:** A FAZER
**Área:** Testes | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 0 (não é prazo ou compromisso)
**Dependências:** Nenhuma

Adicionar runner simples e testes sem banco para CPF, matrícula, e-mail e nascimento.

**Critérios de aceite**
- [ ] Casos válidos, inválidos, limites e datas impossíveis cobertos.
- [ ] Um comando raiz executa testes sem DATABASE_URL.

**Verificação:** Executar suíte unitária e comprovar que não conecta ao banco.

**Evidência / arquivos prováveis:** apps/portal/src/lib/registration.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-031

[Abrir card no Trello](https://trello.com/c/BATBoYt8/32-p0-ec-031-impedir-testes-e-seeds-no-banco-errado)

### Impedir testes e seeds no banco errado

**Estado:** A FAZER
**Área:** Testes | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 0 (não é prazo ou compromisso)
**Dependências:** Nenhuma

Os scripts existentes escrevem registros temporários e aceitam DATABASE_URL; só verificar NODE_ENV não comprova que o banco é descartável.

**Critérios de aceite**
- [ ] Exigir opt-in de teste e identidade do banco de teste antes de escrita.
- [ ] Falhar antes de conexão/escrita quando configuração ausente ou ambiente não autorizado; limpeza limitada às fixtures.

**Verificação:** Testar recusas com configuração fictícia e execução em PostgreSQL descartável.

**Evidência / arquivos prováveis:** apps/portal/scripts/test-*.ts; apps/portal/scripts/seed.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-032

[Abrir card no Trello](https://trello.com/c/HMYNNrrg/33-p1-ec-032-criar-postgresql-descart%C3%A1vel-e-aplicar-migra%C3%A7%C3%B5es-no-ci)

### Criar PostgreSQL descartável e aplicar migrações no CI

**Estado:** A FAZER
**Área:** CI/CD | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** EC-028, EC-031

Preparar service container e teste de migrações com banco vazio; não usar branch real Neon.

**Critérios de aceite**
- [ ] Todas as migrações aplicam de zero e schema final é conferido.
- [ ] Cada execução possui banco isolado; nenhuma credencial de aluno/produção.

**Verificação:** Executar db:migrate (prisma migrate deploy) no banco vazio, depois db:validate/db:status e conferir schema final com teste de schema.

**Evidência / arquivos prováveis:** apps/portal/prisma/migrations/; futuro .github/workflows/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-033

[Abrir card no Trello](https://trello.com/c/IkSWG056/34-p1-ec-033-automatizar-testes-existentes-de-cadastro-e-declara%C3%A7%C3%A3o)

### Automatizar testes existentes de cadastro e declaração

**Estado:** A FAZER
**Área:** CI/CD | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** EC-032

As APIs funcionam somente em development: integração precisa subir dev:portal; next start de produção não executa as jornadas atuais.

**Critérios de aceite**
- [ ] CI sobe dev:portal, aguarda readiness e define TEST_BASE_URL; executa test:registration, test:declarations e test:db serialmente em banco sintético.
- [ ] Sem RESEND_API_KEY/EMAIL_FROM; subprocesso e fixtures removidos mesmo após falha.

**Verificação:** Executar jobs em PR e guardar saída sem dados sensíveis.

**Evidência / arquivos prováveis:** package.json; apps/portal/scripts/test-registration.ts; apps/portal/scripts/test-declarations.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-034

[Abrir card no Trello](https://trello.com/c/aD7HOKM5/35-p1-ec-034-proteger-main-com-revis%C3%A3o-e-checks-obrigat%C3%B3rios)

### Proteger main com revisão e checks obrigatórios

**Estado:** A FAZER
**Área:** Gestão | **Prioridade:** P1 | **Escopo:** S
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** EC-029, EC-033

Aplicar regras disponíveis no plano do repositório privado; se recurso indisponível, documentar processo equivalente.

**Critérios de aceite**
- [ ] PR exige revisão do outro dev e checks pertinentes verdes antes de merge.
- [ ] Regra testada e plano de exceção urgente documentado com rastreabilidade.

**Verificação:** Tentar merge de PR com check falho e registrar comportamento.

**Evidência / arquivos prováveis:** Configuração do GitHub, ainda não acessível nesta sessão

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-035

[Abrir card no Trello](https://trello.com/c/gdtbFuDY/36-p1-ec-035-cobrir-senha-e-hash-malformado-com-testes-puros)

### Cobrir senha e hash malformado com testes puros

**Estado:** A FAZER
**Área:** Testes | **Prioridade:** P1 | **Escopo:** S
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** EC-030

Testar comportamento de segurança sem depender de HTTP ou Neon.

**Critérios de aceite**
- [ ] Senha correta passa e errada falha; hash inválido tem resultado controlado.
- [ ] Casos de limites não causam autenticação indevida.

**Verificação:** Executar suíte unitária.

**Evidência / arquivos prováveis:** apps/portal/src/lib/password.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-036

[Abrir card no Trello](https://trello.com/c/tC0H63hT/37-p1-ec-036-cobrir-campos-e-frequ%C3%AAncia-da-declara%C3%A7%C3%A3o-em-testes-puros)

### Cobrir campos e frequência da declaração em testes puros

**Estado:** A FAZER
**Área:** Testes | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** EC-030

Complementar os testes de API com casos determinísticos de validação.

**Critérios de aceite**
- [ ] Exigir conferência, campos obrigatórios e intervalo válido quando há frequência.
- [ ] Limites 0/100, datas futuras/impossíveis e matrícula de outro aluno cobertos.

**Verificação:** Executar suíte unitária e conferir conteúdo fictício.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declarations.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-037

[Abrir card no Trello](https://trello.com/c/YMmrYUDF/38-p1-ec-037-cobrir-importa%C3%A7%C3%A3o-idempotente-e-rollback)

### Cobrir importação idempotente e rollback

**Estado:** A FAZER
**Área:** Testes | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 2 (não é prazo ou compromisso)
**Dependências:** EC-032

Provar importação com fixtures pequenas inteiramente sintéticas.

**Critérios de aceite**
- [ ] Reexecutar não duplica alunos/matrículas; entrada divergente cancela transação.
- [ ] Não importar senha/e-mail/foto/papel; acesso fica bloqueado por padrão.

**Verificação:** Executar teste em banco descartável.

**Evidência / arquivos prováveis:** apps/portal/src/lib/student-import.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-038

[Abrir card no Trello](https://trello.com/c/EuAGerw9/39-p0-ec-038-ampliar-regress%C3%A3o-de-sess%C3%A3o-e-autoriza%C3%A7%C3%A3o)

### Ampliar regressão de sessão e autorização

**Estado:** A FAZER
**Área:** Testes | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 2 (não é prazo ou compromisso)
**Dependências:** EC-033

Cobrir expiração, logout e tentativa de acessar dados de outro aluno/papel.

**Critérios de aceite**
- [ ] Sessão expirada/revogada/inativa não acessa dados privados.
- [ ] Aluno A não lê B nem gera PDF; secretaria autorizada passa.

**Verificação:** Executar testes de API com identidades sintéticas.

**Evidência / arquivos prováveis:** apps/portal/src/lib/session-record.ts; apps/portal/src/app/api/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-039

[Abrir card no Trello](https://trello.com/c/5PCPaJvl/40-p1-ec-039-criar-testes-de-navegador-das-jornadas-principais)

### Criar testes de navegador das jornadas principais

**Estado:** A FAZER
**Área:** Testes | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 2 (não é prazo ou compromisso)
**Dependências:** EC-033

Automatizar fluxos completos sem substituir a avaliação visual humana.

**Critérios de aceite**
- [ ] Cadastro/retomada/login/logout e solicitação/atendimento cobertos.
- [ ] Seletores acessíveis e fixtures sintéticas; teste não depende de contas reais.

**Verificação:** Executar em navegador headless e registrar relatório sanitizado.

**Evidência / arquivos prováveis:** apps/site/app/; apps/portal/src/app/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-040

[Abrir card no Trello](https://trello.com/c/P7dFAHmk/41-p0-ec-040-testar-bloqueios-atuais-em-build-de-produ%C3%A7%C3%A3o)

### Testar bloqueios atuais em build de produção

**Estado:** A FAZER
**Área:** Testes | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** EC-028

Build de produção deve preservar decisão atual até liberação institucional.

**Critérios de aceite**
- [ ] next start recusa cadastro/login e não aceita sessão de desenvolvimento.
- [ ] Build não consulta banco nem expõe link/token de teste.

**Verificação:** Executar smoke com ambiente isolado e sem segredos.

**Evidência / arquivos prováveis:** apps/portal/src/lib/registration.ts; apps/portal/src/lib/session.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-041

[Abrir card no Trello](https://trello.com/c/ZcW0Em00/42-p1-ec-041-definir-triagem-de-depend%C3%AAncias-e-automatizar-alertas)

### Definir triagem de dependências e automatizar alertas

**Estado:** A FAZER
**Área:** Segurança | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** EC-028

Não tratar alerta histórico do chat como vulnerabilidade atual; estabelecer triagem reproduzível.

**Critérios de aceite**
- [ ] Auditoria atual registra versão, impacto e ação por alerta.
- [ ] Atualizações em PR revisada, lockfile íntegro e testes; automatizar alertas/updates conforme recursos disponíveis.

**Verificação:** npm audit e revisão dos resultados; conferir PR de atualização.

**Evidência / arquivos prováveis:** package-lock.json; package.json; futuro .github/dependabot.yml

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-042

[Abrir card no Trello](https://trello.com/c/NGPLXC4D/43-p1-ec-042-adicionar-an%C3%A1lise-de-c%C3%B3digo-e-segredos-ao-ci)

### Adicionar análise de código e segredos ao CI

**Estado:** A FAZER
**Área:** Segurança | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 2 (não é prazo ou compromisso)
**Dependências:** EC-028

Escolher ferramenta compatível com repositório privado e plano; CodeQL/secret scanning dependem de disponibilidade.

**Critérios de aceite**
- [ ] Código/configuração e histórico Git têm escopo de análise definido e política de triagem; disponibilidade da ferramenta documentada.
- [ ] Teste com marcador fictício comprova detecção; logs/artifacts não incluem env, backups ou PDFs reais.

**Verificação:** Executar scanner e revisar falso positivo/resultado controlado.

**Evidência / arquivos prováveis:** Futuro .github/workflows/; .gitignore

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-043

[Abrir card no Trello](https://trello.com/c/ErzpHzMr/44-p0-ec-043-revisar-seguran%C3%A7a-dos-workflows)

### Revisar segurança dos workflows

**Estado:** A FAZER
**Área:** Segurança | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** EC-028, EC-033

Separar execução de PR da execução privilegiada de deploy.

**Critérios de aceite**
- [ ] Permissões mínimas, actions fixadas por SHA verificado, timeout e concorrência configurados.
- [ ] Código de PR não recebe secrets de deploy nem roda em runner conectado à produção.

**Verificação:** Revisar YAML, simular PR externo e conferir permissões efetivas.

**Evidência / arquivos prováveis:** Futuro .github/workflows/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-044

[Abrir card no Trello](https://trello.com/c/iZtDZgvB/45-p0-ec-044-definir-titularidade-e-recupera%C3%A7%C3%A3o-com-a-escola)

### Definir titularidade e recuperação com a escola

**Estado:** DEPENDE DA ESCOLA
**Área:** Acesso | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 0 (não é prazo ou compromisso)
**Dependências:** Nenhuma

Matrícula/nascimento/CPF válido/e-mail escolhido não comprovam identidade; pedir procedimento institucional.

**Critérios de aceite**
- [ ] Registrar aprovação de verificação adicional e tratamento de reivindicação incorreta.
- [ ] Definir responsável de suporte, dados mínimos e caminho de recuperação.

**Verificação:** Validar cenários com secretaria/coordenador sem usar dados reais nos cards.

**Evidência / arquivos prováveis:** AGENTS.md; apps/portal/src/lib/account-registration.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-045

[Abrir card no Trello](https://trello.com/c/JGSzvo19/46-p0-ec-045-confirmar-pap%C3%A9is-de-secretaria-e-gest%C3%A3o)

### Confirmar papéis de secretaria e gestão

**Estado:** DEPENDE DA ESCOLA
**Área:** Acesso | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 0 (não é prazo ou compromisso)
**Dependências:** Nenhuma

Hoje apenas secretary; pedido do chat fala em gestor e aguarda decisão.

**Critérios de aceite**
- [ ] Matriz aprovada identifica consulta, preparação, confirmação e futuras correções.
- [ ] Definir concessão/revogação e aprovação institucional; não presumir que todos possam emitir.

**Verificação:** Revisão de cenários com responsáveis da escola.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declaration-access.ts; AGENTS.md

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-046

[Abrir card no Trello](https://trello.com/c/OfX42eXE/47-p0-ec-046-validar-modelo-e-signat%C3%A1rios-da-declara%C3%A7%C3%A3o)

### Validar modelo e signatários da declaração

**Estado:** DEPENDE DA ESCOLA
**Área:** Declarações | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 0 (não é prazo ou compromisso)
**Dependências:** Nenhuma

Levar divergências como pedido de conferência; pesquisa anterior não substitui orientação da escola/GRE.

**Critérios de aceite**
- [ ] Obter versão vigente, campos, texto e dois signatários/substituições aceitas.
- [ ] Documentar orientação atual e critérios de emissão oficial; manter minuta até aprovação.

**Verificação:** Registrar aprovação institucional e confrontar modelo aprovado com PDF fictício.

**Evidência / arquivos prováveis:** docs/declaracao-vinculo/viabilidade.md; output/pdf/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-047

[Abrir card no Trello](https://trello.com/c/4paFPNpY/48-p0-ec-047-obter-dicion%C3%A1rio-e-exporta%C3%A7%C3%A3o-autorizada-de-dados-escolares)

### Obter dicionário e exportação autorizada de dados escolares

**Estado:** DEPENDE DA ESCOLA
**Área:** Dados | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 0 (não é prazo ou compromisso)
**Dependências:** Nenhuma

Descobrir sistema de origem e formato oficial; backup JSON atual não é importador de Excel da secretaria.

**Critérios de aceite**
- [ ] Mapear campos, atualização e qualidade: filiação, naturalidade/UF, nome social, matrícula, modalidade, curso, período e situação.
- [ ] Receber amostra sanitizada; arquivo real fica fora do Git/Trello e não vira fixture.

**Verificação:** Conferir dicionário com secretaria e validar amostra sintética.

**Evidência / arquivos prováveis:** apps/portal/prisma/schema.prisma; chat compartilhado

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-048

[Abrir card no Trello](https://trello.com/c/pBgB7stA/49-p0-ec-048-confirmar-finalidade-e-fonte-da-frequ%C3%AAncia)

### Confirmar finalidade e fonte da frequência

**Estado:** DEPENDE DA ESCOLA
**Área:** Declarações | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** EC-046, EC-047

Determinar quando declaração comprova frequência e onde se obtém valor real.

**Critérios de aceite**
- [ ] Escola aprova regra, fonte, intervalo e responsável pela conferência.
- [ ] Nunca presumir 100%; definir comportamento quando registro está ausente/desatualizado.

**Verificação:** Revisar exemplos fictícios de vínculo e frequência.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declarations.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-049

[Abrir card no Trello](https://trello.com/c/TDffSOCc/50-p0-ec-049-definir-pol%C3%ADtica-de-acesso-reten%C3%A7%C3%A3o-e-suporte-a-dados-pessoais)

### Definir política de acesso, retenção e suporte a dados pessoais

**Estado:** DEPENDE DA ESCOLA
**Área:** Segurança | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** EC-047

Levantar decisões com responsável institucional, incluindo dados de menores, logs, fornecedores e pedidos de correção.

**Critérios de aceite**
- [ ] Documentar finalidade, responsáveis, mínimo necessário, retenção e acesso por papel.
- [ ] Definir aprovação para banco/hosting e procedimento de incidente/correção; avisos de privacidade validados.

**Verificação:** Revisão institucional do mapa de dados e cenários de acesso.

**Evidência / arquivos prováveis:** AGENTS.md; apps/portal/prisma/schema.prisma

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-050

[Abrir card no Trello](https://trello.com/c/WEzDxun3/51-p0-ec-050-confirmar-dom%C3%ADnio-hospedagem-e-respons%C3%A1vel-institucional)

### Confirmar domínio, hospedagem e responsável institucional

**Estado:** DEPENDE DA ESCOLA
**Área:** Infraestrutura | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** Nenhuma

eteconectada.com/portal planejados; histórico também explora domínio institucional via SEE/ATI. Não contratar nada nesta tarefa.

**Critérios de aceite**
- [ ] Escola define domínio/hospedagem permitidos e quem administra contas/DNS/VPS.
- [ ] Registrar orçamento, capacidade e opção institucional, sem presumir concessão de subdomínio.

**Verificação:** Decisão registrada e encaminhamentos feitos pelo responsável autorizado.

**Evidência / arquivos prováveis:** AGENTS.md; chat compartilhado

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-051

[Abrir card no Trello](https://trello.com/c/8uEbZedI/52-p0-ec-051-definir-contas-de-servidores-e-revoga%C3%A7%C3%A3o-de-privil%C3%A9gios)

### Definir contas de servidores e revogação de privilégios

**Estado:** DEPENDE DA ESCOLA
**Área:** Acesso | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 2 (não é prazo ou compromisso)
**Dependências:** EC-045, EC-049

Hoje Account pertence obrigatoriamente a Student; não criar aluno falso para funcionário em produção.

**Critérios de aceite**
- [ ] Aprovar identidade, vínculo e desligamento de servidores; propor modelagem mínima.
- [ ] Implementação futura não depende de conta fictícia ou privilégio informal.

**Verificação:** Revisar modelo e testar concessão/revogação em banco descartável.

**Evidência / arquivos prováveis:** apps/portal/scripts/set-secretary.ts; apps/portal/prisma/schema.prisma

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-052

[Abrir card no Trello](https://trello.com/c/tw0mdESE/53-p1-ec-052-persistir-dados-complementares-aprovados-do-aluno)

### Persistir dados complementares aprovados do aluno

**Estado:** A FAZER
**Área:** Dados | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-047, EC-049, EC-046

Hoje filiação/naturalidade/nome social ficam somente no editor aberto.

**Critérios de aceite**
- [ ] Migração armazena somente campos aprovados com origem e política de atualização.
- [ ] Dados ausentes continuam ausentes; correção só por pessoa autorizada.

**Verificação:** Migração e integração com fixtures sintéticas.

**Evidência / arquivos prováveis:** apps/portal/prisma/schema.prisma; apps/portal/src/lib/declarations.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-053

[Abrir card no Trello](https://trello.com/c/F2nX729f/54-p0-ec-053-registrar-situa%C3%A7%C3%A3o-e-vig%C3%AAncia-da-matr%C3%ADcula)

### Registrar situação e vigência da matrícula

**Estado:** A FAZER
**Área:** Dados | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-047

Schema atual não registra situação da matrícula; não basta importar turma para afirmar vínculo atual.

**Critérios de aceite**
- [ ] Mapear situação/período/modalidade e atualização conforme regra escolar.
- [ ] Impedir declaração incompatível com situação, sem inventar critérios de elegibilidade.

**Verificação:** Testar matrículas múltiplas, encerradas e período incorreto.

**Evidência / arquivos prováveis:** apps/portal/prisma/schema.prisma; apps/portal/src/lib/declarations.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-054

[Abrir card no Trello](https://trello.com/c/2Ofbkiv5/55-p0-ec-054-cadastrar-configura%C3%A7%C3%A3o-institucional-aprovada)

### Cadastrar configuração institucional aprovada

**Estado:** A FAZER
**Área:** Declarações | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-046, EC-050

Centralizar identificação da escola e responsáveis conforme modelo validado.

**Critérios de aceite**
- [ ] Campos oficiais conferidos e alteráveis por responsável autorizado.
- [ ] PDF usa versão aprovada; não inventar INEP, cadastro escolar, atos ou nomes.

**Verificação:** Gerar PDF fictício e conferir todos os campos com escola.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declaration-pdf.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-055

[Abrir card no Trello](https://trello.com/c/uXCqyZeL/56-p1-ec-055-especificar-importa%C3%A7%C3%A3o-de-planilha-oficial-da-secretaria)

### Especificar importação de planilha oficial da secretaria

**Estado:** A FAZER
**Área:** Dados | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-047, EC-049

Demanda do histórico: importar turmas exportadas pelo sistema escolar, além do backup JSON atual.

**Critérios de aceite**
- [ ] Definir formato real, colunas, limites, duplicação e relatório de divergências.
- [ ] Criar fixtures sintéticas e contrato de validação antes de desenvolver upload.

**Verificação:** Conferência do contrato com amostra sanitizada.

**Evidência / arquivos prováveis:** apps/portal/src/lib/student-import.ts; chat compartilhado

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-056

[Abrir card no Trello](https://trello.com/c/Ob3ibKwF/57-p1-ec-056-implementar-pr%C3%A9via-e-importa%C3%A7%C3%A3o-da-planilha-aprovada)

### Implementar prévia e importação da planilha aprovada

**Estado:** A FAZER
**Área:** Dados | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-055, EC-052, EC-053

Receber arquivo autorizado, mostrar resultado previsto e confirmar antes de aplicar.

**Critérios de aceite**
- [ ] Entrada inválida não muda banco; transação/idempotência e relatório sem dados excessivos.
- [ ] Somente papel aprovado; limites de arquivo/linhas e confirmação explícita.

**Verificação:** Testar upload/importação/rollback com fixtures sintéticas.

**Evidência / arquivos prováveis:** apps/portal/src/lib/student-import.ts; futura área de importação

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-057

[Abrir card no Trello](https://trello.com/c/kANEeXw1/58-p1-ec-057-sincronizar-novas-turmas-e-altera%C3%A7%C3%B5es-sem-apagar-hist%C3%B3rico)

### Sincronizar novas turmas e alterações sem apagar histórico

**Estado:** A FAZER
**Área:** Dados | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-056

Tratar renovação de período, transferências e divergências segundo escola.

**Critérios de aceite**
- [ ] Atualização não cria contas nem sobrescreve credenciais.
- [ ] Sem exclusão destrutiva automática; conflitos exigem conferência autorizada.

**Verificação:** Testar reimportação, mudança de turma e conflito.

**Evidência / arquivos prováveis:** apps/portal/prisma/schema.prisma; apps/portal/src/lib/student-import.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-058

[Abrir card no Trello](https://trello.com/c/Ipvojz2m/59-p0-ec-058-implementar-verifica%C3%A7%C3%A3o-de-titularidade-aprovada)

### Implementar verificação de titularidade aprovada

**Estado:** A FAZER
**Área:** Acesso | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-044, EC-038

Implementar somente o mecanismo escolhido pela escola; preservar matrícula/nascimento como entrada se mantida.

**Critérios de aceite**
- [ ] Apenas pessoa autorizada consegue reivindicar conta.
- [ ] Reivindicação indevida e cadastro pendente possuem tratamento testado.

**Verificação:** Testes negativos e validação institucional em ambiente isolado.

**Evidência / arquivos prováveis:** apps/portal/src/lib/account-registration.ts; apps/portal/src/app/api/registration/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-059

[Abrir card no Trello](https://trello.com/c/mAbVjRwS/60-p0-ec-059-implementar-recupera%C3%A7%C3%A3o-de-acesso-aprovada)

### Implementar recuperação de acesso aprovada

**Estado:** A FAZER
**Área:** Acesso | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-044, EC-038

E-mail foi previsto no histórico para recuperação, mas não existe fluxo de esqueci senha.

**Critérios de aceite**
- [ ] Fluxo aprovado usa token de uso único/expiração e resposta sem enumerar contas.
- [ ] Revogar sessões conforme regra aprovada; prever suporte para perda de e-mail.

**Verificação:** Testar expiração, replay e sessão antiga sem enviar e-mail real.

**Evidência / arquivos prováveis:** Futuras rotas de recuperação; apps/portal/src/lib/session-record.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-060

[Abrir card no Trello](https://trello.com/c/vfH0Jnjb/61-p0-ec-060-limitar-tentativas-de-login-e-primeiro-acesso)

### Limitar tentativas de login e primeiro acesso

**Estado:** A FAZER
**Área:** Segurança | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-044, EC-050

Não há rate limiting no código observado; escolher armazenamento compatível com VPS/proxy.

**Critérios de aceite**
- [ ] Limites testados por ação, com janela e resposta consistente.
- [ ] Mitigar enumeração/abuso sem bloqueio permanente trivial de aluno; considerar rede compartilhada da escola.

**Verificação:** Testar rajadas, reset da janela e concorrência.

**Evidência / arquivos prováveis:** apps/portal/src/app/api/login/route.ts; apps/portal/src/app/api/registration/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-061

[Abrir card no Trello](https://trello.com/c/bFUV89zR/62-p0-ec-061-limitar-corpo-e-custo-de-processamento-nas-rotas-de-acesso)

### Limitar corpo e custo de processamento nas rotas de acesso

**Estado:** A FAZER
**Área:** Segurança | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** Nenhuma

Login/cadastro usam request.json sem limite equivalente ao observado em algumas APIs privadas.

**Critérios de aceite**
- [ ] Corpo excessivo/tipos inválidos rejeitados antes de hash ou consulta cara.
- [ ] Senha máxima e estrutura validadas de maneira consistente no servidor.

**Verificação:** Testar entradas excessivas, arrays e tipos inesperados.

**Evidência / arquivos prováveis:** apps/portal/src/app/api/login/route.ts; apps/portal/src/app/api/registration/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-062

[Abrir card no Trello](https://trello.com/c/lVPipoS3/63-p0-ec-062-padronizar-prote%C3%A7%C3%A3o-de-origem-e-url-de-confirma%C3%A7%C3%A3o)

### Padronizar proteção de origem e URL de confirmação

**Estado:** A FAZER
**Área:** Segurança | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-050

Revisar todas as mutações, inclusive login/logout; URL de confirmação deriva hoje do pedido.

**Critérios de aceite**
- [ ] Matriz de rotas inclui explicitamente login, logout e cadastro para origem/CSRF; host externo não controla links enviados.
- [ ] URL pública confiável configurada; LAN segue permitida só em desenvolvimento.

**Verificação:** Testar origem ausente/externa, host adulterado e proxy homologado.

**Evidência / arquivos prováveis:** apps/portal/src/lib/private-request.ts; apps/portal/src/app/api/registration/start/route.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-063

[Abrir card no Trello](https://trello.com/c/6u19Qun4/64-p0-ec-063-configurar-cookie-e-sess%C3%A3o-para-https)

### Configurar cookie e sessão para HTTPS

**Estado:** A FAZER
**Área:** Segurança | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-050, EC-038

Cookie atual usa secure:false em desenvolvimento; preparar produção antes de habilitar acesso.

**Critérios de aceite**
- [ ] Secure em HTTPS de produção, HttpOnly/SameSite/path/duração documentados.
- [ ] Cookie do portal isolado de outros subdomínios e revogação testada.

**Verificação:** Conferir Set-Cookie e autenticação em HTTPS de homologação.

**Evidência / arquivos prováveis:** apps/portal/src/app/api/login/route.ts; apps/portal/src/lib/session.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-064

[Abrir card no Trello](https://trello.com/c/UvRJyKIL/65-p1-ec-064-aplicar-cabe%C3%A7alhos-de-seguran%C3%A7a-e-cache-privado)

### Aplicar cabeçalhos de segurança e cache privado

**Estado:** A FAZER
**Área:** Segurança | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-050

Conferir páginas e APIs, incluindo erros, além dos privateHeaders já existentes.

**Critérios de aceite**
- [ ] Respostas privadas usam no-store; nosniff e políticas necessárias aplicadas.
- [ ] CSP/frame/referrer compatíveis com imagens/fontes/fluxos e proxy; HSTS só com HTTPS verificado.

**Verificação:** Testar cabeçalhos e jornadas completas sem quebra.

**Evidência / arquivos prováveis:** apps/*/next.config.ts; apps/portal/src/lib/private-request.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-065

[Abrir card no Trello](https://trello.com/c/639rsiTE/66-p0-ec-065-configurar-remetente-e-envio-de-e-mail-real)

### Configurar remetente e envio de e-mail real

**Estado:** A FAZER
**Área:** Acesso | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-050, EC-049

Resend tem integração condicional; domínio/remetente/verificação DNS ainda pendentes.

**Critérios de aceite**
- [ ] Remetente institucional verificado e chave fora do Git; sandbox separada.
- [ ] Erro de envio é recuperável e rastreável sem imprimir token, senha ou dados pessoais.

**Verificação:** Teste em sandbox autorizado e teste de falha com mock.

**Evidência / arquivos prováveis:** apps/portal/src/app/api/registration/start/route.ts; apps/portal/.env.example

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-066

[Abrir card no Trello](https://trello.com/c/BD4JVyMb/67-p0-ec-066-testar-falhas-e-garantir-aus%C3%AAncia-de-link-de-teste-em-produ%C3%A7%C3%A3o)

### Testar falhas e garantir ausência de link de teste em produção

**Estado:** A FAZER
**Área:** Testes | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-065, EC-040

Desenvolvimento retorna dev_link até em falha do provedor; isso deve permanecer estritamente restrito.

**Critérios de aceite**
- [ ] Timeout/rejeição/reenvio possuem comportamento definido e testado.
- [ ] Produção nunca responde dev_link, token ou fallback de desenvolvimento.

**Verificação:** Mocks do provedor e testes por ambiente.

**Evidência / arquivos prováveis:** apps/portal/src/app/api/registration/start/route.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-067

[Abrir card no Trello](https://trello.com/c/43NNikRd/68-p0-ec-067-registrar-a%C3%A7%C3%B5es-sens%C3%ADveis-com-auditoria-m%C3%ADnima)

### Registrar ações sensíveis com auditoria mínima

**Estado:** A FAZER
**Área:** Segurança | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-045, EC-049

Há contas/datas de preparação e liberação, mas não histórico completo de alterações e privilégios.

**Critérios de aceite**
- [ ] Registrar ator, ação, alvo e data nas operações aprovadas, sem senha/token/CPF em logs gerais.
- [ ] Acesso e retenção de auditoria definidos; registro não apagado por operação comum.

**Verificação:** Testar trilha de concessão, preparação e correção com fixtures.

**Evidência / arquivos prováveis:** apps/portal/prisma/schema.prisma; apps/portal/src/lib/declaration-requests.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-068

[Abrir card no Trello](https://trello.com/c/IAfgAs3x/69-p0-ec-068-revisar-seguran%C3%A7a-antes-de-habilitar-produ%C3%A7%C3%A3o)

### Revisar segurança antes de habilitar produção

**Estado:** A FAZER
**Área:** Segurança | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-058, EC-059, EC-060, EC-062, EC-063, EC-066, EC-067

Realizar revisão focada e validação dos achados; esta organização não é auditoria completa.

**Critérios de aceite**
- [ ] Escopo, evidência e resultados registrados sem expor dados reais.
- [ ] Achados que bloqueiam lançamento corrigidos e retestados; risco residual aprovado.

**Verificação:** Revisão de código e testes negativos em homologação.

**Evidência / arquivos prováveis:** Código de acesso/dados/declarações e configuração de deploy

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-069

[Abrir card no Trello](https://trello.com/c/BhYrrItU/70-p0-ec-069-aplicar-modelo-aprovado-%C3%A0-gera%C3%A7%C3%A3o-a4)

### Aplicar modelo aprovado à geração A4

**Estado:** A FAZER
**Área:** Declarações | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-046, EC-054, EC-053, EC-048

Converter minuta em modelo homologado para integrado, mantendo duas assinaturas conforme confirmação.

**Critérios de aceite**
- [ ] Todos os campos e texto aprovados aparecem sem truncar em A4.
- [ ] Não retirar identificação de minuta antes de validação; não declarar situação/frequência presumida.

**Verificação:** Conferência de PDF fictício com escola, nomes longos e impressão.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declaration-pdf.ts; apps/portal/src/lib/declarations.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-070

[Abrir card no Trello](https://trello.com/c/FVrqY6eX/71-p1-ec-070-confirmar-dados-e-modelo-do-subsequente)

### Confirmar dados e modelo do subsequente

**Estado:** DEPENDE DA ESCOLA
**Área:** Declarações | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-046, EC-047

Modelo de dados prevê SUBSEQUENTE; geração atual o recusa.

**Critérios de aceite**
- [ ] Escola define módulo/período/curso e texto correto.
- [ ] Obter amostra sanitizada e critérios separados sem reutilização indevida do integrado.

**Verificação:** Revisar modelo e casos com secretaria.

**Evidência / arquivos prováveis:** EducationMode em apps/portal/prisma/schema.prisma

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-071

[Abrir card no Trello](https://trello.com/c/f9XsncBo/72-p1-ec-071-implementar-declara%C3%A7%C3%A3o-do-subsequente)

### Implementar declaração do subsequente

**Estado:** A FAZER
**Área:** Declarações | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-070, EC-069

Adicionar caminho somente depois de modelo confirmado.

**Critérios de aceite**
- [ ] Selecionar matrícula subsequente gera texto/modalidade corretos.
- [ ] Lote misto não confunde ano do integrado com módulo do subsequente.

**Verificação:** Testar PDF individual/lote com dados sintéticos.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declarations.ts; apps/portal/src/lib/declaration-pdf.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-072

[Abrir card no Trello](https://trello.com/c/1txQxndX/73-p1-ec-072-definir-retirada-cancelamento-corre%C3%A7%C3%A3o-e-novo-pedido)

### Definir retirada, cancelamento, correção e novo pedido

**Estado:** DEPENDE DA ESCOLA
**Área:** Declarações | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-046, EC-045

Hoje só REQUESTED/IN_PREPARATION/READY_FOR_PICKUP; não inventar fechamento da entrega.

**Critérios de aceite**
- [ ] Aprovar estados, responsáveis, transições e regra de nova solicitação.
- [ ] Definir geração falha, erro encontrado após impressão e desistência sem apagar histórico.

**Verificação:** Tabela de cenários validada pela secretaria.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declaration-request-types.ts; apps/portal/src/lib/declaration-requests.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-073

[Abrir card no Trello](https://trello.com/c/Zv2HzQcP/74-p1-ec-073-implementar-transi%C3%A7%C3%B5es-de-atendimento-aprovadas)

### Implementar transições de atendimento aprovadas

**Estado:** A FAZER
**Área:** Declarações | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-072, EC-067

Adicionar somente estados aprovados para entrega/correção/cancelamento.

**Critérios de aceite**
- [ ] Transições autorizadas no servidor e ações repetidas seguras.
- [ ] Histórico preservado; nova solicitação segue regra de pedido aberto aprovada.

**Verificação:** Testes de concorrência, papéis e repetição de ações.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declaration-requests.ts; Prisma; componentes de pedidos

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-074

[Abrir card no Trello](https://trello.com/c/7qawgwbM/75-p1-ec-074-testar-impress%C3%A3o-e-casos-extremos-do-lote)

### Testar impressão e casos extremos do lote

**Estado:** A FAZER
**Área:** Testes | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-069, EC-033

Complementar testes existentes com fidelidade e impressão A4.

**Critérios de aceite**
- [ ] Nomes longos, caracteres, filiação única/nome social e limites de lote não cortam campos.
- [ ] Falha na geração não libera retirada; baixar não confirma assinatura.

**Verificação:** Renderizar exemplos sintéticos e imprimir amostra homologada.

**Evidência / arquivos prováveis:** apps/portal/src/lib/declaration-pdf.ts; apps/portal/scripts/test-declarations.ts

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-075

[Abrir card no Trello](https://trello.com/c/qEJSqIZM/76-p1-ec-075-decidir-guarda-e-vers%C3%A3o-do-documento-final)

### Decidir guarda e versão do documento final

**Estado:** DEPENDE DA ESCOLA
**Área:** Declarações | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-046, EC-049, EC-072

Definir se guarda PDF preenchido/assinado, prazo, acesso e vínculo à solicitação; hoje não há repositório oficial de emitidos.

**Critérios de aceite**
- [ ] Escola decide documento oficial, retenção e responsabilidade pela guarda.
- [ ] Escolher snapshot/versão e acesso mínimo antes de implementar storage.

**Verificação:** Revisão de processo e exemplos sem documentos reais.

**Evidência / arquivos prováveis:** PDF gerado em memória; docs/declaracao-vinculo/consulta-qr-2026-10-09.md

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-076

[Abrir card no Trello](https://trello.com/c/8GOHwnXh/77-p0-ec-076-receber-textos-e-assets-oficiais-do-site)

### Receber textos e assets oficiais do site

**Estado:** DEPENDE DA ESCOLA
**Área:** Site | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 1 (não é prazo ou compromisso)
**Dependências:** Nenhuma

Conteúdo institucional e outras imagens estão pendentes; o chat relata faixa gerada por IA em protótipo.

**Critérios de aceite**
- [ ] Conferir procedência/proporções das marcas e substituir reprodução provisória quando necessário.
- [ ] Escola aprova textos, contatos, cursos e imagens; nenhum dado inventado.

**Verificação:** Revisão editorial e visual com equipe.

**Evidência / arquivos prováveis:** apps/site/app/page.tsx; apps/site/public/images/; DESIGN.md

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-077

[Abrir card no Trello](https://trello.com/c/ZFm6200q/78-p1-ec-077-publicar-conte%C3%BAdo-aprovado-na-interface)

### Publicar conteúdo aprovado na interface

**Estado:** A FAZER
**Área:** Site | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-076

Atualizar só seções aprovadas; não criar CMS/notícias sem demanda.

**Critérios de aceite**
- [ ] Texto provisório substituído, links e metadados corretos.
- [ ] Marca/tokens mantêm direção aprovada sem grade de cartões rejeitada.

**Verificação:** Build e conferência editorial/links.

**Evidência / arquivos prováveis:** apps/site/app/page.tsx; apps/site/app/layout.tsx

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-078

[Abrir card no Trello](https://trello.com/c/3pqaoIwa/79-p1-ec-078-revisar-acessibilidade-e-responsividade-das-jornadas)

### Revisar acessibilidade e responsividade das jornadas

**Estado:** A FAZER
**Área:** Design | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Sprint 2 (não é prazo ou compromisso)
**Dependências:** EC-039

Última revisão visual do chat foi apenas pelo código a pedido da equipe; precisa de validação visual humana.

**Critérios de aceite**
- [ ] Teclado, foco de modal/menu, rótulos/erros e contraste verificados.
- [ ] Celular/desktop, zoom e estados vazio/erro/carregando sem perda de ações.

**Verificação:** Checklist manual e testes automatizados pertinentes com dados sintéticos.

**Evidência / arquivos prováveis:** apps/site/; apps/portal/src/components/; shared/styles/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-079

[Abrir card no Trello](https://trello.com/c/A4YgseMA/80-p1-ec-079-medir-desempenho-com-metas-realistas)

### Medir desempenho com metas realistas

**Estado:** A FAZER
**Área:** Desempenho | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-033

Neon é remoto; medições antigas não são garantia atual.

**Critérios de aceite**
- [ ] Medir login quente/frio, lista de secretaria e PDF com cargas sintéticas.
- [ ] Definir orçamento de latência/recursos e só otimizar gargalos observados.

**Verificação:** Registrar percentis/amostra/ambiente e repetir após correção.

**Evidência / arquivos prováveis:** apps/portal/scripts/diagnose-login.ts; db.ts; apps/site/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-080

[Abrir card no Trello](https://trello.com/c/gswelWqy/81-p1-ec-080-criar-imagens-docker-para-site-e-portal)

### Criar imagens Docker para site e portal

**Estado:** A FAZER
**Área:** Infraestrutura | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-028, EC-050

Preparar build reproduzível do monorepo para VPS, sem executar deploy nesta etapa de organização.

**Critérios de aceite**
- [ ] Imagem compila cada app com Node compatível, compartilhados/fontes/Prisma/PDF necessários.
- [ ] Runtime sem root, sem env/backups/dados reais na imagem; configs build/runtime documentadas.

**Verificação:** Construir e iniciar imagens localmente; smoke de produção respeita bloqueios atuais.

**Evidência / arquivos prováveis:** apps/site/next.config.ts; apps/portal/next.config.ts; futuros Dockerfiles

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-081

[Abrir card no Trello](https://trello.com/c/jIelS5TW/82-p1-ec-081-orquestrar-aplica%C3%A7%C3%B5es-e-volumes-na-vps)

### Orquestrar aplicações e volumes na VPS

**Estado:** A FAZER
**Área:** Infraestrutura | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-080, EC-050

Definir serviços, rede privada, persistência aprovada e limite de recursos; não incluir outros projetos no monorepo.

**Critérios de aceite**
- [ ] Configuração separa site/portal e banco conforme decisão de hosting.
- [ ] Segredos externos e volumes necessários explicitados; reinício mantém estado persistente.

**Verificação:** Validar Compose e simular reinício com dados sintéticos.

**Evidência / arquivos prováveis:** Futuro compose.yaml

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-082

[Abrir card no Trello](https://trello.com/c/szE1K6A5/83-p0-ec-082-configurar-dns-proxy-reverso-e-https)

### Configurar DNS, proxy reverso e HTTPS

**Estado:** A FAZER
**Área:** Infraestrutura | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-081, EC-050

Encaminhar site e portal por domínio aprovado e proteger APIs privadas.

**Critérios de aceite**
- [ ] TLS válido, renovação e origens/host confiáveis conferidos.
- [ ] Apps/banco não expostos diretamente; proxy limita requisições conforme política.

**Verificação:** Teste HTTPS/renovação/portas e jornada em homologação.

**Evidência / arquivos prováveis:** Futuras configs de proxy/DNS

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-083

[Abrir card no Trello](https://trello.com/c/fnvi0JPN/84-p0-ec-083-preparar-acessos-e-atualiza%C3%A7%C3%B5es-da-vps)

### Preparar acessos e atualizações da VPS

**Estado:** A FAZER
**Área:** Infraestrutura | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-050

Após contratação/autorização, definir acesso dos dois e responsável institucional.

**Critérios de aceite**
- [ ] SSH por chave, menor privilégio, firewall e atualizações documentados.
- [ ] Inventário de administradores e procedimento de perda/saída sem senha compartilhada.

**Verificação:** Conferir serviços/portas e acesso de recuperação autorizado.

**Evidência / arquivos prováveis:** Futuro runbook de infraestrutura

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-084

[Abrir card no Trello](https://trello.com/c/1IpDtHt4/85-p0-ec-084-definir-backup-e-demonstrar-restaura%C3%A7%C3%A3o)

### Definir backup e demonstrar restauração

**Estado:** A FAZER
**Área:** Infraestrutura | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-049, EC-050, EC-081

Incluir banco, configuração e documentos se guarda for aprovada.

**Critérios de aceite**
- [ ] Definir RPO/RTO, responsável, retenção, proteção e cópia fora do servidor.
- [ ] Restaurar em ambiente isolado e conferir integridade; backup nunca em Git/Trello.

**Verificação:** Simulação de restauração com registros sintéticos e relatório.

**Evidência / arquivos prováveis:** Banco PostgreSQL/Neon; futura política/runbook

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-085

[Abrir card no Trello](https://trello.com/c/0wvpsVr6/86-p1-ec-085-disponibilizar-homologa%C3%A7%C3%A3o-isolada)

### Disponibilizar homologação isolada

**Estado:** A FAZER
**Área:** Infraestrutura | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-082, EC-083, EC-084

Testar atualizações antes de publicar; production build atual não permite login, e dev não pode ser publicado como produção.

**Critérios de aceite**
- [ ] Ambiente privado/autorizado com dados sintéticos e credenciais separadas.
- [ ] Fluxos de produção somente após liberação; até lá usar smoke de bloqueio e testes de desenvolvimento isolados.

**Verificação:** Demonstrar isolamento de banco/secrets e execução dos testes.

**Evidência / arquivos prováveis:** Futura configuração de ambientes

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-086

[Abrir card no Trello](https://trello.com/c/CCQDmFMJ/87-p1-ec-086-construir-e-versionar-artefato-de-release-no-ci)

### Construir e versionar artefato de release no CI

**Estado:** A FAZER
**Área:** CI/CD | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-080, EC-043, EC-041

Promover artefato por commit/digest em vez de rebuild diferente a cada ambiente.

**Critérios de aceite**
- [ ] Imagem recebe identidade do commit, resultado de checks e análise de dependências.
- [ ] Registry autorizado, publicação com permissão mínima e sem env; versão rastreável.

**Verificação:** Construir imagem e conferir digest/manifest no ambiente de teste.

**Evidência / arquivos prováveis:** Futuro workflow de imagem/registry

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-087

[Abrir card no Trello](https://trello.com/c/rXgurHlM/88-p0-ec-087-criar-deploy-automatizado-com-aprova%C3%A7%C3%A3o-e-rollback)

### Criar deploy automatizado com aprovação e rollback

**Estado:** A FAZER
**Área:** CI/CD | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-086, EC-085, EC-034

Automação primeiro em homologação; produção requer condições institucionais concluídas.

**Critérios de aceite**
- [ ] Deploy usa artefato testado, aprovação do ambiente e health/smoke pós-atualização.
- [ ] Falha não promove versão; rollback para versão conhecida testado.

**Verificação:** Simular release saudável e falha com retorno em homologação.

**Evidência / arquivos prováveis:** Futuro workflow de deploy

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-088

[Abrir card no Trello](https://trello.com/c/jvs1rP4t/89-p0-ec-088-definir-opera%C3%A7%C3%A3o-segura-de-migra%C3%A7%C3%B5es-na-release)

### Definir operação segura de migrações na release

**Estado:** A FAZER
**Área:** CI/CD | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-032, EC-084, EC-087

Migrações com efeito persistente têm procedimento próprio; desfazer container não desfaz banco.

**Critérios de aceite**
- [ ] Testar migrações e compatibilidade com versão anterior; backup e exclusão mútua antes da aplicação.
- [ ] Definir recuperação de falha e mudanças destrutivas; seed/importação não rodam por deploy comum.

**Verificação:** Simular atualização de schema e restauração em ambiente isolado.

**Evidência / arquivos prováveis:** apps/portal/prisma/migrations/; futuro runbook

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-089

[Abrir card no Trello](https://trello.com/c/j20VZGVG/90-p0-ec-089-monitorar-disponibilidade-e-erros-sem-expor-dados)

### Monitorar disponibilidade e erros sem expor dados

**Estado:** A FAZER
**Área:** Infraestrutura | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-049, EC-085

Definir alertas úteis e responsável; não logar credenciais, payloads de alunos ou documentos.

**Critérios de aceite**
- [ ] Health check distingue serviço/banco sem revelar detalhes ao público.
- [ ] Alertas de falha, disco, backup e TLS com dados mínimos e retenção definida.

**Verificação:** Provocar falha controlada e verificar alerta/runbook.

**Evidência / arquivos prováveis:** Futuros logs/health checks/monitoramento

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-090

[Abrir card no Trello](https://trello.com/c/aAFKwfJ0/91-p1-ec-090-documentar-incidentes-suporte-e-manuten%C3%A7%C3%A3o)

### Documentar incidentes, suporte e manutenção

**Estado:** A FAZER
**Área:** Infraestrutura | **Prioridade:** P1 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-089, EC-084, EC-088

Ensinar ambos e responsável institucional a operar sem depender do chat.

**Critérios de aceite**
- [ ] Cobrir deploy/rollback, falhas de banco/e-mail, backup, acessos e atualização de segredos.
- [ ] Simular incidente e passagem de responsabilidade; informações sensíveis ficam fora do repo.

**Verificação:** Outro dev executa procedimento no ambiente de teste.

**Evidência / arquivos prováveis:** README.md; futuro docs/operacao/

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-091

[Abrir card no Trello](https://trello.com/c/F9lAyKvr/92-p0-ec-091-habilitar-acesso-de-produ%C3%A7%C3%A3o-ap%C3%B3s-aprova%C3%A7%C3%A3o)

### Habilitar acesso de produção após aprovação

**Estado:** A FAZER
**Área:** Acesso | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-068, EC-069, EC-051, EC-049, EC-066, EC-082, EC-088, EC-089, EC-038

Há bloqueios explícitos fora de development; não trocar NODE_ENV por development na VPS.

**Critérios de aceite**
- [ ] Escola aprova fluxo e critérios técnicos/institucionais anteriores concluídos.
- [ ] Habilitar por configuração controlada, com testes em build production e sem links/contas de teste.

**Verificação:** Jornadas completas e negativas em homologação antes de rollout.

**Evidência / arquivos prováveis:** registration.ts; session.ts; api/login; futura configuração de ambientes

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-092

[Abrir card no Trello](https://trello.com/c/YIuxD0mF/93-p0-ec-092-realizar-piloto-assistido-e-aprovar-mvp)

### Realizar piloto assistido e aprovar MVP

**Estado:** A FAZER
**Área:** Gestão | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH + Erick | **Revisão:** TH + Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-091, EC-078, EC-074, EC-076, EC-090

MVP: aluno solicita, secretaria prepara/imprime e confirma disponibilidade; assinatura/carimbo continuam em papel.

**Critérios de aceite**
- [ ] Responsáveis da escola homologam fluxo e tratamento de falhas.
- [ ] Registrar treinamento, limitações e autorização de lançamento; nenhuma emissão oficial presumida.

**Verificação:** Piloto autorizado e ata de aprovação, sem alunos identificáveis nos cards.

**Evidência / arquivos prováveis:** Site/portal e roteiro de homologação

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-093

[Abrir card no Trello](https://trello.com/c/odK8cGOn/94-p0-ec-093-lan%C3%A7ar-mvp-e-revisar-opera%C3%A7%C3%A3o)

### Lançar MVP e revisar operação

**Estado:** A FAZER
**Área:** Gestão | **Prioridade:** P0 | **Escopo:** M
**Responsável sugerido:** TH + Erick | **Revisão:** TH + Erick
**Janela sugerida:** Depois (não é prazo ou compromisso)
**Dependências:** EC-092, EC-087

Publicar somente após piloto e gates; data depende da escola e capacidade da dupla.

**Critérios de aceite**
- [ ] Release rastreável e smoke pós-deploy aprovado.
- [ ] Acompanhar incidentes/feedback e transformar problemas em cards com evidência.

**Verificação:** Conferir disponibilidade, rollback pronto e aceite institucional.

**Evidência / arquivos prováveis:** Futura release e acompanhamento

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-094

[Abrir card no Trello](https://trello.com/c/w385E0ct/95-p2-ec-094-aprovar-escopo-e-privacidade-da-consulta-por-qr)

### Aprovar escopo e privacidade da consulta por QR

**Estado:** FUTURO — DESCOBERTA
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-046, EC-049, EC-075

Há interesse confirmado no chat; não há aprovação institucional nem implementação.

**Critérios de aceite**
- [ ] Definir dados mínimos, acesso público/restrito, emissão, cancelamento e comparação com papel.
- [ ] Registrar que QR/hash não substituem assinatura; não publicar CPF/nascimento/filiação.

**Verificação:** Avaliar cenários com escola/GRE e responsável por privacidade.

**Evidência / arquivos prováveis:** docs/declaracao-vinculo/consulta-qr-2026-10-09.md

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-095

[Abrir card no Trello](https://trello.com/c/8OMUZmIQ/96-p2-ec-095-persistir-registro-imut%C3%A1vel-e-cancelamento-do-documento)

### Persistir registro imutável e cancelamento do documento

**Estado:** FUTURO CONDICIONAL
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-094, EC-075, EC-067

Condicionado à aprovação da consulta; preserva dados da emissão, não dados atuais mutáveis do aluno.

**Critérios de aceite**
- [ ] Snapshot, versão, código aleatório e hash do arquivo associados ao documento.
- [ ] Emissão somente confirmada após procedimento aprovado; cancelamento/substituição auditados.

**Verificação:** Testar geração, alteração cadastral e cancelamento com dados sintéticos.

**Evidência / arquivos prováveis:** Futuro módulo de documentos

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-096

[Abrir card no Trello](https://trello.com/c/xeF0r8iy/97-p2-ec-096-implementar-qr-e-consulta-de-documento)

### Implementar QR e consulta de documento

**Estado:** FUTURO CONDICIONAL
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-095, EC-064, EC-060

Implementar apenas os dados e nível de acesso aprovados.

**Critérios de aceite**
- [ ] QR leva ao registro correto e diferencia emitido/cancelado/não encontrado.
- [ ] Não há listagem pública de alunos; limitar enumeração e orientar comparação com papel.

**Verificação:** Testar código inválido, QR copiado, revogação e vazamento de campos.

**Evidência / arquivos prováveis:** Futura rota de consulta no site/portal

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-097

[Abrir card no Trello](https://trello.com/c/IYQScpRu/98-p2-ec-097-revalidar-assinatura-eletr%C3%B4nica-e-integra%C3%A7%C3%A3o-govbr)

### Revalidar assinatura eletrônica e integração GOV.BR

**Estado:** FUTURO — DESCOBERTA
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-046, EC-050, EC-049

Histórico pesquisou assinador manual, integração em lote, domínio institucional e alternativas. Revalidar requisitos oficiais antes de decisão.

**Critérios de aceite**
- [ ] Confirmar elegibilidade institucional, representante formal e método aceito por escola/GRE.
- [ ] Comparar manual/API e custo/manutenção; não automatizar assinatura ou compartilhar conta do signatário.

**Verificação:** Pesquisa em fontes oficiais e decisão institucional registradas.

**Evidência / arquivos prováveis:** docs/declaracao-vinculo/viabilidade.md; chat compartilhado

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-098

[Abrir card no Trello](https://trello.com/c/FB5GfALn/99-p2-ec-098-detalhar-e-implementar-m%C3%A9todo-de-assinatura-aprovado)

### Detalhar e implementar método de assinatura aprovado

**Estado:** FUTURO CONDICIONAL
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-097, EC-075, EC-095

Dividir em cards menores após escolher método e receber aprovação/credenciais institucionais.

**Critérios de aceite**
- [ ] Cada signatário autoriza sua assinatura; original e evidência preservados.
- [ ] Entrega individual mantém assinaturas; separar páginas de PDF assinado não é presumido válido.

**Verificação:** Homologação do provedor e validação de originais/assinaturas.

**Evidência / arquivos prováveis:** Futuro módulo de assinatura

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-099

[Abrir card no Trello](https://trello.com/c/eAyBCDA2/100-p2-ec-099-levantar-regras-do-hist%C3%B3rico-escolar)

### Levantar regras do histórico escolar

**Estado:** FUTURO — DESCOBERTA
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-047, EC-092

Visão do projeto, sem regras de emissão; não copiar fluxo de declaração automaticamente.

**Critérios de aceite**
- [ ] Definir dados, fontes, conteúdo, autorização, signatários e aceitação institucional.
- [ ] Produzir exemplos sintéticos e decompor implementação somente após aprovação.

**Verificação:** Revisão de requisitos com secretaria/GRE.

**Evidência / arquivos prováveis:** Menu informativo em portal-home.tsx; chat compartilhado

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-100

[Abrir card no Trello](https://trello.com/c/n2Igdk4Y/101-p2-ec-100-levantar-arquivo-e-v%C3%ADnculo-de-dados-do-sistec)

### Levantar arquivo e vínculo de dados do SISTEC

**Estado:** FUTURO — DESCOBERTA
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-047, EC-092

SISTEC é fonte a estudar/importar; nenhuma integração atual.

**Critérios de aceite**
- [ ] Obter layout autorizado e mapear ciclo, curso, aluno e identificador de registro.
- [ ] Definir reconciliação/divergências sem reproduzir lógica do SISTEC nem presumir API.

**Verificação:** Analisar arquivo sanitizado e criar contrato com fixtures fictícias.

**Evidência / arquivos prováveis:** Chat compartilhado — visão futura de concluintes

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-101

[Abrir card no Trello](https://trello.com/c/pAJq4Gry/102-p2-ec-101-levantar-requisitos-de-diploma-e-futura-emiss%C3%A3o)

### Levantar requisitos de diploma e futura emissão

**Estado:** FUTURO — DESCOBERTA
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-100, EC-099

Documento sensível com requisitos próprios ainda não definidos.

**Critérios de aceite**
- [ ] Confirmar elegibilidade, modelos, dados/atos, registro e signatários institucionais.
- [ ] Decompor emissão/entrega/consulta após aprovação; nenhum diploma automático agora.

**Verificação:** Requisitos revisados por secretaria/GRE.

**Evidência / arquivos prováveis:** Menu informativo; chat compartilhado

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-102

[Abrir card no Trello](https://trello.com/c/lrtpe91V/103-p2-ec-102-levantar-importa%C3%A7%C3%A3o-de-notas-e-acesso-pedag%C3%B3gico)

### Levantar importação de notas e acesso pedagógico

**Estado:** FUTURO — DESCOBERTA
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-047, EC-049, EC-092

Ideia: importar planilha após fechamento de notas; nenhuma regra ou modelo implementado.

**Critérios de aceite**
- [ ] Definir fonte/formato, disciplinas/trimestres, retificações e papéis autorizados.
- [ ] Minimizar exposição de notas e separar acesso pedagógico do aluno/secretaria.

**Verificação:** Contrato de dados e cenários aprovados pela coordenação.

**Evidência / arquivos prováveis:** Chat compartilhado — coordenação pedagógica

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-103

[Abrir card no Trello](https://trello.com/c/v3EpOz8V/104-p2-ec-103-definir-indicadores-e-apoio-ao-conselho-de-classe)

### Definir indicadores e apoio ao Conselho de Classe

**Estado:** FUTURO — DESCOBERTA
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** Erick | **Revisão:** TH
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-102

Exemplo de três disciplinas foi citado no resumo, não regra validada de classificação.

**Critérios de aceite**
- [ ] Coordenação aprova cálculo, período, exceções e quem vê cada indicador.
- [ ] Definir dashboard sem decisão automática sobre aluno; detalhar cards após aprovação.

**Verificação:** Validar resultados com conjunto sintético conferido manualmente.

**Evidência / arquivos prováveis:** Chat compartilhado — indicadores/recuperação

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.


## EC-104

[Abrir card no Trello](https://trello.com/c/OytJX7PS/105-p2-ec-104-especificar-api-autorizada-para-outros-projetos)

### Especificar API autorizada para outros projetos

**Estado:** FUTURO — DESCOBERTA
**Área:** Futuro | **Prioridade:** P2 | **Escopo:** M
**Responsável sugerido:** TH | **Revisão:** Erick
**Janela sugerida:** Futuro (não é prazo ou compromisso)
**Dependências:** EC-049, EC-045, EC-092

Gamificação/eleição permanecem fora do repo e com login próprio. Integração só quando demandada.

**Critérios de aceite**
- [ ] Consumidor e campos necessários identificados; autenticação/escopos/limites definidos.
- [ ] Sem compartilhar credencial/acesso direto ao banco; contrato/versionamento e revogação.

**Verificação:** Revisão do contrato e testes negativos antes de implementação.

**Evidência / arquivos prováveis:** AGENTS.md; chat compartilhado

**Regras da dupla:** um dono por card em execução, branch própria, combinar mudanças nos mesmos arquivos e revisão do outro dev. Não registrar dados pessoais, credenciais ou documentos reais no Trello.

Base levantada em 09/10/2026 no snapshot 3fb180c. Os itens históricos foram conferidos por código/documentação, não representam produção homologada.
