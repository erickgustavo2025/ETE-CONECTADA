# Cabeçalhos e cache

Site e portal usam uma política comum. Cada resposta HTML recebe um nonce novo,
aplicado pelo Next.js aos scripts autorizados. CSP e nonce recebidos do cliente
são substituídos nas páginas HTML. Autorização, sessão e verificação de origem continuam nos handlers.

A política recusa scripts inseridos no HTML sem autorização, manipuladores inline,
objetos e enquadramento por outra página. Usa `no-referrer`, `nosniff` e desabilita
câmera, microfone e geolocalização enquanto esses recursos não são necessários.
`strict-dynamic` permite dependências carregadas por JavaScript já autorizado;
não alimentar criação dinâmica de scripts com dados de usuário. CSP complementa
a validação e o tratamento seguro dos dados no código.

Em produção, a diretiva de scripts não permite `unsafe-eval` nem `unsafe-inline`.
Desenvolvimento habilita eval para o depurador e estilos inline para o Next dev,
conforme sua documentação. Estilos de atributo continuam disponíveis para medidas
e estados React; isso não libera scripts. Fontes e imagens locais são permitidas.

O nonce exige renderização por requisição. HTML/RSC e respostas privadas usam
`private, no-store`, inclusive o HTML do site público. Não reutilizar esse HTML em
cache do proxy/CDN. Imagens e arquivos estáticos conhecidos continuam no caminho
de cache do Next. Esse é o custo da política escolhida; medir a capacidade no
ambiente real antes de dimensionar a infraestrutura.

URLs com barra final mantêm o redirecionamento 308, agora com cache privado e os
mesmos cabeçalhos. O destino preserva caminho e consulta, usando `PORTAL_PUBLIC_URL`
no portal e `SITE_PUBLIC_URL` no site. Host/forwarded não escolhem o destino. Sem
configuração pública válida em produção, esse redirecionamento é recusado. Somente
desenvolvimento admite a origem local/LAN validada como auxílio.

As APIs JSON/PDF usam cabeçalhos estáticos restritivos e não passam pelo Proxy:
o Next duplica e aguarda o corpo quando executa esse componente. Isso impediria
a recusa antecipada de um upload ainda aberto. O helper `withApiCanonicalPath`
normaliza o endereço nas rotas, sem ler ou copiar o corpo; os headers de API também
cobrem erros do framework. Use esse helper nas novas rotas do portal. HSTS para
APIs/erros gerados fora das páginas deve ser conferido no proxy externo.

HSTS fica desativado por padrão. Somente configurar `HTTPS_VERIFIED=true` no
servidor de produção após verificar certificado, renovação, proxy e URL real.
A aplicação usa `max-age=15552000`, sem `includeSubDomains`. Cabeçalhos forwarded
recebidos não ligam HSTS. Erros e redirects produzidos pelo proxy externo também
precisam das políticas apropriadas na implantação. Acesso de produção segue
bloqueado até sua etapa de aprovação.

## Como verificar

- `test:security-headers`: páginas de entrada, 404, redirects e APIs recusadas;
  cache privado, nosniff/frame/referrer; nonce distinto, correspondente aos scripts
  SSR e resistente a cabeçalhos de nonce/CSP/prefetch/subrequest adulterados.
- `test:unit`: política por ambiente, nonce inválido, scripts restritos em produção
  e HSTS somente após confirmação explícita de TLS.
- `test:browser`: o proxy TLS próprio insere um script sem nonce no HTML,
  preservando a política original. O navegador deve bloqueá-lo e manter login,
  sessão e logout. Outra origem tenta enquadrar o portal e é recusada.
- A jornada de produção constrói e inicia site e portal sem arquivos de ambiente,
  banco ou credenciais de e-mail. Insere o mesmo tipo de script no HTML e confere
  o bloqueio, os scripts legítimos e a interação do campo de senha.

O laboratório usa certificado efêmero e loopback, sem alterar certificados ou
permissões globais. Uma prova negativa local retirou apenas a CSP da resposta:
o script inserido executou e a asserção de recusa reprovou. A fonte foi restaurada;
a versão enfraquecida não foi publicada.

Referências: [CSP no Next.js](https://nextjs.org/docs/app/guides/content-security-policy)
e [strict-dynamic na especificação CSP](https://www.w3.org/TR/CSP3/#strict-dynamic-usage).
