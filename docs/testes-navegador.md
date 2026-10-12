# Testes reais do portal no navegador

`npm run test:browser` executa Playwright Test com Chromium headless e o portal iniciado pelo mesmo harness seguro dos demais testes HTTP. A suíte cobre primeiro acesso, retomada de conta pendente com renovação de link, invalidação do link anterior, confirmação, login/logout e proteção da rota inicial; também cobre solicitação de declaração, login da secretaria, preparação e download de um PDF A4, confirmação explícita de retirada e acompanhamento pelo aluno.

## Preparação

Siga **Preparar o banco** em [testes-isolados.md](testes-isolados.md) para criar um PostgreSQL novo, descartável, local e identificado. Exporte `NODE_ENV=test`, `ALLOW_TEST_DATABASE_WRITES=true`, `TEST_DATABASE_URL`, `TEST_DATABASE_NAME` e `TEST_DATABASE_ID`. A guarda recusa URL remota, `TEST_BASE_URL`, nomes incorretos, marcadores ausentes e qualquer banco cuja identidade não corresponda ao UUID informado. Nunca aponte para Neon, banco de demonstração ou base da escola.

Instale dependências com `npm ci --ignore-scripts` e baixe o navegador oficial uma vez:

```bash
npx playwright install chromium
```

Em seguida, execute as suítes HTTP sem outro `next dev` na pasta, pois o harness inicia seu próprio portal:

```bash
npm run test:browser
```

O comando não reutiliza servidor existente. Os testes rodam em um único worker para evitar concorrência no banco e em `.next/dev`; não repetem automaticamente falhas. Timeout individual é três minutos e limite total, seis minutos. Os resultados transitórios usam diretório UUID em `/tmp`; a captura de vídeo, screenshot, trace e armazenamento de sessão ficam desligados.

Os registros criados são exclusivamente sintéticos, usam endereços `.invalid` e são removidos por ID em `finally`. O PDF é baixado no diretório temporário administrado pelo Playwright e o conteúdo é verificado pelo cabeçalho `%PDF-`. O harness bloqueia chaves de e-mail externo e inicia o portal em loopback, sem encaminhar os logs do servidor. Se o processo for encerrado à força, descarte o banco descartável inteiro.

Esses testes verificam o comportamento do protótipo em desenvolvimento. Não homologam o modelo institucional da declaração, a comprovação de titularidade do cadastro ou autenticação/emissão em produção.

O carregador `tsx` já usado nos demais testes preserva os imports ESM do harness durante a execução do Playwright. Após o login, o teste espera a navegação e o botão do menu habilitado antes de acioná-lo. Os botões de abertura ficam desabilitados até o portal estar pronto para receber a ação. As asserções conferem a interface, sem depender de ausência total de tráfego na rede. O reporter imprime apenas nomes fixos dos casos, status e localização de falha; não publica o contexto completo nem anexos.

A suíte também verifica teclado, rótulos, contraste, modais, estados vazio/erro/carregando e reflow em telas pequenas. O editor e a confirmação de retirada participam do atendimento em 320 pixels. Veja o roteiro de revisão em [Acessibilidade e telas pequenas](acessibilidade.md).
