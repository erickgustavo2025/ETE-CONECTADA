# Conferir a saúde dos serviços

A conferência responde se o site e o portal estão acessíveis, se o portal consegue chegar ao banco com a própria credencial e se disco, backup ou certificados precisam de atenção. Ela roda em um terminal autorizado e não acrescenta um endereço público ao sistema.

## Executar a conferência

Forneça as configurações por meio do ambiente do operador. Reserve o segredo do banco a um processo na rede autorizada. Rode o comando na instalação do código que fornece as permissões daquela versão do portal.

| Variável                    | Uso                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `OPS_SITE_ORIGIN`           | Origem do site. O comando consulta a página inicial.                                          |
| `OPS_PORTAL_ORIGIN`         | Origem do portal. O comando consulta a página de login.                                       |
| `OPS_DB_URL`                | Conexão limitada do portal. O comando confere o papel e faz uma consulta sem dados escolares. |
| `OPS_FILESYSTEM`            | Diretório do volume que precisa ser acompanhado pelo operador.                                |
| `OPS_DISK_MIN_FREE_PERCENT` | Percentual mínimo de espaço livre acordado para esse volume.                                  |
| `OPS_BACKUP_RECEIPT`        | Arquivo protegido que a rotina de backup atualiza depois da verificação da cópia.             |
| `OPS_BACKUP_MAX_AGE_HOURS`  | Idade máxima do último backup verificado, conforme a rotina aprovada.                         |
| `OPS_TLS_MIN_DAYS`          | Dias de antecedência necessários para a equipe renovar os certificados.                       |

As origens usam HTTPS, sem usuário, senha ou caminho. HTTP em loopback é aceito no ensaio local. Nesse caso, a checagem de certificado registra o estado `local`. Cada verificação de rede tem limite de espera. Os comprovantes usam JSON com o campo `verifiedAt` no formato ISO UTC emitido por `Date.toISOString()`. Configure a rotina de backup para registrar essa data somente após verificar a cópia, conforme o [procedimento de backup](backup-restauracao.md).

```sh
npm --silent run ops:health --workspace @ete-conectada/portal
```

A saída tem uma linha JSON por checagem e um identificador comum à execução. Cada linha mostra o horário, a checagem, o estado e um código de resultado. Falhas produzem saída 1. A saída contém somente os campos fixos da checagem, sem endereços, respostas HTTP, credenciais ou dados escolares.

## Tratar alertas

| Checagem       | Ação inicial                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site ou portal | Confirme se a falha ocorre pela origem configurada. Confira o proxy, a saúde do serviço e a última atualização.                                             |
| Banco          | Confira a rede privada, o estado do PostgreSQL e o papel associado à imagem. Use o [guia de release](migracoes-release.md) se ocorreu uma migração recente. |
| Disco          | Confira crescimento do volume e espaço disponível. Preserve os dados e cópias conforme a política de retenção aprovada.                                     |
| Backup         | Identifique a última cópia verificada e a falha da rotina. Confira a cópia externa e ensaie a [restauração](backup-restauracao.md) quando indicado.         |
| TLS            | Confira a origem, a cadeia e a renovação do certificado. Mantenha a validação da conexão habilitada.                                                        |

O comando pode ser executado pelo monitor escolhido pela equipe, com prazo máximo para a execução e acesso restrito aos resultados. Na homologação, confirme quem recebe cada alerta, o destino e o período de retenção desses eventos. A agenda, o canal de alerta e os limites definitivos serão configurados no ambiente aprovado.

## Ensaio local

Em banco descartável migrado e identificado, `npm run test:operational-health --workspace @ete-conectada/portal` confere HTTP e TLS em loopback. O ensaio simula resposta 503 do portal, papel de banco com permissões incompatíveis, disco abaixo do limite, backup atrasado e certificado perto de vencer. Depois de corrigir as condições do ensaio, o comando volta a indicar operação normal. O teste também verifica que o resultado não inclui o conteúdo entregue pelo serviço ou a string de conexão.
