# Publicação das imagens no GHCR

O workflow [Publicar imagens no GHCR](../.github/workflows/publish-images.yml) envia ao GitHub Container Registry as imagens `site` e `portal` que o workflow de [Imagens Docker](docker.md) já construiu, testou e auditou. Ele **não reconstrói** nada: carrega os arquivos do [pacote verificado](artefato-release.md), confere os hashes e publica as mesmas imagens, byte a byte. Não faz deploy, não roda migrações e não toca no banco nem na VPS.

## Como publicar

1. Com a alteração já integrada na `main`, abra **Actions → Imagens Docker → Run workflow**, escolha a `main` e aguarde a aprovação. A execução manual é o que guarda o pacote.
2. Copie o número da execução (o final do endereço, `.../actions/runs/NÚMERO`).
3. Abra **Actions → Publicar imagens no GHCR → Run workflow**, escolha a `main`, cole o número e execute.

O pacote de ensaio expira em 3 dias. Se tiver expirado, repita o passo 1.

## O que é publicado

| Imagem                                          | Aplicação | Tags                            |
| ----------------------------------------------- | --------- | ------------------------------- |
| `ghcr.io/erickgustavo2025/ete-conectada-site`   | site      | `sha-<12 do commit>` e `latest` |
| `ghcr.io/erickgustavo2025/ete-conectada-portal` | portal    | `sha-<12 do commit>` e `latest` |

O resumo da execução lista o digest de cada imagem. Para voltar a uma versão anterior, use a tag `sha-…` correspondente em vez de `latest`.

## Verificações antes de publicar

O workflow só prossegue se a execução informada for de **Imagens Docker**, aprovada, iniciada manualmente na **main** deste repositório e se existir exatamente um pacote não expirado para esse commit. Depois baixa somente o artefato dessa execução, reprova divergência de digest, roda `scripts/release-artifact.py verify` (hashes, camadas, rótulos de commit e app, relatórios de vulnerabilidade, CI e segurança do mesmo commit) e confere que o ID da imagem carregada é o ID registrado em `release.json`.

## Permissões e segurança

- Usa o `GITHUB_TOKEN` temporário da execução, com `packages: write` somente neste job, mais `contents: read` e `actions: read`. Não usa PAT nem outros segredos.
- Só roda por execução manual a partir da `main`; PRs e branches não publicam.
- As imagens não contêm `.env`, banco nem credenciais. `DATABASE_URL`, e-mail e demais configurações entram ao iniciar o container, por mecanismo externo, como descrito em [Imagens Docker](docker.md).
- Publicar não libera o uso real: cadastro, login e operações de produção do portal continuam bloqueados pela própria aplicação.

## Primeira publicação e acesso sem login

O pacote nasce **privado**. Para a VPS baixar sem token nem conta, um administrador do repositório deve, depois da primeira execução:

1. Abrir o pacote no GitHub (**Packages** do perfil ou da página do repositório) e entrar em **Package settings**.
2. Se não aparecer conectado ao repositório, usar **Connect repository** e escolher este.
3. Em **Danger Zone → Change visibility**, escolher **Public**. Trate como decisão permanente e repita para o `site` e para o `portal`.

Uma imagem pública pode ser baixada por qualquer pessoa. O código-fonte do repositório continua privado, mas o código compilado das aplicações fica acessível. Por isso o conteúdo da imagem é conferido antes (veja [O que entra na imagem](docker.md)).

Na VPS, depois disso:

```bash
docker pull ghcr.io/erickgustavo2025/ete-conectada-site:latest
docker pull ghcr.io/erickgustavo2025/ete-conectada-portal:latest
```

Prefira a tag `sha-…` em implantações, para saber exatamente qual versão está no ar.
