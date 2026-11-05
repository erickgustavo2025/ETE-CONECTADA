# Emissão registrada em ambiente de teste

Esta etapa acrescenta o núcleo interno de emissão individual. Não liga a emissão
automática à tela do aluno: essa ligação pertence à EC073. A consulta pública e o
QR pertencem à EC096. O arquivo continua identificado como minuta sem validade
oficial; os modelos com as assinaturas fornecidas pela escola ficam por último.

## Ativação e contrato

Usa a mesma chave `DECLARATION_REGISTRY_PREVIEW=true` do registro privado, somente
em desenvolvimento/teste. Produção recusa o recurso mesmo com a chave definida.
`issueTestDeclaration` recebe a conta obtida pelo servidor e somente matrícula e
UUID da tentativa. Não recebe nome, curso, filiação, papel, PDF ou aprovação do
cliente. Conta ativa de aluno, vínculo pertencente à conta, matrícula vigente e
campos obrigatórios são conferidos no servidor.

A primeira etapa carrega os dados escolares e renderiza uma página. Dentro da
transação, o serviço confere novamente a conta, bloqueia os registros escolares
e verifica se os dados e o dia de emissão continuam iguais. Uma mudança durante
a renderização exige nova tentativa. O acesso à secretaria não autoriza emitir
como outro aluno. Ainda não existe endpoint HTTP para esse serviço.

## Documento atual, repetição e falha

O registro diferencia `DRAFT/STAFF_DRAFT`, criado pela preparação antiga, de
`ISSUED/STUDENT_REQUEST`, versão2 explicitamente marcada `testOnly`. Nenhuma minuta
histórica é convertida. O PDF original é guardado com o snapshot imutável.

A tentativa é única por conta e UUID. Repetir a mesma tentativa devolve o mesmo
registro, inclusive após mudança de nome ou cancelamento; não renderiza nem
substitui novamente. Uma intenção de emitir outro documento usa outra tentativa.
A rota futura deve preservar esse UUID após perda de resposta.

`declaration_current_issues` guarda o último documento emitido por matrícula e
tipo. A gravação do arquivo, do novo registro, da substituição anterior e desse
ponteiro ocorre numa única transação. O escopo não depende do período letivo.
Falha em qualquer escrita mantém o documento anterior e desfaz o novo arquivo.
Emissões simultâneas são serializadas: não deixam dois documentos atuais.

Uma declaração cancelada permanece cancelada quando outra é emitida. O ponteiro
pode continuar apontando para uma cancelada até a próxima emissão; a existência
do ponteiro isoladamente não prova validade. A consulta pública futura deve
considerar o registro, seu evento terminal e o documento atual. O código público
aleatório não autoriza ler o PDF nem acessar cadastro.

## Secretaria e reversão

O painel privado continua começando pela busca de um aluno, com filtros e
paginação. Diferencia minuta, emissão de teste, cancelamento e substituição.
Ações da secretaria exigem conta ativa, origem, confirmação e motivo; o aluno
não recebe essas permissões. O histórico guarda o ator real: nas substituições
automáticas é a conta solicitante, sem atribuir aprovação à secretaria.

A migração é aditiva e preserva os registros anteriores. Para interromper o
experimento, desative a chave e reverta a aplicação; não remova tabelas, eventos,
ponteiros ou bytes históricos. Backup/restauração inclui a nova tabela e exercita
seus vínculos e as regras de imutabilidade depois de restaurar.

Verificação: `npm run test:issuance`, integrado à bateria de integração, cobre
isolamento entre contas/matrículas, repetição e concorrência, arquivo histórico,
falha na última escrita e recuperação, cancelamento e os dois tipos de ensino.
A jornada Chromium do acervo também consulta e cancela uma emissão de teste.
