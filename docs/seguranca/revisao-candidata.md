# Revisão de segurança do candidato ao piloto

A revisão local de 18/11/2026 cobre autenticação, dados escolares, emissão e guarda de PDFs, consulta pública, e-mail, links entre site e portal e operação do banco. As evidências usam dados fictícios e os commits da fila de integração. A revisão em homologação precisa usar a versão que a equipe efetivamente escolher para o piloto.

## Controles conferidos

| Área                          | Evidência local                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessão e conta                | O servidor identifica a conta pela sessão e confere papéis sem aceitar essa informação do formulário. Os testes cobrem cookie ausente, adulterado, expirado ou revogado, senha antiga, origem incorreta e trocas concorrentes. [PR 85](https://github.com/erickgustavo2025/ETE-CONECTADA/pull/85)                                                                                                  |
| Dados e PDFs                  | O download exige a conta autorizada. A consulta com QR usa código aleatório, mostra dados mínimos e estado atual e não funciona como download. A emissão substitui o documento anterior somente após sucesso. Os testes cobrem as duas modalidades, isolamento, falha de escrita e cancelamento. [Emissão registrada](../emissao-registrada.md) · [Verificação pública](../verificacao-publica.md) |
| Banco e histórico             | O portal recusa credenciais administrativas e usa privilégios limitados. Eventos protegidos recusam edição, exclusão, limpeza e perda de vínculo por cascata. A restauração de 25 tabelas preservou dados e proteções. [PR 82](https://github.com/erickgustavo2025/ETE-CONECTADA/pull/82) · [Guia de migrações](../operacao/migracoes-release.md)                                                  |
| Cadastro, recuperação e envio | Os testes conferem respostas genéricas, limites, expiração e uso único de links. As mensagens SMTP foram entregues ao servidor fictício com TLS implícito e STARTTLS. Certificado inválido e conexão sem TLS foram recusados. [PR 84](https://github.com/erickgustavo2025/ETE-CONECTADA/pull/84)                                                                                                   |
| Conteúdo e navegação          | O build publicado exibe links para o outro serviço somente com origem HTTPS válida e configurada. Sem configuração, o site conserva o conteúdo da escola e omite as ações do portal. No desenvolvimento, o endereço explícito conserva a porta e a troca automática de host fica limitada às origens locais aceitas.                                                                               |
| Dependências e imagens        | A auditoria do lockfile sem dependências de desenvolvimento retornou zero. O pacote picomatch 4.0.7 continua apontado no conjunto de desenvolvimento. Os detalhes e o acompanhamento da versão compatível ficaram na EC129. As imagens da troca de conta passaram no ensaio de camadas, runtime e navegador. [Aviso do picomatch](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)               |

A bateria da troca de conta no commit `013cf94` passou integração PostgreSQL, restauração, 27 jornadas Chromium e duas imagens. A correção de navegação posterior recebeu uma verificação própria. A lógica de autorização, os arquivos PDF e as migrações dessa bateria são os mesmos no candidato desta revisão.

## Configuração para homologação

Configure a origem pública aprovada de cada serviço. O site recebe `NEXT_PUBLIC_PORTAL_LOGIN_URL` ao construir a imagem. O portal recebe `SITE_PUBLIC_URL` no servidor. Confira os destinos depois de publicar o ambiente autorizado. O roteamento local usa somente os endereços da demonstração.

Antes de liberar acesso, a equipe precisa conferir:

- Origem, TLS, cookies, redirects e rede privada com os endereços e segredos do ambiente aprovado.
- Banco com papéis separados, procedimento de migração e retorno, backup externo e revisão de acesso aos registros.
- Remetente verificado e recebimento do cadastro, recuperação e troca de e-mail em caixas de teste autorizadas.
- Leitura física dos QRs e modelos finais da escola. O domínio provisório e o ambiente de ensaio têm suas próprias validações.
- Revisão de Erick da versão integrada, correções verificadas e decisão registrada sobre pendências que afetem o piloto, inclusive o aviso de ferramenta de desenvolvimento.

Use o [guia de verificação por funcionalidade](verificacao-por-funcionalidade.md), o [procedimento de backup](../operacao/backup-restauracao.md) e o [guia de incidentes](../operacao/incidentes-e-manutencao.md) com as decisões da escola. O resultado local precede a validação da EC068 em homologação e a autorização de acesso da EC091.
