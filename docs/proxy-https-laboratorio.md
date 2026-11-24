# Proxy e HTTPS em laboratório

Esta preparação encaminha site e portal por um proxy HTTPS em ambiente sintético. Não configura DNS público, não solicita certificados a uma autoridade pública e não libera acesso de produção. A escolha de hospedagem e domínio continua na EC-050; a conferência na VPS permanece parte da EC-082.

## O que está configurado

`compose.proxy-lab.yaml` complementa `compose.lab.yaml`. Ao combinar os arquivos, `ports: !reset []` remove as portas diretas dos dois apps. O banco continua sem porta publicada, em rede interna acessível somente pelo portal. O proxy participa apenas da rede web e publica duas portas **em 127.0.0.1**: HTTP para redirecionamento e HTTPS. Requer Docker Compose com suporte a `!reset`.

O laboratório usa `site.example.invalid` e `portal.example.invalid`, com uma CA temporária e certificado contendo os dois nomes. O teste resolve esses nomes somente nos clientes próprios. Não altera DNS, `/etc/hosts`, navegador pessoal ou certificados confiáveis do computador. As chaves e conexões fictícias ficam fora do contexto de build, em diretório temporário 0700 e mounts somente leitura; os usuários não root dos containers precisam conseguir ler esses mounts.

O Caddy recusa divergência entre SNI e Host. HTTP só redireciona os dois hosts permitidos, usando destinos fixos. Os cabeçalhos encaminhados de host e protocolo são sobrescritos; `Forwarded` e `X-Real-IP` do cliente são removidos, e a política padrão do Caddy descarta o `X-Forwarded-For` enviado pelo cliente. Não há CDN confiável configurada. As origens canônicas dos apps correspondem ao HTTPS do laboratório.

O limite externo de upload é 3 MiB, compatível com o JSON da importação de arquivos de até 2 MiB. As rotas mantêm seus limites menores, conferência de origem e autorização. Cabeçalhos têm limite de 16 KiB e prazo de 5 segundos; o corpo tem prazo total de 60 segundos e de inatividade de 10 segundos. Esses valores precisam ser reavaliados no piloto com a conexão da escola. O proxy não faz buffering completo do corpo nem retira a autorização do servidor.

HSTS é enviado somente na entrada HTTPS deste laboratório, sem `includeSubDomains` ou preload. CSP com nonce e demais cabeçalhos dos apps são preservados. O endpoint administrativo do Caddy está desligado; HTTP/3 e publicação UDP não são habilitados. Não há access log configurado. Operação e observabilidade futuras devem evitar dados pessoais em URLs e registros.

## Por que o proxy é compilado

