# Passagem de série e módulo

A passagem normal ocorre automaticamente quando o aluno consulta ou solicita
uma declaração, ou quando a secretaria consulta as turmas ou a situação escolar. O servidor
usa a data de Recife e aplica as passagens vencidas uma vez, registrando a data
escolar de cada mudança. Não há botão obrigatório para promover cada turma nem
rotina instalada na VPS nesta entrega.

- Integrado: próxima série em 1º de fevereiro do ano seguinte, até a terceira.
- Subsequente: próximo módulo em 1º de fevereiro ou 1º de agosto. Administração e
  Desenvolvimento de Sistemas têm três módulos; Enfermagem tem quatro.
- Até o início da próxima etapa, inclusive nas férias, o documento usa a etapa e
  o período anteriores. A continuidade até janeiro não antecipa a passagem.
- Vínculo encerrado, não conferido, com suspensão ou aguardando nova turma não é
  promovido. Vigências excepcionais e fontes incompatíveis exigem conferência.
- Chegar à última etapa não confirma conclusão e não apaga aluno ou documento.

A importação identifica turmas pelas informações da planilha e cria vínculos
inicialmente não conferidos. Confirmar a matrícula é uma ação escolar inicial,
com motivo e autoria; não é uma autorização manual de cada declaração nem de
cada passagem futura. Essa confirmação não ativa cadastro nem remove bloqueios
manuais. Não foi restaurado o cadastro manual de calendário.

## Painel da secretaria

Em **Alunos e acesso**, escolha Integrado ou Subsequente e abra a turma. O catálogo
atualiza passagens vencidas em lotes de até 200 alunos e mostra nome, curso,
período e quantidade de alunos, com paginação. A lista seguinte
usa a mesma modalidade, curso e período; também é possível buscar por nome ou
matrícula. Campos e identidades ficam em memória, nunca na URL ou armazenamento
persistente do navegador.

Abra **Ver aluno e bloqueios** para consultar o detalhe em uma janela. Cada
matrícula oferece **Conferir situação escolar**, com etapa atual, vigência,
próxima data e histórico. As ações exigem motivo, confirmação e uma versão atual:

- **Confirmar matrícula e passagem automática**: conferência inicial ou correção
  de suspensão. Nome de próxima turma é opcional quando o padrão não é conhecido.
- **Marcar reprovação desta etapa**: mantém a etapa, suspende passagem e bloqueia
  novas demandas acadêmicas enquanto aguarda outra turma. Login e PDFs anteriores
  permanecem separados desse bloqueio.
- **Corrigir reprovação da etapa anterior**: quando já houve uma passagem, retorna
  à etapa anterior comprovada pelo histórico e registra a reprovação, sem apagar
  a passagem original.
- **Corrigir marcação de reprovação**: desfaz somente uma marcação indevida,
  preservando suspensões anteriores e registrando outro evento.

Enturmação de quem realmente precisa refazer a etapa, exceção de atendimento e
encerramento de concluintes são entregas próprias. Não usar a correção de uma
marcação indevida como substituto da enturmação. Não apagar ausentes de planilhas.

## Consistência e proteção

A passagem e a emissão compartilham a trava acadêmica com a importação. A emissão
reconfere bloqueios, matrícula e o retrato escolar antes de guardar o PDF; uma
mudança durante a geração impede salvar dados desatualizados. Repetir o pedido
não duplica o arquivo. Documentos emitidos anteriormente não são reescritos.

A situação e o evento correspondente são gravados na mesma transação, com versão,
autoria humana ou execução automática, motivo e data. A tabela de eventos recusa
UPDATE, DELETE e TRUNCATE; referências impedem exclusão por cascata. Resposta
perdida permite repetir a mesma intenção; conflito exige nova consulta. A trilha
transversal dos demais recursos e a separação de papéis do banco seguem a EC067;
cópia externa protegida é etapa de infraestrutura. Não há garantia contra quem
controle integralmente o servidor e o banco.

As rotas privadas conferem sessão, papel real no banco, origem, corpo limitado e
limites de uso. Estas funcionalidades continuam sob a configuração de avaliação
existente, recusadas em produção. Preparar emissão autorizada e linguagem de uso
real pertence à EC131, sem transformar documentos antigos em oficiais.
