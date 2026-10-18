# Imagens Docker

Site e portal têm imagens separadas, construídas pelo `Dockerfile` da raiz. Elas usam Node 24 e o servidor standalone do Next.js. Não é preciso instalar dependências ao iniciar o container.

O portal continua com cadastro, login e operações de produção bloqueados. Este empacotamento permite conferir a versão de produção com segurança; a liberação para alunos, o banco definitivo, o domínio e o deploy seguem suas etapas próprias. O healthcheck confirma que a página inicial responde, sem atestar conexão com banco ou autorização de uso real.

## Construir

Na raiz, com Docker e BuildKit disponíveis:

```bash
docker build --target site -t ete-site:local .
docker build --target portal -t ete-portal:local .
```

A origem do link de acesso ao portal no site é um valor público gravado no build. Para usar uma URL diferente, informe-a ao construir o site:

```bash
docker build --target site \
  --build-arg NEXT_PUBLIC_PORTAL_LOGIN_URL=https://portal.example.invalid/login \
  -t ete-site:local .
```

Troque o endereço de exemplo pelo aprovado para a instalação. Alterar esse valor depois exige outro build. Não envie senhas, tokens ou conexões de banco por argumentos de build.

As configurações privadas e as origens `SITE_PUBLIC_URL` e `PORTAL_PUBLIC_URL` são fornecidas ao iniciar, por mecanismo externo. Fora de desenvolvimento, as origens configuradas precisam usar HTTPS. `HTTPS_VERIFIED=true` só deve ser usado depois de conferir o HTTPS real do proxy. Não inclua arquivos `.env` na imagem.

## O que entra na imagem

A `.dockerignore` permite apenas código, manifests, arquivos de configuração necessários e recursos visuais. Exclui configurações locais, planilhas, backups, dumps, logs, chaves e saídas de desenvolvimento. O cliente Prisma é gerado durante o build. O tracing parte da raiz do monorepo para incluir dependências e compartilhados; fontes do PDF, imagem institucional e o leitor XLS têm conferência específica.

Em `public`, somente os ícones e as marcas listados entram no contexto. Ao acrescentar um recurso público aprovado, inclua seu caminho na lista e confira o resultado. Um arquivo novo colocado nessa pasta não deve entrar silenciosamente na imagem.

`public` e `.next/static` são copiados para cada aplicação, com as licenças das fontes preservadas. O diretório de trabalho do portal mantém os caminhos usados pelo gerador de PDF. O runtime usa o usuário `node`; npm e Yarn ficam fora dele. O início não executa seed nem migrações.

A base oficial é fixada por tag e digest. Mudanças devem passar novamente por build, testes de runtime e auditoria. `npm ci --ignore-scripts` usa o lockfile, incluindo as dependências opcionais da plataforma, necessárias ao Sharp. O builder também usa o usuário `node` e não recebe credenciais de produção.

## Testar sem dados reais

Em Linux x64, com Node 24, Python 3, curl e Docker disponíveis:

```bash
npm ci --ignore-scripts
node node_modules/@playwright/test/cli.js install --with-deps chromium
bash .github/scripts/test-containers.sh
```

O teste usa o commit `HEAD`, copiado para uma pasta temporária, sem ler os arquivos locais ignorados. Inclui arquivos fictícios com um marcador para provar que a `.dockerignore` os exclui. Uma imagem negativa demonstra que apagar um arquivo depois de copiá-lo não o remove da camada anterior. As duas imagens finais são verificadas em todas as camadas e na configuração.

Os containers de teste têm sistema de arquivos somente leitura, cache temporário limitado, capabilities removidas, restrição de processos/memória/CPU e portas publicadas somente em loopback. Conferem scripts, imagens, fontes, conversão nativa pelo Sharp, XLS com zero inicial e bloqueios de produção, inclusive com cookie e papel forjados. O navegador confere fontes, hidratação e tela pequena. Um destino TCP fictício detecta tentativas indevidas de consultar banco durante os pedidos bloqueados.

O scanner de vulnerabilidades é fixado e verificado por checksum; achados altos ou críticos nas imagens finais reprovam o teste. Somente os containers e imagens identificados como pertencentes à execução são removidos. O teste não inicia PostgreSQL, não cria volumes e não envia e-mail. A publicação em registry, Compose, backup e deploy são entregas separadas.

O workflow [Imagens Docker](../.github/workflows/images.yml) executa o mesmo procedimento em runner isolado. Não precisa de segredos nem de permissão de publicação. Os testes funcionais e a análise de código existentes continuam no CI.

## Avaliação da base

Na seleção de 18/10/2026, a base oficial Alpine apresentou menos pacotes e nenhum alerta alto/crítico do sistema operacional no scanner usado. As variantes Debian Bookworm e Trixie apresentaram alertas adicionais. A escolha exige conferir compatibilidade real com musl: o teste executa o Sharp dentro de cada imagem, além de conferir os arquivos usados pelo PDF e pelo XLS. A plataforma validada neste procedimento é Linux x64.

Os alertas do npm incluído na base pertencem à ferramenta descartável de build. O portal não importa essa instalação global, e ela é removida do runtime. O build não serve requisições de alunos nem recebe suas planilhas, credenciais ou cookies; usa argumentos fixos e dependências do lockfile. Isso não dispensa atualizar a base e rever os alertas das ferramentas de build. A auditoria da imagem final e a revisão de segurança antes da produção continuam obrigatórias.

Referências: [standalone e tracing no Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [boas práticas Docker](https://docs.docker.com/build/building/best-practices/), [binários e plataformas do Sharp](https://sharp.pixelplumbing.com/install/) e [auditoria de imagens no Trivy](https://trivy.dev/docs/latest/target/container_image/).
