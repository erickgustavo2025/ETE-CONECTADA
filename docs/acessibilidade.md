# Acessibilidade e telas pequenas

Os testes de navegador conferem o primeiro acesso, login, menu e atendimento de declarações com dados fictícios. Eles verificam rótulos, mensagens de erro, carregamento, foco dos modais e retorno ao botão que os abriu.

O atalho **Ir para o conteúdo** leva o foco ao conteúdo principal no site e no portal. Os campos usam bordas visíveis, texto de exemplo com contraste e indicação de erro ligada ao campo. O foco fica azul sobre superfícies claras e amarelo nos links do cabeçalho escuro.

## Como conferir uma alteração

Execute `npm run test:browser` seguindo a preparação do [banco isolado](testes-isolados.md). Não use o banco real da escola. Os testes passam por larguras de 320, 640, 768, 1024 e 1440 pixels; o editor também participa do atendimento em 320 pixels. As larguras de 640 e 320 pixels conferem reflow equivalente a uma janela de 1280 pixels com ampliação de 200% e 400%, respectivamente.

Na revisão do PR, confira também:

- Use Tab e Shift+Tab para percorrer as ações, Enter para acioná-las e Escape para fechar os modais. O foco deve aparecer e voltar ao botão de abertura.
- Abra o site, login, cadastro, solicitação do aluno e editor da secretaria no celular e no computador. Confira textos, ações, rolagem do modal e as marcas institucionais.
- Amplie o navegador em 200% e 400%. Os testes de reflow não substituem essa avaliação visual, nem testes com leitor de tela e outros navegadores.
- Confira uma consulta vazia, um erro e uma operação em andamento. As mensagens precisam explicar o que aconteceu e permitir tentar novamente.

Na revisão de 12/10/2026, o Chromium comprovou um problema no atalho de conteúdo, corrigido com um destino que recebe foco. O contraste do indicador de foco sobre o fundo dos campos passou de 2,74:1 para 6,02:1; o texto de exemplo passou de 3,57:1 para 5,15:1. A borda normal dos campos tem contraste mínimo de 3:1. Esses números se referem às combinações verificadas; não constituem certificação de conformidade de todas as telas.

As capturas da conferência visual ficam localmente. O CI continua com relatório sanitizado, sem publicar imagens, vídeo ou documentos dos alunos. A avaliação visual da equipe permanece parte da revisão.
