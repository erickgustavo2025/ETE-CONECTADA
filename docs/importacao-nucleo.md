# Núcleo de importação da secretaria

A API de desenvolvimento `POST /api/secretaria/importacao` lê XLS e prepara uma prévia antes de alterar cadastros. É exclusiva de uma sessão ativa da secretaria, exige a mesma origem e responde com `private, no-store`. O acesso em produção continua bloqueado. Ainda não há tela de upload: as entradas do integrado e do subsequente serão conectadas a este núcleo nas EC-105/106.

## Leitura

O corpo é JSON com `action`, `mode`, `contexts` e `fileBase64`. Limite de 3 MiB para o corpo, contado no stream mesmo sem `Content-Length`, e de 2 MiB para o XLS. Aceita somente assinatura OLE do XLS binário, até 25 abas, 5 mil linhas de dados no conjunto e nove colunas. A linha 6 deve conter Matrícula, Nome, Data de nascimento e Filiação 1 e 2 nas posições esperadas; cabeçalhos intermediários vazios não deslocam a filiação.

A distribuição oficial [SheetJS CE](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) 0.20.3 fica fixada por URL e integridade no lockfile. Sua execução ocorre em um worker com ambiente vazio, prazo de cinco segundos, heap de 64 MiB e uma leitura simultânea por processo; outra tentativa recebe 429. Esse limite controla o heap do worker, não representa sandbox de sistema operacional ou limite de memória total. O leitor não executa fórmulas/macros nem busca links; recusa fórmulas em células, hiperlinks, VBA, abas ocultas/especiais e erros de interpretação. Não envia arquivos a serviços externos nem os salva em disco/banco. A exportação precisa estar no layout suportado; ambiguidades são recusadas, sem importar parcialmente ou truncar linhas.

## Contexto conferido

Cada item de `contexts` identifica exatamente uma aba:

```json
{
  "sheetName": "Turma fictícia",
  "scopeId": "2a106574-290e-4a97-85d8-bdb6f2247637",
  "periodLabel": "2026.2",
  "className": "Turma fictícia A",
  "courseLabel": "ADM",
  "stage": 1,
  "confirmed": true
}
```

`mode` é `INTEGRADO` ou `SUBSEQUENTE`. Cabeçalho e contexto precisam concordar em modalidade, curso e série/módulo. ADM/DS aceitam etapas 1–3; Enfermagem aceita módulos 1–4 no subsequente. Não se deduzem ano, vigência, ingresso ou conclusão pelas datas do arquivo.

`scopeId` é uma chave estável de acompanhamento da oferta/turma, conferida pela secretaria. Reutilize-a ao atualizar o mesmo grupo, mesmo que o nome ou módulo mude. Não gere uma chave nova a cada upload e não reutilize uma chave para outro ingresso/curso. A configuração acadêmica e o calendário por oferta continuam na EC-108; esta chave de importação não os substitui.

Quando já houver um vínculo do mesmo aluno/modalidade/curso sem associação à fonte escolar, a prévia aponta conflito. Informe opcionalmente `bindings: {"00001001": "UUID-DO-VINCULO-CONFERIDO"}` para associar o vínculo certo, preservando a origem do importador JSON antigo. Se for realmente outro vínculo, use o valor explícito `"new"`. Não é permitido associar outro aluno, outra modalidade/curso ou mover uma associação de origem já existente. Abas/ofertas ou matrículas repetidas exigem correção; não são mescladas automaticamente.

## Prévia e confirmação

1. Envie `action: "preview"`. A resposta contém contagens, referências de aba/linha, valores de entrada e diferenças dos campos permitidos, além do contexto conferido. Dados pessoais ficam somente nessa resposta privada; não entram em logs gerais.
2. Confira novos, alterados, idênticos, conflitos e ausentes. Uma única divergência impeditiva bloqueia a confirmação. Alterações de nome/nascimento/filiação de pessoa existente exigem aceite explícito.
3. Reenvie os mesmos bytes e contexto com `action: "confirm"`, `token` devolvido e `confirmed: true`. Para alterações de identidade, inclua `acceptIdentityChanges: true` após a conferência.

A prévia não altera alunos, vínculos ou contas. Mantém apenas hashes de arquivo/contexto/estado conferido, operador, expiração e, depois da aplicação, contagens. O token aleatório vale por 15 minutos, é vinculado à conta e sua versão anterior é substituída por uma nova prévia. Registros expirados são removidos na próxima prévia; excluir a conta remove seu registro temporário. Os hashes não devem ser tratados como anonimização dos dados.

A confirmação reconfere autorização e estado atual dentro de uma transação serializável. Mudança posterior à prévia exige nova conferência; concorrência ou falha SQL cancela o lote inteiro. Confirmação repetida do mesmo token aplicado devolve as contagens anteriores sem gravar novamente. Até 10 mil vínculos relacionados podem participar da conferência; excesso é recusado, nunca truncado.

## Preservação

