---
version: alpha
colors:
  navy: "#102e59"
  navy-deep: "#0a203f"
  blue: "#155bcc"
  yellow: "#f5c518"
  red: "#bb2440"
  bg: "#f5f7fb"
  ink: "#172b47"
  muted: "#5c6d83"
typography:
  display:
    fontFamily: "Manrope, Arial, sans-serif"
  body:
    fontFamily: "Source Sans 3, Arial, sans-serif"
rounded:
  control: "12px"
  panel: "28px"
spacing:
  page-max: "1200px"
  mobile-margin: "20px"
components:
  brand-panel:
    rounded: "28px"
---
# ETE Conectada

## Overview

Escola técnica pública pernambucana, para estudantes e comunidade. Português brasileiro, uso em celular e computador. O site público apresenta a escola e conduz ao portal; login, primeiro acesso e área privada têm linguagem de produto.

Direção solicitada em 29/09/2026: recuperar a composição aberta anterior. Do Eletiva Gil, aproveitar cores, header/footer e detalhes do acesso; não copiar cartões e composição. Marca própria ETE Conectada substitui a antiga bola com ETE. O símbolo une dois elos abertos, com amarelo e vermelho de Pernambuco. Não substitui a marca oficial da escola.

## Colors

Fonte canônica: `shared/styles/tokens.css` (modelo B). Ambos os globals importam esse arquivo; CSS Modules consomem as mesmas variáveis. Este documento espelha a paleta. `colors.navy` → `--navy` → cabeçalho, rodapé, painel da marca. `blue` → `--blue` → ação; `bg` → `--bg` → documento; `ink` e `muted` → texto. Amarelo e vermelho são detalhes institucionais; vermelho também indica erro com texto. As cores fixas dos SVGs são arte da marca, não tokens de controles.

## Typography

Display usa Manrope variável, com títulos de peso 750 e espaçamento ajustado; corpo usa Source Sans 3 variável. Arquivos e licenças OFL estão em shared/fonts, carregados por next/font/local nos dois layouts. --font-manrope/--font-source alimentam os tokens --font-display/--font-body; nenhuma chamada externa por fontes em runtime. Formulários têm rótulos curtos e fonte de corpo.

## Layout

Site: abertura marinho com título e arte de arcos de Pernambuco; informações institucionais em composição aberta abaixo. Login/cadastro: uma superfície dividida, identidade à esquerda e formulário à direita; no celular o painel decorativo sai. Home privada: saudação, ação Abrir serviços e arte de Pernambuco; opções de serviços somente no menu azul, aberto pela esquerda. Botões do menu têm ícone e nome; explicações aparecem fora dos botões. Documento é dono do scroll; breakpoint principal 650px. Nenhuma estatística, número decorativo ou grade de benefícios inventada.

## Elevation & Depth

Contraste entre marinho e superfícies claras organiza a tela. Elevação suave e única em formulários/documentos, sombra mais forte em modais, sombra curta nas ações principais. Nenhuma base 3D ou ornamentação em movimento contínuo.

## Shapes

Controles 12px, superfícies principais 28px. Navegação com bordas translúcidas e raio de 12px. A marca mantém elos e proporções. Arte vetorial compartilhada em shared/brand/pernambuco-art.tsx, inspirada nas cores e arcos de Pernambuco; não substitui a bandeira oficial.

## Components

Navegação do portal: menu no canto esquerdo e navegação no canto direito do cabeçalho, com a marca centralizada. Somente a página inicial oferece “Site da escola”; as outras páginas internas usam “Página inicial” para `/`. Login e cadastro não exibem esse botão. O site institucional acessa `/` do portal para retomar uma sessão válida; em desenvolvimento a navegação entre aplicações preserva o host do navegador e troca somente a porta. Ambos usam `PortalNavigationLink`, com ícone e rótulo; na home estreita o link do site mostra só o ícone com nome acessível.

Primeiro acesso: fechar o modal permite retomar. Conta pendente abre a segunda etapa com orientação para renovar a confirmação; somente uma conta ativa aponta para login. Depois de salvar, o modal mostra a mensagem/link de confirmação e o botão Fechar, sem campos vazios ou botão de criação desabilitado. Erros preservam os dados para nova tentativa.

