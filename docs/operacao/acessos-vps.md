# Acessos e manutenção da VPS

Procedimento preparado para a EC-083. **Ainda não aplicado nem validado em uma VPS.** Contratação, sistema operacional, responsáveis e recuperação dependem da EC-050. Containers não substituem a conferência de SSH, firewall ou reinício do host.

## Antes de configurar

Confirmar autorização, distribuição/versão suportada, console do provedor e quem pode recuperar a conta. Guardar MFA e códigos de recuperação em local institucional protegido, separado do servidor. Testar o console antes de restringir acesso remoto. Combinar janela de manutenção e substituto.

Manter inventário privado com os campos abaixo. Não preencher nomes, endereços, chaves ou credenciais neste repositório.

| Campo            | Registro necessário                                     |
| ---------------- | ------------------------------------------------------- |
| Pessoa e vínculo | Quem autorizou e até quando o acesso é necessário       |
| Conta e papel    | Consulta, operação, deploy ou administração do host     |
| Autenticação     | Referência protegida da chave pública e MFA do provedor |
| Permissões       | Recursos concedidos e motivo                            |
| Recuperação      | Titular, substituto e procedimento testado              |
| Revisão          | Data, evidência privada e revogações                    |

Usar contas individuais. A conta da secretaria no portal não concede acesso ao servidor. Separar operação, migração, backup e administração; conceder somente o necessário. Grupo `docker`, socket ou comandos Docker via sudo dão poder administrativo e exigem essa aprovação. Não compartilhar senha ou chave privada.

## SSH sem perder o acesso

1. Criar a conta autorizada e instalar sua chave pública. A privada fica protegida com o titular, nunca no servidor, Git ou Trello.
2. Conferir a identidade do host por canal do provedor. Não desabilitar essa verificação para contornar divergências.
3. Manter console e sessão administrativa abertos. Em uma segunda sessão, testar a nova conta e suas permissões.
4. Preparar autenticação por chave, recusa de login direto de root e desativação dos métodos de senha aprovados. Conferir arquivos incluídos e blocos `Match` antes de afirmar qual política está efetiva.
5. Validar antes de recarregar: em Ubuntu/OpenSSH, `sudo sshd -t` e `sudo sshd -T`, com contexto de conexão quando houver `Match`. Seguir a distribuição para nome do serviço e recarga.
6. Abrir outra conexão; provar acesso autorizado e recusa do proibido. Só depois fechar a sessão antiga.

Se sintaxe, conexão nova ou console falhar, interromper e recuperar a configuração anterior pelo acesso aberto. Não aplicar essas configurações no notebook.

## Rede e firewall

Inventariar serviços e regras do host/provedor, incluindo IPv6. Permitir SSH somente das origens administrativas aprovadas e entradas do proxy necessárias ao HTTPS escolhido. Conferir a porta SSH real antes de ativar recusa por padrão. Apps, banco, painéis e socket Docker não recebem portas públicas.

**Publicação de portas Docker pode contornar o UFW.** Conferir backend real (iptables/nftables) e regras de encaminhamento. Não desativar a gestão de firewall do Docker nem apagar suas chains. De uma máquina externa autorizada, testar IPv4/IPv6: entradas aprovadas acessíveis; apps/banco/admin recusados. Listagem local ou teste dentro de container não substitui essa prova. O [laboratório HTTPS](../proxy-https-laboratorio.md) usa loopback e não é uma implantação pública.

## Atualizações e retorno

Definir responsável e janela para SO, Docker e imagens; registrar versões, backup utilizável e teste de retorno. Em Ubuntu, conferir origens e simular `sudo unattended-upgrade -v --dry-run` antes de aprovar a política. Considerar reinícios de serviços e de host; atualização automática pode reiniciar serviços sem reiniciar o servidor.

Depois, conferir console/SSH, serviços, disco, backup, HTTPS e testes de saúde/bloqueio. Diante de falha, suspender promoção e usar recuperação aprovada. Voltar imagem não desfaz migrações. Não liberar login de produção para fazer smoke passar.

## Perda ou saída

O substituto usa o console autorizado para revogar chave, conta, sessões e acessos no provedor, host e pipeline. Rotacionar segredos acessíveis ao titular, inclusive cópias fora do servidor. Conferir que a chave antiga falha e a substituta funciona; revisar tarefas que dependiam da conta revogada. Registrar sem segredos e atualizar inventário. Suspeita de comprometimento exige também preservar evidências e avaliar o alcance.

## Conferência pendente

Guardar em local protegido: autorização, responsáveis, SO, portas testadas externamente, configuração efetiva SSH, segunda conexão, recuperação pelo console e manutenção. A EC-083 depende dessa prova no servidor autorizado; este documento não afirma que ela ocorreu.

Referências: [OpenSSH](https://ubuntu.com/server/docs/how-to/security/openssh-server/), [firewall Docker](https://docs.docker.com/engine/network/packet-filtering-firewalls/), [grupo Docker](https://docs.docker.com/engine/install/linux-postinstall/) e [atualizações](https://ubuntu.com/server/docs/how-to/software/automatic-updates/).
