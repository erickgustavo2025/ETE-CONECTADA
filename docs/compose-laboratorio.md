# Laboratório com Compose

O `compose.lab.yaml` prepara um ensaio com site, portal e PostgreSQL 16 separados. É uma referência testável para a próxima etapa de infraestrutura. A hospedagem definitiva, o tamanho do servidor, os destinos de backup e a aplicação na VPS ainda dependem das decisões da equipe. Não use esta configuração como implantação aprovada de produção.

O portal mantém os bloqueios de produção: as páginas de entrada podem ser conferidas, mas o laboratório não libera cadastros nem acesso de alunos reais. Não importa planilhas, não envia e-mail e não executa migrações ou seed ao iniciar.

## O que está separado

- Site e portal usam as imagens da EC080 e executam como usuário sem privilégios, com filesystem somente leitura e caches temporários limitados.
- O site participa somente da rede web. O portal também participa da rede interna do banco. O banco não publica porta no host.
- Somente o banco usa volume persistente. Os caches dos apps podem desaparecer sem perda de dados escolares; documentos finais persistidos terão sua própria decisão de guarda.
- Senha e conexão são arquivos externos, concedidos somente ao serviço que precisa deles. Não são argumentos de build nem valores gravados no Compose. O site não recebe segredo de banco.

As portas de exemplo dos apps são `127.0.0.1:3100` e `127.0.0.1:3101`. Elas não publicam o serviço na rede local. Proxy, domínio e HTTPS reais são etapas separadas. Os limites de CPU/memória/processos são conservadores para este ensaio e precisam ser revistos no servidor contratado.

## Executar a verificação completa

Em Linux x64, com Docker/Compose, Node24, Python3 e as dependências do projeto:

```bash
npm ci --ignore-scripts
node node_modules/@playwright/test/cli.js install --with-deps chromium
bash .github/scripts/test-compose-lab.sh
```

O teste cria um projeto com identificador aleatório, gera credenciais exclusivamente fictícias e usa portas livres em loopback. Valida a configuração, constrói as imagens, inicia os serviços e grava um marcador no PostgreSQL. Em seguida recria os containers, exige a preservação do mesmo volume e do marcador e consulta o marcador a partir do container do portal pela rede interna e pelo segredo externo. Também confere navegador, redes, saúde e ausência de senha nos metadados dos containers. Por fim remove somente o projeto, volume, imagens e arquivos temporários que criou.

**O volume desse teste é descartável.** Não aponte o script para dados existentes e não use suas credenciais em outro ambiente. Uma rotina de backup/restauração é uma entrega diferente: persistência após recriação não substitui backup. O ensaio no CI utiliza um runner isolado; não depende do Docker Desktop do notebook estar ligado.

## Configuração por arquivo

O início do servidor standalone aceita `DATABASE_URL_FILE`, apontando para um arquivo externo montado em `/run/secrets`. Ele lê no máximo 4096 bytes, aceita uma URL PostgreSQL de uma linha e passa a conexão ao servidor no mesmo processo. Arquivo ausente/vazio/inválido, arquivo excessivo ou uso simultâneo com `DATABASE_URL` interrompem o início com mensagem sem conteúdo nem caminho do segredo. O uso existente de `DATABASE_URL` permanece disponível quando não houver `DATABASE_URL_FILE`.

Compose monta arquivos secretos; a convenção `_FILE` precisa ser implementada por cada aplicação. A imagem oficial PostgreSQL já oferece `POSTGRES_PASSWORD_FILE`. O portal passa a implementar apenas `DATABASE_URL_FILE`. Isso não adiciona suporte implícito a SMTP, Resend ou outros nomes terminados em `_FILE`.

No teste, os arquivos fictícios têm leitura permitida aos usuários dos containers, dentro de diretório temporário 0700 no host. Para uma instalação real, é preciso provisionar arquivos fora do contexto de build, restringir seu acesso aos responsáveis e verificar a leitura pelo UID do serviço. Compose não transforma arquivos locais em um cofre criptografado; administradores do Docker continuam capazes de acessar os recursos. Não imprima conteúdo, conexão nem configuração com segredos em logs.

O usuário PostgreSQL do laboratório serve somente ao marcador sintético. Roles de aplicação/migração, backups, restauração, monitoração, retenção e operação de produção ainda devem ser definidos e verificados nas etapas próprias. A troca do conteúdo do arquivo de senha não altera automaticamente a senha já persistida pelo PostgreSQL.

Referências: [segredos no Compose](https://docs.docker.com/compose/how-tos/use-secrets/), [redes](https://docs.docker.com/compose/how-tos/networking/) e [ordem de inicialização](https://docs.docker.com/compose/how-tos/startup-order/).
