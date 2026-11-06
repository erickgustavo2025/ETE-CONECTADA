# Registro privado de minutas

O registro preserva o texto preparado para um aluno e uma matrícula. A geração
continua produzindo uma **minuta para revisão**; ela não confirma assinatura,
emissão oficial nem liberação para retirada.

## Ativação de teste

`DECLARATION_REGISTRY_PREVIEW=true` habilita o registro somente com
`NODE_ENV=development` ou `test`. O padrão é desativado. Em `production`, o
recurso permanece desativado mesmo quando a variável estiver como `true`.
Não habilitar esse experimento na demonstração com dados reais sem definir a
política institucional de guarda e acesso.

A migração é aditiva. Desativar a variável restaura o comportamento anterior da
geração, preservando registros já existentes. Não apagar a tabela para
desabilitar o recurso.

## Conteúdo e integridade

Cada registro contém identificador interno, código aleatório de 32 bytes,
aluno/matrícula, conta responsável, data, versão do snapshot e conteúdo
preparado. O snapshot inclui texto, modalidade, turma, período e campos dos
signatários. Ele é privado e não muda quando o cadastro do aluno é corrigido.
CPF isolado, credenciais e dados de sessão não fazem parte do registro.

O SHA-256 corresponde aos bytes do **PDF completo retornado pela geração**.
Em lote, cada registro guarda o mesmo hash do arquivo e a posição de sua
página, de 1 a 100. Não confundir esse hash com um arquivo individual extraído
do lote. Novas minutas registradas guardam também os bytes exatos do PDF original, com
limite de 16 MiB, número de páginas e versão do modelo. Um lote guarda um arquivo
compartilhado, sem duplicar os bytes por aluno. O banco confere hash e tamanho e
recusa alteração do arquivo ou sua exclusão enquanto houver registros vinculados.
Minutas antigas continuam sem arquivo; nunca são reconstruídas com dados atuais.
Isso não transforma a minuta em documento oficial. Retenção institucional segue pendente.

A FK composta impede misturar o aluno com a matrícula de outra pessoa. Um
gatilho bloqueia alterações do registro; referências a aluno, matrícula e
responsável impedem exclusões que deixariam o histórico órfão. Nenhuma rota
de exclusão foi adicionada.

## Geração e falhas

Somente a secretaria autorizada pode gerar. O servidor confere origem,
campos, papel ativo e vínculo; dentro da transação, confere novamente o papel,
a revisão da matrícula e o calendário quando aplicável. A criação dos
registros e a preparação dos pedidos correspondentes pertencem à mesma
transação. Falha em qualquer gravação desfaz ambas. Uma falha na geração do
PDF não cria registro.

## Consulta e ações da secretaria

Com o experimento ativado, o atendimento de declarações oferece o link para
`/secretaria/documentos`. A tela começa vazia: a secretaria pesquisa um aluno
pelo nome ou matrícula e abre a lista dele. Modalidade, turma exata, situação e
datas de preparação restringem a consulta; as datas usam o horário de Recife.
As listas são paginadas no servidor em 20 registros, com ordenação estável.
Filtros e seleção ficam somente em memória; a busca usa POST privado, sem dados
escolares na URL ou no armazenamento do navegador.

O detalhe mostra o texto preservado e quem preparou ou alterou a situação.
Cancelar exige motivo e confirmação. Substituir exige também conferir o texto
de outra minuta disponível do mesmo aluno, matrícula e período. A original
fica Substituída e aponta para a corrigida. O registro original nunca é editado.
Uma ação terminal única guarda motivo, data e responsável autenticado. As duas
minutas são bloqueadas em ordem estável na transação; repetições iguais retornam
o evento existente, e ações conflitantes são recusadas. A substituta não pode
pertencer a outra pessoa, estar cancelada/substituída, formar ciclo ou ser usada
como substituta de duas originais.

O pedido do aluno permanece separado e não é cancelado por essas ações.
O modal impede repetição e fechamento durante envio. Se a resposta se perde,
a mesma ação pode ser repetida sem criar outro evento, ou a secretaria consulta
a situação atual antes de continuar. Não há exclusão por essa tela.

Endpoints privados, com origem e papel ativo conferidos no servidor:

- POST `/api/secretaria/documentos/busca`: pesquisa por `query`, filtros
  opcionais `className`, `mode`, `status`, `from`, `to`, e `page`; `studentId`
  abre a lista individual e `documentId` abre o detalhe autorizado.
- POST `/api/secretaria/documentos/alteracoes`: `documentId`, `action`
  (CANCELLED/SUPERSEDED), `reason`, `confirmed: true` e, para substituir,
  `successorId`. O cliente não escolhe conta responsável ou data.

POST `/api/secretaria/documentos/arquivo` recebe somente documentId e download
opcional, exige sessão de secretaria ativa e mesma origem. Retorna o original
para abrir ou baixar, com no-store, somente quando o experimento estiver ativo
em desenvolvimento/teste. O aluno não acessa o lote, nem usando código público.

Reversão operacional: desativar o experimento e voltar à versão anterior da aplicação;
a migração é aditiva, e os arquivos guardados devem ser preservados. Não remover
a tabela nem reconstruir bytes históricos para reverter a funcionalidade.

Não há consulta pública, QR funcional ou download histórico do aluno nesta entrega.
O código de consulta não concede acesso à conta, ao cadastro ou ao PDF.
A assinatura oficial e a guarda do arquivo final seguem etapas próprias.

## Verificação

`npm run test:declaration-documents` usa exclusivamente um banco descartável
identificado e seu próprio portal. Cobre geração individual e lote misto,
hash/página, isolamento e autorização, snapshots, restrições de exclusão,
revisão obsoleta e rollback após inserção. Está incluído em
`npm run test:integration`.

`npm run test:backup` restaura também uma minuta e seu cancelamento sintéticos, compara rotinas e
gatilhos do catálogo e exercita a imutabilidade depois da restauração. As
guardas existentes do banco de teste continuam obrigatórias.

`npm run test:document-actions` cobre autorização, origem, motivo, confirmação,
concorrência, repetição, imutabilidade e preservação do atendimento.
`npm run test:document-search` cobre a busca, filtros, paginação e acesso privado.
As duas verificações integram `npm run test:integration`. O teste Chromium
`documents.spec.ts` verifica teclado, tela de 320/1440px e resposta perdida após
uma escrita real, seguida de repetição idempotente. Produção recusa página e
APIs mesmo com a variável experimental definida como true.
