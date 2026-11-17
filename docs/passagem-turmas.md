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

Enturmação e exceção de atendimento de repetentes estão descritas abaixo.
Encerramento confirmado de concluintes segue uma entrega própria (EC130). Não usar a correção de uma
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

## Enturmação de repetentes — EC127

Na importação, confira as abas e abra **Repetentes aguardando nova turma**. Escolha
a turma de destino e consulte os nomes compatíveis. A consulta é explícita, com
20 nomes por página; nada é pesquisado a cada letra. Só aparecem matrículas ativas
e conferidas, aguardando a mesma modalidade, curso e etapa em período posterior.
Turmas A/B ou turnos diferentes exigem escolha; não há destino automático.

A secretaria pode selecionar até100 matrículas por arquivo, incluindo quem não
aparece noXLS. Confira a lista separada na prévia e marque a confirmação da
enturmação. Seleções e versões fazem parte da prévia de15minutos, vinculada ao
operador. A confirmação reconfere fonte, referência, identidade e permissões sob
a trava comum da importação; alterações concorrentes exigem outra prévia. Importação,
enturmação e evento são uma transação: uma falha desfaz todo o lote.

A matrícula conserva seu ID, conta, documentos e ingresso conhecido. A nova
referência altera a previsão de conclusão do subsequente, mantendo o ingresso
original no PDF. No integrado, uma data de ingresso ausente não é inventada a
partir do início de uma série avançada. A etapa não sobe; a marca de espera sai
só após confirmar. Vigência futura continua impedindo emissão antes do início.
Bloqueios manuais são preservados, assim como uma suspensão anterior à repetência.
Mudança de identidade noXLS exige nova conferência; a enturmação não ativa uma
matrícula não conferida. Reimportar o arquivo antigo não desfaz a transferência.

No detalhe escolar, **Liberar solicitações enquanto aguarda turma** registra uma
exceção com motivo e confirmação. Só funciona para matrícula conferida, vigente e
com referência escolar compatível. Não muda datas, não promove, não transfere e
não remove bloqueios manuais. Para revogar, use **Voltar a aguardar turma sem novas
solicitações**; o histórico mostra liberação e revogação separadas. Correção de
reprovação indevida continua sendo uma ação diferente.

Validação dedicada: `npm run test:repeater-placement --workspace @ete-conectada/portal`
e `npm run test:repeater-browser --workspace @ete-conectada/portal`, cada grupo em
banco sintético novo, vazio e identificado. Os testes deixam eventos imutáveis
nessa instância descartável; o responsável pelo ensaio deve encerrá-la e removê-la
integralmente ao final. Nunca usar demonstração ou banco real.
