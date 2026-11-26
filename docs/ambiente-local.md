# Ambiente local da equipe

Use este caminho para editar o projeto e experimentar o primeiro acesso, o painel da secretaria e as declarações. O PostgreSQL roda no Docker. O site e o portal rodam a partir do código, com atualização ao editar os arquivos.

## Primeira vez

Instale o Node.js 24 da versão indicada em [`.nvmrc`](../.nvmrc) e inicie o Docker com Compose V2. No Windows, use Bash no WSL com a integração do Docker Desktop ativa.

Na raiz do clone, rode:

```bash
npm ci --ignore-scripts
bash scripts/dev-local.sh preparar
```

O segundo comando sobe o PostgreSQL em `127.0.0.1:55432`, cria o banco identificado da equipe, aplica as migrações e prepara a credencial limitada do portal. Também carrega a Turma DevOps e os [acessos de demonstração](testes-isolados.md#acessos-fixos-para-demonstração-local). Cada clone guarda suas credenciais em `tasks/dev-equipe` e usa seu próprio volume do Docker.

## Abrir e testar

Em dois terminais, na raiz:

```bash
bash scripts/dev-local.sh site
bash scripts/dev-local.sh portal
```

Cada comando fica rodando no seu próprio terminal.

| Tela            | Endereço                                         | Como testar                                                                                                                             |
| --------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Site            | [Abrir site](http://127.0.0.1:3000)              | Use o link de acesso ao portal.                                                                                                         |
| Primeiro acesso | [Abrir cadastro](http://127.0.0.1:3001/cadastro) | Escolha uma linha da [Turma DevOps](turma-devops.md#dados-para-primeiro-acesso), preencha os dados e confirme pelo link na tela.        |
| Secretaria      | [Abrir login](http://127.0.0.1:3001/login)       | Use a [conta fictícia da secretaria](testes-isolados.md#acessos-fixos-para-demonstração-local) para abrir turmas, alunos e declarações. |

Os dez alunos DevOps são do Integrado e estão disponíveis para criar conta. Para testar importação ou turmas do Subsequente, use uma planilha fictícia. O ambiente usa confirmação na tela para o primeiro acesso. A recuperação e a troca de e-mail por mensagem exigem um remetente configurado.

## Retomar no dia seguinte

- Pare o site e o portal com `Ctrl+C` nos terminais. Use `bash scripts/dev-local.sh parar-banco` para parar o PostgreSQL e manter as contas no volume.
- Para retomar após parar o banco, execute `bash scripts/dev-local.sh preparar` e abra os dois aplicativos de novo. A carga reaproveita os registros e preserva as senhas existentes.
- Se a porta do banco estiver ocupada na primeira preparação, use `ETE_DEV_DB_PORT=55433 bash scripts/dev-local.sh preparar`. Se o site ou o portal precisar de outra porta, forneça os mesmos valores de `ETE_DEV_SITE_PORT` e `ETE_DEV_PORTAL_PORT` nos dois terminais.

## Usar as imagens do GHCR

As [imagens do GHCR](publicacao-ghcr.md) servem para executar o site e o portal já compilados. O PostgreSQL roda à parte, com as próprias credenciais e migrações. Para conferir as imagens em modo de produção, use o [laboratório com Compose](compose-laboratorio.md). Para testar login nesse modo, configure também HTTPS e e-mail conforme o [guia do portal](../apps/portal/prisma/README.md#acesso-à-secretaria).
