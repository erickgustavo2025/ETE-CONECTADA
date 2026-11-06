# Painel de declarações

Correção da EC073 na revisão da fase de teste. A própria página `/secretaria/declaracoes` reúne consulta dos documentos e das solicitações. Disponível apenas em desenvolvimento/teste com `DECLARATION_REGISTRY_PREVIEW=true`; produção permanece recusada.

## Consulta

A lista inicial mostra alunos com documentos, paginados de20em20. Nome/matrícula é opcional; modalidade, turma exata, situação e intervalo de datas refinam a busca. Escolher um aluno mostra seus documentos, também paginados. Os filtros ficam na memória do navegador, sem dados pessoais na URL ou armazenamento local. Os campos aguardam o carregamento dos controles antes de permitir edição.

Em Consultar → Solicitações, aparecem os pedidos antigos e os gerados automaticamente,20por página. Pedidos sem PDF são apenas registros do atendimento anterior; não há preparar, liberar retirada ou edição dos dados do aluno por pedido. Um pedido com PDF permite abrir os detalhes do documento e mostra seu estado atual, inclusive cancelamento/substituição. Gerado não significa que continua válido.

O detalhe mostra o texto preservado, a situação e o histórico de ações. Quando existe arquivo original, a secretaria pode baixá-lo: os bytes vêm da guarda privada com conferência de hash, sem renderizar ou emitir novamente. O link de verificação está disponível para emissões que possuem QR funcional.

## Estados

Cancelar exige confirmação e motivo. Documento cancelado/substituído não volta a válido por um seletor. Nova emissão bem-sucedida pelo aluno substitui automaticamente a anterior do mesmo vínculo/tipo; downloads não substituem nada. A substituição manual permanece limitada aos rascunhos antigos compatíveis. As ações acrescentam eventos; reforço transversal contra exclusão de histórico continua na EC067, não atribuir essa proteção completa a esta alteração de painel.

## Telas retiradas

O antigo atendimento com edição de campos, preparação manual/lote e liberação de retirada deixou de ser a tela administrativa. Os componentes dessas telas foram removidos. `/secretaria/documentos` encaminha para o painel único.

O cadastro manual de calendário saiu do menu; `/secretaria/calendarios` encaminha a secretaria à importação do subsequente. A API manual antiga recusa operações autenticadas com410; sessão e origem continuam obrigatórias. A estrutura interna de referências de datas, os serviços de compatibilidade e seus históricos são preservados. Importação lê a planilha e cria a referência necessária; retirar uma tela não significa apagar dados acadêmicos antigos.

Passagem de turmas, repetentes e encerramento das matrículas de concluintes não são feitos por este painel nem pela simples ausência na planilha. EC126/127 estão suspensas enquanto se resolve a fase de teste, conforme prioridade da equipe.

## Verificação

Conferir listagens sem nome e com filtros, paginação, pedidos antigos sem mutação, perda/atraso de resposta sem resultado anterior, estado terminal, bytes originais, autorização/origem/campos adulterados, controles antes da hidratação e ausência das telas/botões antigos. Revisar capturas320/1440e rodar integração/navegador/builds e verificações pertinentes antes de publicar. Documentação deste comportamento não substitui evidência de execução ou merge.
