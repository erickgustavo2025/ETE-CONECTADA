# Emissão registrada em ambiente de teste

O aluno pode gerar a declaração pela própria conta, confirmar UF/município e
abrir ou baixar o PDF original. O pedido disponível, o arquivo e a substituição
anterior são salvos juntos. QR e consulta seguem o contrato da EC096. O arquivo continua identificado como minuta sem validade
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
como outro aluno. A rota privada POST `/api/declaracao/solicitacoes` liga esse serviço à tela do aluno.

## Documento atual, repetição e falha

O registro diferencia `DRAFT/STAFF_DRAFT`, criado pela preparação antiga, de
`ISSUED/STUDENT_REQUEST`, versão2 explicitamente marcada `testOnly`. Nenhuma minuta
histórica é convertida. O PDF original é guardado com o snapshot imutável.

A tentativa é única por conta e UUID. Repetir a mesma tentativa devolve o mesmo
registro, inclusive após mudança de nome ou cancelamento; não renderiza nem
substitui novamente. Uma intenção de emitir outro documento usa outra tentativa.
A tela preserva esse UUID em memória após perda de resposta. Reabrir ou baixar não gera nova emissão.

`declaration_current_issues` guarda o último documento emitido por matrícula e
tipo. A gravação do arquivo, do novo registro, da substituição anterior e desse
ponteiro ocorre numa única transação. O escopo não depende do período letivo.
Falha em qualquer escrita mantém o documento anterior e desfaz o novo arquivo.
Emissões simultâneas são serializadas: não deixam dois documentos atuais.

Uma declaração cancelada permanece cancelada quando outra é emitida. O ponteiro
pode continuar apontando para uma cancelada até a próxima emissão; a existência
do ponteiro isoladamente não prova validade. A consulta pública considera o registro, seu evento terminal e o documento atual. O código público
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

## QR e consulta de teste

A EC096 acrescenta a publicação explícita da consulta, QR e versão de arquivo
minuta-a4-qr-v1 na nova emissão. Detalhes em [Verificação pública](verificacao-publica.md).
Repetir uma tentativa anterior mantém exatamente o arquivo anterior, sem promover
registros. O painel oferece Verificar declaração somente nos novos registros.
A substituição manual de emissões é recusada no servidor: é preciso emitir outra.

## Entrega automática e pedidos anteriores

`AVAILABLE` significa que o PDF está disponível na conta do aluno. O pedido referencia
uma única emissão do mesmo aluno e matrícula por chave estrangeira composta; campos
de preparação e liberação da secretaria permanecem vazios. Os pedidos anteriores
mantêm seus estados originais. O índice de atendimento aberto continua exclusivo
apenas para REQUESTED/IN_PREPARATION; novas emissões não entram nessa fila.

A naturalidade escolhida no catálogo é validada no servidor, usada no PDF e salva
na mesma transação da emissão. Cadastro conferido pela escola não pode ser alterado
por esse formulário. Falha na última escrita desfaz também a naturalidade enviada.

POST `/api/declaracao/arquivo` recebe somente documentId e download opcional. A conta
ativa precisa ser de aluno e dona do documento. Só arquivos individuais registrados,
com uma página e hash conferido, são entregues; minutas e lotes não passam. Abertura
e download têm no-store, origem conferida e limites separados de autenticação e
consulta pública. O código do QR não dá acesso ao arquivo. Cancelados/substituídos
continuam no histórico com sua situação visível; abrir não os torna válidos.

A tela usa os componentes e estilos existentes, lista no máximo20 pedidos e mostra
falhas sem apagar o histórico. Gerar exige confirmação do local e avisa sobre a
substituição; falha de resposta permite repetir a mesma tentativa. Nenhum dado do
aluno ou UUID da tentativa é salvo no armazenamento do navegador. Navegadores podem
exibir o PDF em uma nova aba ou baixá-lo conforme suas configurações de visualização.

Para suspender o experimento, desligue a mesma chave de preview sem remover migrações
ou dados. Os novos pedidos são históricos; não devem ser convertidos para retirada.
O caminho de atendimento anterior permanece disponível com o preview desligado.
Testes: `test:automatic-declaration`, jornadas Chromium nas duas modalidades e
backup/restauração de AVAILABLE com documento vinculado, além da bateria existente.
