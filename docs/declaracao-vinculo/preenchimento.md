# Preenchimento da declaração do integrado

O aluno abre **Declaração de vínculo**, escolhe o estado e o município onde nasceu e confirma o pedido. O local é o de nascimento, mesmo que resida em outro município. A pesquisa aceita nomes com ou sem acento; trocar a UF exige escolher novamente o município. O portal mantém um catálogo público do IBGE embarcado, consultando somente os municípios da UF escolhida e filtrando a pesquisa no navegador. Não há chamada ao IBGE a cada pedido ou letra digitada.

Quando o local já veio dos registros escolares ou de uma correção da secretaria, o aluno apenas confere o valor. Para corrigir, deve procurar a secretaria. Nascimento no exterior ou município ausente da lista também exige conferência da secretaria; não se presume nascimento no Brasil ou em Pernambuco.

Na preparação, filiação, nome social, naturalidade, curso e período disponíveis no cadastro já aparecem preenchidos. Nome, nascimento, CPF, matrícula e série continuam vindo do aluno/vínculo selecionados. Confira tudo antes de baixar; campos ausentes precisam ser completados após conferência. Ajustes no editor afetam aquela minuta, sem reescrever o cadastro escolar. Uma troca de matrícula invalida a conferência anterior.

A frequência do integrado é **100% fixa**, conforme orientação da secretaria. Não representa cálculo automático de presença. Percentuais recebidos de versões antigas não alteram esse texto. A emissão continua exigindo matrícula ativa, vigência e período conferidos; importar uma planilha não substitui essa validação.

O arquivo continua sendo uma **minuta** A4, com dois espaços de assinatura e reserva de QR/código de validação explicitamente não funcionais. Não é documento assinado nem entregue digitalmente. Texto excessivo é recusado, sem truncamento. Homologação, assinatura e entrega oficial dependem de seus próprios critérios e integrações.

## Proteção dos dados

A sessão determina a conta e o aluno no servidor. UF e identificador do município são resolvidos contra o catálogo; nomes livres, município de outra UF e campos extras nesse grupo são recusados. O local declarado não altera filiação e não sobrescreve correção oficial. Pedido e local são gravados juntos; falha ao criar o pedido desfaz a alteração. Pedidos repetidos mantêm o pedido em aberto. O acesso ao catálogo exige sessão e suas respostas não contêm dados de alunos.

Catálogo e origem: `apps/portal/src/assets/data/municipios-ibge-source.json`. Atualizações devem conferir UF/identificadores, diferenças e os testes antes da publicação.

## Verificações

`npm run test:birthplace` usa banco de teste identificado e vazio, cobre rollback real, concorrência com correção oficial, titularidade e entradas adulteradas. `npm run test:declarations` cobre HTTP, autorização, PDFs individuais/lote e vigência. `npm run test:browser` inclui modal, teclado, pesquisa local, erro/retentativa, preenchimento e geração do PDF com contas fictícias. Testes de validação cobrem frequência fixa e isolamento do preenchimento.