Tokens de tipo: `typography.display` → `--font-display`, `body` → `--font-body`. Controle → `--radius-control`. Marca fonte em `shared/brand`, arquivos públicos idênticos nas duas aplicações.

Os ícones PNG de entrada, saída e menu fornecidos pela equipe são decorativos ao lado dos rótulos. Perfil, seleção de foto e suas ações foram removidos. Ícone de exclusão permanece reservado para futuras ações autorizadas.

### Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Button | shared/styles/buttons.css | tokens.css + .ete-button | primary, secondary, header, on-dark, danger, danger-outline, quiet, compact, icon | desktop/celular, foco e estados |
| Form | use-form-validation.ts + auth-form | Fluxos existentes e README | identificação, login, conta | validação e foco no browser |
| Date | input date em cadastro | valor ISO exigido pelo servidor | native, calendário do sistema aceito | teclado/celular |
| Scrollbar | shared/styles/tokens.css | tokens canônicos | nenhuma | CSS e browser |
| Dialog | dialog nativo com showModal | cadastro e portal-home existentes | conta, menu, retirada | Escape/foco |
| Password | password-input.tsx | masked por padrão | current/new-password | mostrar/ocultar |
| Select/Listbox | select nativo em secretary-declarations.tsx | matrícula/turma fornecida pelo servidor | native; popup e calendário do sistema aceitos | teclado, popup e celular |
| Search | secretary-declarations.tsx | API privada POST, páginas de 20 | nome/matrícula + filtro exato por turma; estado só em memória por conter dados pessoais | limpar, cancelar busca anterior, erro, vazio e paginação |
| Table Selection | secretary-declarations.tsx | lote de impressão autorizado pela equipe | página / turma inteira; seleção explícita e até 100 | contagem, preservação entre páginas e conferência individual |
| PDF | declaration-pdf.ts + downloadDeclaration | modelo A4 revisável e dados autorizados no servidor | preparação pelo atendimento escolar | renderização A4 e isolamento de alunos |

Botão ocupado desabilitado com largura estável. Foco visível. Erro textual ligado ao campo; valores preservados. Mensagens do servidor permanecem inline. Data usa calendário nativo conforme idioma do navegador; restante da interface pt-BR. Reduced motion remove animações. Busca administrativa tem paginação no servidor; dados pessoais e campos da minuta não são persistidos em URL nem armazenamento do navegador.

## Declarações — 03/10/2026

Rotas internas reutilizam PortalHome como shell: menu esquerdo, navegação direita, marca central e link Página inicial. O aluno consulta somente seu registro. A secretaria tem busca em uma coluna e conferência na outra; no celular, seleção abre a conferência e Voltar à busca preserva o filtro. O documento possui o scroll, sem altura fixa no formulário. As buscas são canceláveis, com debounce de 300ms e proteção de composição IME; Enter confirma a consulta. Sem grade de cartões nem novo tema.

Primeiro acesso usa matrícula e nascimento. O modal pede CPF validado, e-mail e senha mínima de 8 caracteres, com confirmação. Fechar ou retomar preserva o comportamento canônico das contas pendentes; o CPF já vinculado não é trocado por uma renovação do link.

Seleção de matrícula usa select nativo, com popup do sistema aceito. Os campos para a minuta não alteram os dados importados; erros preservam valores. Trocar de aluno ou navegar com campos preenchidos abre dialog nativo para confirmar o descarte, com foco inicial em Continuar preenchendo. Expiração de sessão informa que é preciso entrar novamente. Conta sem acesso administrativo recebe página restrita com caminho para solicitar sua declaração; APIs retornam 403. Cada rota possui título pt-BR sem dados pessoais.

PDF é uma minuta A4 com texto selecionável, fontes incorporadas, marcas fornecidas pela equipe e espaços para assinatura manuscrita/carimbo. Na conferência, naturalidade, filiação, curso e período são obrigatórios; campos de responsáveis são opcionais para preenchimento/carimbo em papel. Frequência inicia habilitada na conferência, com percentual individual e intervalo de apuração obrigatório; pode ser omitida para declaração apenas de vínculo. Não há frequência presumida, assinatura digital ou QR fictício. O modelo do subsequente continua indisponível até confirmação institucional.

