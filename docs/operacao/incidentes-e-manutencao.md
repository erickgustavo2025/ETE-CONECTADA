# Atendimento a incidentes e manutenção

No início do atendimento, identifique o ambiente, o horário, a última versão publicada e quem conduz o incidente. Se precisar dividir o trabalho, uma pessoa executa a intervenção e outra confere o resultado. Registre o impacto e a falha observada pelos canais aprovados da equipe.

## Descobrir a origem da falha

Rode a [checagem operacional](monitoramento.md) quando tiver acesso autorizado à rede do ambiente. O comando distingue site, portal, PostgreSQL, disco, backup e certificado. Use o identificador da execução para reunir seus resultados.

| O que aconteceu                          | O que conferir                                                                                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site ou portal indisponível              | Confira qual serviço falhou, o proxy e a última alteração. Se começou após uma atualização, confira o digest em execução e use o procedimento de retorno.                                          |
| Banco indisponível ou acesso negado      | Confira a rede privada, o estado do PostgreSQL, a credencial limitada da imagem e as últimas migrações. Preserve a origem antes de qualquer recuperação.                                           |
| Cadastro ou recuperação sem e-mail       | Confira provedor, remetente, configuração e resposta do ensaio autorizado. Para verificar recebimento, use a caixa de teste da equipe. Oriente a pessoa a conferir o spam e usar o reenvio normal. |
| Cópia atrasada ou disco com pouco espaço | Identifique a última cópia verificada e a causa da falha. Use o procedimento de backup. Preserve documentos, histórico e cópias até a equipe aprovar o descarte aplicável.                         |
| Falha de certificado                     | Confira o domínio, o certificado servido e a renovação pelo proxy ou provedor. Teste novamente pelos endereços institucionais antes de liberar.                                                    |
| Suspeita de acesso indevido              | Restrinja o acesso afetado pelo canal autorizado, preserve evidências e acione o responsável institucional. A revisão das sessões e dos segredos envolvidos faz parte do atendimento.              |

## Atualizar ou voltar de versão

Confira revisão e aprovação da release, imagem e digest, backup, permissões e plano de retorno. Use o [procedimento de migração e rollback](migracoes-release.md) e as informações do [artefato de release](../artefato-release.md).

Se a imagem nova falhar e o esquema novo for compatível, volte à imagem e à credencial limitadas anteriores. Se houver perda ou incompatibilidade de dados, preserve o banco atual e use o [procedimento de restauração isolada](backup-restauracao.md) antes de decidir o retorno. Em qualquer recuperação, confira o acesso às funções afetadas com conta de teste e confirme as verificações operacionais antes de liberar.

## Revisar acessos e segredos

Use o [procedimento de acesso à VPS](acessos-vps.md) quando alguém entrar, sair ou mudar de função. Mantenha uma conta por pessoa e registre quem revisou a mudança. A equipe confere separadamente acessos de GitHub, hospedagem, banco, correio e backup.

Ao rotacionar um segredo, identifique primeiro quais serviços o usam e combine a janela com o responsável. Cadastre a nova credencial no gerenciador de segredos, atualize o serviço autorizado, verifique seu funcionamento e revogue a credencial anterior quando o retorno já estiver coberto. Para incidentes, a revogação pode precisar ocorrer primeiro, conforme decisão do responsável. Sempre confira que conexões ou sessões antigas afetadas foram encerradas.

Os registros de operação podem conter ambiente, horários, digest, código da checagem, causa confirmada, pessoa responsável e resultado. Senhas, chaves, links de uso único, cópias do banco, dados dos alunos e documentos ficam nos canais específicos aprovados para cada caso.

## Exercício de operação

Na conferência local de 18/11/2026, a rotina identificou uma falha HTTP 503 do portal, uma credencial incompatível do banco, disco abaixo do limite, backup atrasado e certificado perto de vencer. O site continuou respondendo pela origem de ensaio. Depois de repor as condições normais, as checagens voltaram a indicar operação normal. Em ensaios separados, a restauração preservou 25 tabelas e a aplicação anterior retomou o acesso ao esquema novo com sua credencial original.

Para a passagem de responsabilidade, uma segunda pessoa da equipe deve repetir o exercício no ambiente autorizado, identificar a causa sem apoio de quem montou o teste e registrar o resultado. Confirmem onde os alertas chegam, quem assume se o primeiro responsável estiver indisponível e por quanto tempo os registros operacionais serão guardados.