- A matrícula identifica a pessoa; a associação de fonte identifica seu vínculo. Integrado e subsequente podem pertencer à mesma pessoa sem gerar duas contas.
- Novos alunos ficam com primeiro acesso bloqueado. A importação não cria conta, concede papel, define CPF, altera e-mail/senha/sessão ou ativa vínculo.
- Campos vazios não apagam dados. Uma filiação omitida preserva o segundo nome existente. Uma correção de filiação feita pela secretaria não é sobrescrita por planilha divergente.
- Nome/nascimento/filiação alterados invalidam a conferência dos vínculos da pessoa. Mudanças de turma, período ou etapa invalidam a conferência do vínculo correspondente. Gere novamente a declaração após a secretaria conferir os dados.
- Vínculos encerrados permanecem encerrados nas correções da pessoa. Metadados divergentes de um vínculo encerrado exigem atendimento separado; a planilha não reabre esse vínculo.
- Ausência na lista é apenas uma diferença na prévia: não exclui pessoa/conta, não encerra vínculo e não significa desistência.
- Nº de classe, Sexo, Situação, Raça/Cor e Procedência não são gravados. O XLS original e a grade bruta também não são retidos.

A migração `20261015150000_sheet_import` acrescenta associação de origem, módulo separado da série e registro temporário de prévia; não altera a situação ou os dados de vínculos antigos. Não use reset para aplicar ou reverter. Uma reversão apenas do código pode manter as colunas aditivas; remover a migração aplicada exige revisão e preservação das associações.

## Histórico das alterações escolares

Ao confirmar uma mudança de turma, série/módulo ou período permitida pelo núcleo, o estado anterior do vínculo fica em `enrollment_import_history`. Se a correção de identidade exigir nova conferência, a situação/conferência anterior dos vínculos afetados também é preservada. Uma mesma confirmação grava no máximo uma versão por vínculo, mesmo quando os dois motivos ocorrem juntos. O registro contém metadados acadêmicos anteriores, situação, vigência, data da conferência anterior, data da importação e referência à conta que a confirmou. Não copia nome, nascimento, filiação, CPF, credenciais ou o arquivo. Esses registros continuam vinculados ao aluno e exigem o mesmo cuidado de acesso dos demais dados escolares.

Prévia, confirmação recusada, arquivo idêntico, repetição de token e simples associação à fonte sem mudança de dados não criam versões. Vínculos novos não têm versão anterior. Histórico e atualizações participam da mesma transação: se uma linha falhar, o lote inteiro volta ao estado anterior, incluindo as versões e o consumo do token. Mudança acadêmica do integrado não altera os metadados do subsequente, e vice-versa; uma correção de identidade comum pode exigir nova conferência dos dois vínculos.

Renovação ou mudança dentro da mesma oferta usa sua associação estável. Transferência para outra modalidade/curso/ingresso exige vínculo separado e conferido; não reutilize a associação antiga. O importador continua recusando alterações incompatíveis ou de metadados de vínculo encerrado, sem encerrar o anterior automaticamente. Ausência na planilha não prova transferência ou desistência. Datas acadêmicas e progressão automática dependem do calendário; não são deduzidas do dia do upload.

Este histórico registra alterações feitas pelo importador a partir desta entrega; não reconstrói o passado nem cobre alterações manuais ou todos os eventos de auditoria. Ainda não há tela ou endpoint de consulta do histórico. Não é uma prova de conclusão acadêmica nem substitui a conferência para emitir documentos. Nenhuma rotina de expurgo foi adicionada: os registros seguem o vínculo ao qual pertencem, sem exclusão pelo importador. A exclusão explícita do vínculo mantém a política relacional existente de cascata; excluir a conta do operador apenas deixa sua referência nula, preservando as versões. Política institucional de retenção e auditoria geral continuam pendentes.

A migração aditiva `20261015160000_enrollment_import_history` cria a tabela vazia e seus índices, sem alterar matrículas existentes. Reverter somente o código pode manter a tabela; não apague uma migração aplicada para reverter a funcionalidade.

## Testes

`test:sheet-input` cria XLS binários fictícios e verifica layout, modalidade, zeros, filiação, datas, duplicados, fórmula BIFF real e hiperlink. Integra `test:unit`. `test:sheet-import` usa a API real e PostgreSQL novo identificado: autorização, upload limitado, prévia, confirmação, expiração, repetição, atualização, dados protegidos, ausências, múltiplos vínculos, revisão posterior e rollback depois da primeira escrita. Integra `test:integration`; cleanup remove somente suas fixtures.

O contrato completo está em [Importação das planilhas](importacao-planilhas.md). Para executar as provas, siga [Testes isolados](testes-isolados.md); nunca use a demonstração em uso ou dados reais como fixtures.

`test:sheet-history` verifica pela API real mudança de turma/período/série e módulo, invalidação de conferência, isolamento entre modalidades, repetição, conflitos e prévia desatualizada. Força falha após a escrita do histórico para comprovar rollback de versões e cadastros, e verifica preservação das versões quando a conta do operador é excluída. Integra `test:integration`; `test:cleanup` também confere a tabela de histórico.