A imagem oficial Caddy 2.11.7 consultada em 19/10/2026 continha Go 1.26.8 e `golang.org/x/net` 0.59.0. A auditoria identificou quatro ocorrências HIGH, correspondentes a três avisos: [GO-2026-6607](https://pkg.go.dev/vuln/GO-2026-6607), [GO-2026-6609](https://pkg.go.dev/vuln/GO-2026-6609) e [GO-2026-6611](https://pkg.go.dev/vuln/GO-2026-6611). Tratam de consumo excessivo de recursos em TLS/HTTP, incluindo HTTP/2; não foram descartadas por serem dependências.

`infra/caddy/Dockerfile` usa Go 1.26.10 oficial fixado por digest e Caddy 2.11.7 com `x/net` 0.62.0. A revisão do Go corrige [GO-2026-6809 / CVE-2026-111943](https://pkg.go.dev/vuln/GO-2026-6809), encontrado na auditoria do binário durante a conferência local de 23/10/2026. A entrada segue a [compilação oficial](https://caddyserver.com/docs/build), com os módulos padrão, sem plugins adicionais. `go.mod` e `go.sum` registram o grafo e os checksums; o build usa modo readonly e não atualiza dependências. O checksum database do Go permanece habilitado. A imagem final contém o binário estático, certificados raiz, licenças e metadados de build; não leva o compilador, shell ou gerenciador de pacotes. Roda com UID/GID 1000, filesystem somente leitura, todas as capabilities removidas e limites de memória, CPU e processos.

Em 24/11/2026, a auditoria do CI identificou [CVE-2026-78661](https://avd.aquasec.com/nvd/cve-2026-78661), negação de serviço por HTML malformado em `golang.org/x/net/html`, na versão 0.60.0 do binário. O `x/net` passou para 0.62.0, versão corrigida indicada pelo scanner; `x/crypto`, `x/sync`, `x/sys`, `x/term` e `x/text` subiram juntos, por exigência do novo `x/net`. O Caddy permanece 2.11.7.

Em 28/10/2026, a base atualizada identificou [CVE-2026-116587](https://github.com/go-jose/go-jose/security/advisories/GHSA-mgcc-cww5-fp2q) nas duas versões transitivas de `go-jose`. A v4 passou para 4.1.6. Como não há release v3 corrigida e a migração da dependência Smallstep muda APIs, a v3 usa uma cópia local temporária com os limites de módulo RSA e produto dos primos do patch oficial, antes de `rsa.PrivateKey.Validate`. A API v3 foi preservada. [Proveniência, licença e condição de remoção](../infra/caddy/third_party/go-jose-v3/BACKPORT.md) acompanham o fonte; somente `jwk.go` difere entre os 28 arquivos Go originais de runtime. O build executa regressões com chaves sintéticas válidas e parâmetros malformados. A cópia local pode ser opaca para scanners de versão: resultado vazio do scanner sozinho não comprova a correção; comparação do fonte, testes da biblioteca e ensaio real do proxy também são necessários.

O CI audita a imagem reconstruída e falha diante de HIGH/CRITICAL. A auditoria não garante ausência de outras falhas. Reavaliar a necessidade dessa compilação quando uma imagem oficial incorporar as correções; não manter um fork do servidor ou ignorar novos alertas para conservar um build verde.

## Verificação automatizada

No runner descartável, após instalar as dependências de teste e Chromium, execute:

```bash
bash .github/scripts/test-compose-lab.sh
```

O comando constrói os apps, testa persistência e depois aplica o proxy ao mesmo projeto sintético. A conferência inclui:

- Configuração positiva e 12 alterações inseguras recusadas; validação do Caddy real.
- Auditoria da imagem final do proxy.
- Contexto de build com canários de env, planilha e chave que precisam ficar de fora.
- Inspeção real de portas, usuários, filesystem e redes dos quatro containers.
- TLS com CA e nome conferidos; cliente sem a CA recusa a conexão.
- Hosts e cabeçalhos forjados; redirects canônicos e rejeição de origem externa.
- API privada sem sessão ou com cookie inventado continua negada; login de produção permanece bloqueado.
- Upload no limite e acima dele, com tamanho declarado e transferência chunked; cabeçalho grande recusado e cabeçalho lento encerrado. Um controle negativo real amplia o limite e precisa reprovar o mesmo teste antes de restaurar a configuração.
- Três passagens obrigatórias do navegador nos dois apps, contexto HTTPS, fontes, scripts, CSP e interação do formulário. Antes das jornadas, exige dois segundos contínuos de interfaces, rotas e DNS estáveis no runner Linux, depois da recriação dos containers e da abertura do navegador. Mudanças reiniciam essa janela; instabilidade por 12 segundos impede o início. Não altera a rede, ignora erros ou repete jornadas reprovadas. Console e recursos recusados continuam reprovando o teste, com diagnóstico sem consultas de URL ou dados pessoais.
- Novo certificado assinado pela CA do teste, novo container de proxy e fingerprint diferente conferido pelos dois endereços.

O backend que mede cabeçalhos e bytes é iniciado por stdin dentro do container sintético do site, numa porta não publicada. Durante essa medição, a configuração de teste muda somente o upstream do site; depois restaura o arquivo versionado e confere os apps reais. Nenhuma rota de diagnóstico é adicionada às aplicações. O cleanup confere identificação dos recursos antes de remover apenas o projeto e volume próprios, inclusive após falha.

O teste do navegador permite exclusivamente a chave pública do certificado temporário pelo SPKI; as requisições técnicas validam CA, nome e fingerprint sem desativar verificação TLS. Não instalar essa CA no computador.

O Next pode cancelar o pré-carregamento opcional de cadastro e recuperação quando a navegação muda. Somente `ERR_ABORTED` de GET/fetch dessas duas rotas na origem do portal, identificado pelos cabeçalhos de prefetch RSC, é classificado como cancelamento esperado. Isso não aceita falha de imagem, script, navegação, resposta HTTP de erro ou `ERR_NETWORK_CHANGED`. Os casos contrários têm testes próprios e os erros de console continuam reprovando a jornada.

## O que falta para a infraestrutura real

Confirmar titularidade do domínio, provedor e acessos; publicar e conferir os registros A/AAAA; restringir firewall às entradas necessárias e impedir acesso direto aos apps/banco. Configurar certificados públicos e persistência protegida do estado ACME, testar emissão, renovação e alertas na hospedagem aprovada. O ensaio de troca de certificado temporário **não comprova renovação ACME pública**.

Conferir limites com arquivos e conexão representativos, revisar confiança em proxies adicionais e validar o fluxo homologado sem remover os bloqueios de produção prematuramente. Registry, distribuição da imagem de proxy, deploy e rollback seguem suas etapas próprias. Esta entrega não contrata serviços nem altera recursos externos.

Referências: [merge e reset do Compose](https://docs.docker.com/reference/compose-file/merge/), [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [limite de corpo](https://caddyserver.com/docs/caddyfile/directives/request_body), [opções de servidor](https://caddyserver.com/docs/caddyfile/options) e [HTTPS automático](https://caddyserver.com/docs/automatic-https).
