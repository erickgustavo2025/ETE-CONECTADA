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
do lote. Os bytes do PDF não são armazenados nesta etapa; isso ainda depende
da definição de guarda do documento final.

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

Não há nova consulta pública, QR funcional, download histórico ou painel
nesta primeira entrega. O código de consulta não concede acesso à conta,
ao cadastro ou ao PDF. Cancelamento, substituição e assinatura oficial
precisam preservar essa separação nas entregas seguintes.

## Verificação

`npm run test:declaration-documents` usa exclusivamente um banco descartável
identificado e seu próprio portal. Cobre geração individual e lote misto,
hash/página, isolamento e autorização, snapshots, restrições de exclusão,
revisão obsoleta e rollback após inserção. Está incluído em
`npm run test:integration`.

`npm run test:backup` restaura também uma minuta sintética, compara rotinas e
gatilhos do catálogo e exercita a imutabilidade depois da restauração. As
guardas existentes do banco de teste continuam obrigatórias.