Lote de impressão: checkbox por aluno e seleção indeterminada da página; ação separada para turma inteira, sem filtro textual. Seleção permanece visível e mantida entre páginas/turmas. O lote mostra contagem de selecionados/prontos; geração aguarda a conferência de todos. Uma página por aluno, com assinatura/carimbo dos dois responsáveis. Erros identificam a declaração sem apagar seus campos ou produzir PDF parcial. Curso, período, horários, intervalo de apuração e responsáveis podem ser reaproveitados explicitamente dentro da turma; percentual, filiação e naturalidade nunca são copiados. Campos pessoais ficam só na memória até sair da tela; navegação e alterações não salvas têm o dialog canônico de descarte. Ações reaproveitam buttons.css; faixas e listas planas usam tokens existentes, sem mudança de paleta ou composição.

## Do's and Don'ts

- Preservar escola e Pernambuco em header/footer, sem repetir símbolos em cada cartão.
- Usar a marca própria na navegação e a arte de Pernambuco como assinatura visual; evitar repetir uma logo gigante no conteúdo.
- Não reproduzir o layout do ZIP. Não reintroduzir cartões genéricos, bolhas e pills explicativas.
- Não inventar dados, notícias, cursos ou serviços funcionais.

## Revisão visual — 03/10/2026

Pedido da equipe: refazer o acabamento do site e portal; depois, validar apenas pelo código, sem navegador. A direção conserva Pernambuco e a identidade da escola, com marinho mais profundo, nova tipografia e arte de arcos compartilhada. Cabeçalho/rodapé escuros, sem placas brancas em torno das marcas: a imagem do governo usa tratamento monocromático por CSS. As imagens originais e suas proporções permanecem preservadas.

Botões: shared/styles/buttons.css continua canônico. Altura padrão 52px, fonte de corpo 16px/650, raio 12px, ação primária azul, secundária branca com borda, variante header translúcida em marinho. Exclusão usa variante danger. Menu mantém símbolo + nome. Perfil e fotos foram removidos. Compactos no celular mantêm alvos de pelo menos 44px. Hover, foco, pressionado, desabilitado e movimento reduzido pertencem ao componente compartilhado. CSS Modules compõem essas variantes e só ajustam geometria.

Nenhuma regra de cadastro, autorização, emissão de PDF ou banco foi alterada nesta revisão visual. A arte é decorativa (aria-hidden). O nome da escola e a bandeira continuam identificados. Conteúdo provisório e status de minuta permanecem explícitos. Auditoria estática, build e testes existentes são a verificação desta entrega; aparência e teclado não foram verificados em navegador por instrução da equipe.


## Solicitação e retirada — 03/10/2026

Perfil/fotos removidos de toda a aplicação. Cabeçalho preserva marca no centro real (colunas laterais iguais), menu à esquerda e navegação à direita. Título da solicitação, avisos vazios e nota final ficam centralizados; dados, formulários e listas mantêm leitura alinhada à esquerda. Ações usam buttons.css: padrão 52px, compactos 44px, ícones 44px; só geometria varia por contexto.

Aluno solicita sua matrícula e acompanha os últimos 20 pedidos. Enviar é idempotente enquanto há solicitação aberta; erro preserva o estado e admite nova tentativa. Uma atualização manual consulta o servidor sem cache. Nenhuma rota de PDF ou foto permanece disponível ao aluno.

Atendimento vê pedidos paginados (20), com filtro por status, abrir conferência e preparar impressão individual/lote. Gerar PDF após validação dos campos registra Em preparação nas solicitações abertas correspondentes ao mesmo aluno e matrícula. Não libera retirada automaticamente. Liberar retirada abre dialog nativo com foco em Ainda não está pronto e confirmação explícita de impressão/assinatura/carimbo. Erro mantém modal, confirmação e dados; envio em andamento impede duplicação ou fechamento. Status Pronta para retirada informa ao aluno que pode buscar na secretaria. A data e a conta responsável ficam no banco; campos pessoais do editor continuam só em memória.

Conta ativa e papel de atendimento são verificados no servidor. Acesso segue `secretary` existente enquanto a equipe define se também haverá gestor ou acesso exclusivo à gestão. Não atribuir papéis automaticamente. Modelo de impressão permanece em revisão institucional, sem assinatura eletrônica/QR. Testes verificam concorrência, isolamento, transições, confirmação e PDFs A4; revisão de navegador foi dispensada pela equipe.
