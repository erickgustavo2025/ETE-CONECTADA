# Histórico administrativo protegido

Requisito confirmado pela equipe em 05/11/2026. Este documento define o aceite da EC067 e dos eventos gerados por EC124/126/127; não declara a proteção completa implementada.

## Comportamento esperado

O painel administrativo oferece consulta, busca e filtros. Nenhuma conta da secretaria, inclusive administradores do portal, pode editar, apagar ou limpar eventos. Uma correção, desbloqueio, cancelamento ou desfazimento gera outro evento ligado ao anterior. O histórico registra o que aconteceu, mesmo quando o estado atual muda.

Registrar responsável pela intenção, ação, alvo, horário do servidor, motivo, resultado e identificador da operação. Em aplicações automáticas de passagens já confirmadas, distinguir quem confirmou da execução automática e registrar os dois horários; não atribuir a decisão ao aluno que acessou o portal e acionou a atualização pendente.

Bloqueio e desbloqueio de demandas acadêmicas, exceções autorizadas, passagens de etapa, repetências, transferências e mudanças de estado de documentos precisam de eventos. A mudança e seu evento confirmado devem fazer parte da mesma transação: falha de auditoria impede a alteração. Repetição da mesma operação não duplica eventos nem reaplica uma intenção antiga.

Repetente aguardando turma fica bloqueado para novas demandas acadêmicas, incluindo declarações e serviços futuros, com login tratado separadamente. Desbloqueio administrativo ou emissão excepcional pela secretaria exige motivo e evento; não promove o aluno nem altera sua turma. O painel não pode apagar a justificativa anterior.

## Proteção no armazenamento

- Credencial do serviço de auditoria limitada a inserir e consultar os eventos autorizados; sem UPDATE, DELETE, TRUNCATE, propriedade das tabelas ou permissões para desabilitar suas proteções. Credencial de migração separada da usada pelo portal.
- Proteção no banco contra edição, exclusão e limpeza dos eventos, inclusive exclusões em cascata de aluno, conta ou matrícula. Preservar a identificação auditável do responsável quando uma conta for desativada. Operações de correção acrescentam eventos; não reescrevem os anteriores.
- Mudanças nos estados operacionais de uma preparação ou de uma declaração continuam permitidas pelas regras do domínio. Isso é diferente de editar o evento histórico que relata a mudança.
- Consultas de auditoria privadas, paginadas e autorizadas no servidor. Não incluir senhas, tokens, conteúdo de documentos, CPF ou filiação nos eventos. Guardar apenas dados necessários para explicar e atribuir a ação.
- Cópia externa protegida contra alteração/exclusão, com credenciais separadas, verificação de integridade e alerta de falha ou lacuna. Backup restaurável comum não substitui essa proteção. Implantação e teste dependem da infraestrutura; não há serviço externo provisionado por este documento.

Uma conta da secretaria não deve conseguir remover evidências pelo portal ou pela credencial de aplicação. Não existe promessa de impossibilidade absoluta contra o proprietário/superusuário do banco ou contra quem controla toda a infraestrutura. Esse risco exige separação de acessos e cópia externa protegida; uma cadeia de hashes guardada somente no mesmo banco também pode ser reescrita por esse administrador.

## Lacunas verificadas em 05/11

Na base da EC125/PR76, `student_access_changes` já possui gatilho que recusa UPDATE. Ainda tem `ON DELETE CASCADE` no vínculo com aluno e não tem proteção própria contra DELETE/TRUNCATE. O histórico de importação também permite exclusão em cascata. Portanto não atribuir a essas tabelas a garantia completa exigida aqui. A migração de passagem da EC126 em preparação guarda estados mutáveis, não substitui um registro de eventos protegido.

EC067 permanece pendente. Antes de concluir sua entrega, rever todos os históricos existentes e as credenciais efetivamente usadas; não basta esconder botões nem proteger apenas a tabela nova. Testes e limpeza devem usar banco descartável próprio. Não criar senha especial, parâmetro de requisição ou variável do portal que permita contornar as proteções para facilitar testes.

## Isolamento dos cenários de verificação

`npm run test:database-scenarios` verifica a criação de bancos separados a partir de uma fonte local, migrada, vazia e identificada. A fonte não recebe os registros do cenário. O histórico permanece no banco do cenário até seu descarte integral; não é necessário desabilitar gatilhos ou apagar os eventos para limpá-lo.

O descarte confere nome, identificador interno, proprietário e marcador antes de remover somente o banco criado pelo harness. Recusa marcador divergente e conexões ainda abertas; não usa `FORCE` nem encerra sessões desconhecidas. Este módulo é exclusivo do harness e não inicia um servidor HTTP. Essa preparação de testes, isoladamente, não entrega a separação de privilégios do portal nem as demais proteções da EC067; os testes com credencial limitada e as proteções do serviço continuam necessários.

O harness das jornadas agora deriva um banco por cenário, fecha seu portal e suas conexões antes de descartá-lo e restaura a configuração da fonte para a próxima execução. `db:demo` e o seed continuam persistentes no banco explicitamente identificado; não recebem essa semântica de descarte. `test:cleanup` consulta a fonte original e o catálogo de bancos em modo somente leitura, recusando resíduos sem removê-los. A integração desse isolamento não equivale à proteção completa de auditoria.

## Evidência necessária para concluir EC067

1. Tentativas de editar, excluir, truncar e apagar o registro por cascata falham com a credencial real da aplicação; o evento e a contagem permanecem iguais. Operações de manutenção usam acesso separado, fora do portal.
2. Aluno não consulta o histórico administrativo de terceiros; secretaria consulta somente as informações autorizadas. Requisições forjadas não editam nem apagam eventos.
3. Alteração e auditoria são atômicas, inclusive falha, concorrência e repetição da operação. Correção deixa os dois eventos legíveis e relacionados.
4. Passagem automática identifica a confirmação original e a execução; bloqueio, desbloqueio e exceção conservam responsável e motivo.
5. Desativação de contas e manutenção de cadastros não apagam autoria nem eventos. Backup/restauração preserva eventos e suas proteções.
6. Na implantação, demonstrar cópia externa protegida, tentativa de adulteração, detecção de lacuna e restauração. Registrar a configuração e seus limites sem publicar credenciais.
