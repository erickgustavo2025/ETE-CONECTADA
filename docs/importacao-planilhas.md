# Importação das planilhas da secretaria

Este contrato descreve como receber as listas do integrado e do subsequente sem
confundir alunos, turmas ou módulos. O importador atual aceita backup JSON; ainda
não recebe XLS nem atualiza os registros existentes. As regras abaixo orientam
as próximas implementações, sem habilitar importação ou acesso em produção.

## Arquivo e cabeçalhos

As exportações recebidas são arquivos Excel binários XLS, com uma aba por turma.
As cinco primeiras linhas apresentam o contexto da turma; a sexta contém os
cabeçalhos. Linhas seguintes representam alunos; títulos, rodapés e linhas vazias
não são alunos. A extensão do nome não comprova o formato do arquivo.

O leitor deve preservar posições vazias da grade. Uma aba recebida tem alguns
cabeçalhos intermediários removidos, mas a filiação permanece na nona posição.
Não comprimir as células vazias nem deslocar a coluna de filiação.

| Informação      | Fonte                                  | Tratamento                                                                                              |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Matrícula       | Coluna `Matrícula`                     | Identificador textual; preservar zeros à esquerda e rejeitar ausência/ambiguidade.                      |
| Nome civil      | Coluna `Nome`                          | Preservar grafia; normalizar apenas espaços para armazenamento.                                         |
| Nascimento      | Coluna `Data de nascimento`            | Texto `dd/mm/aaaa`; validar dia, mês e ano e armazenar como data sem fuso.                              |
| Filiação        | Coluna `Filiação 1 e 2`                | Campo combinado; vírgula separa os nomes no formato recebido. Um nome ou ausência também são possíveis. |
| Curso e turma   | Cabeçalho da aba                       | Conferir antes da importação; não usar a procedência individual como curso atual.                       |
| Série ou módulo | Cabeçalho da turma                     | Série no integrado; módulo no subsequente. Não são o mesmo atributo.                                    |
| Modalidade      | Entrada escolhida e contexto conferido | Integrado ou subsequente, com recusa quando contexto e entrada discordarem.                             |

Ignorar `Nº de classe`, `Sexo`, `Situação`, `Raça/Cor` e
`Procedência modalidade/curso`, conforme a seleção da equipe. Não importar a
linha inteira nem manter esses campos em cópia bruta no banco. Como `Situação`
será ignorada, a importação não comprova matrícula ativa e não pode conceder
acesso ou autorizar emissão por conta própria.

CPF, e-mail, nome social, naturalidade, UF de nascimento e datas de início/fim do
curso não têm colunas dedicadas nessas exportações. Não preencher por suposição.
CPF e e-mail continuam no fluxo de primeiro acesso. Nome social ausente fica
ausente; naturalidade/UF seguem o fluxo descrito abaixo. Datas de curso exigem
calendário da oferta conferido, não a data de exportação do arquivo.

## Duas entradas, um processamento comum

A secretaria escolhe **Importar integrado** ou **Importar subsequente**. Ambas as
entradas usam o mesmo leitor, validação e prévia. O contexto da aba deve confirmar
a seleção, o curso, a turma e a série/módulo. Se faltar informação, pedir sua
conferência; não reconhecer modalidade pelo curso isoladamente ou pelo nome do
arquivo. Administração e DS existem nas duas modalidades.

Separar a pessoa (`Student`) de seus vínculos escolares (`Enrollment`). A
modalidade pertence ao vínculo; não cria um novo papel de acesso. Uma matrícula
já existente não deve gerar outra pessoa só porque o arquivo ou a turma mudou.
Uma pessoa com múltiplos vínculos não deve ter um deles sobrescrito silenciosamente.

Identificar a oferta da turma por chave estável, conferida pela secretaria. O
nome/código da turma ou o módulo isolado não identificam uma coorte para sempre:
podem reaparecer em outro período. O núcleo deve exigir o período/oferta quando
ele não estiver disponível no cabeçalho.

## Prévia, atualização e erros

Antes de escrever, apresentar as abas reconhecidas e os totais de novos alunos,
alterações, registros idênticos, conflitos e ausências. Detalhes pessoais ficam
apenas na tela autorizada; logs e relatórios gerais usam contagens e referências
de aba/linha/campo, sem transcrever nomes, matrículas ou filiação.

- Reimportar a mesma fonte com os mesmos dados não cria pessoas ou vínculos extras.
- A matrícula é a chave de comparação da pessoa; nome e posição da linha não são
  chaves. Colisões ou divergências entre arquivos exigem revisão.
- Atualizar nome/nascimento/filiação somente após confirmar a prévia. Mudanças
  que afetam a conferência de identidade exigem atenção explícita da secretaria.
- Não sobrescrever CPF, e-mail, senha, papel, sessão ou estado da conta por dados
  da planilha. A importação não cria contas nem ativa primeiro acesso.
- Um campo vazio não apaga automaticamente um valor já conferido. Excluir ou
  corrigir informação exige uma ação explícita com origem e responsável.
- Ausência de aluno numa lista nova não exclui aluno, vínculo, conta ou histórico.
- Não avançar série/módulo de todos os alunos apenas pela mudança de data.
- Qualquer erro impeditivo bloqueia a confirmação; a gravação confirmada deve
  ser transacional. Uma falha não pode deixar metade da turma atualizada.

A implementação deve limitar tamanho de upload, abas e linhas, conferir a
assinatura binária antes de interpretar e recusar arquivo corrompido, protegido
ou formato não suportado. Não executar fórmulas, macros ou links externos. Não
reter o XLS original por padrão nem enviar arquivos a serviços externos.

## Filiação e conferência no cadastro

A equipe escolheu conferir **nome e sobrenome de um dos pais**, aceitando um dos
nomes registrados na matrícula. A ordem de `Filiação 1 e 2` não permite afirmar
qual pessoa é pai ou mãe; armazenar os nomes sem inventar essa distinção.

Tratar espaços, maiúsculas e acentos de forma consistente para comparação,
preservando o texto original para a declaração. Não aceitar apenas um sobrenome,
substring ou aproximação automática como correspondência. Nomes abreviados ou
formatos ambíguos exigem conferência. Não revelar os nomes esperados na resposta.

Filiação ausente exige atendimento pela secretaria. Não inventar nome nem
obrigar a informar duas pessoas. Os arquivos recebidos incluem registros sem
filiação, por isso essa exceção faz parte do fluxo.

Esse dado adicional não comprova sozinho a titularidade: pode ser conhecido por
outras pessoas. A implementação deve combinar proteção contra tentativas,
respostas genéricas e tratamento de conta indevidamente reivindicada. O acesso
em produção continua bloqueado até a revisão dos demais controles.

## Naturalidade informada no pedido

O pedido poderá abrir um modal para selecionar **UF e município de nascimento**,
sem confundir com residência ou nacionalidade. A seleção é autodeclaração do
aluno, a ser conferida pela secretaria; escolher um município válido não prova
onde a pessoa nasceu. O fluxo precisa tratar nascimento fora do Brasil sem
forçar uma cidade brasileira.

Usar o [catálogo de localidades do IBGE](https://servicodados.ibge.gov.br/api/docs/localidades):
carregar municípios somente após escolher a UF, manter cache limitado por UF e
filtrar a lista já obtida enquanto a pessoa digita. Não consultar a API a cada
tecla nem enviar dados do aluno ao IBGE. Descartar respostas de uma UF anterior
se a seleção mudar. Limitar resultados visíveis e permitir teclado, carregamento,
erro e nova tentativa. A confirmação no servidor deve validar o par município/UF.

Persistir origem e correções autorizadas conforme a política de dados. Não
substituir dados já conferidos por uma nova autodeclaração sem revisão nem expor
esses campos numa futura consulta pública por QR.

## Modelos e calendário

Integrado usa frequência fixa de **100%** conforme decisão da secretaria
comunicada pela equipe. O subsequente não inclui frequência; não deve exigir
percentual ou intervalo de frequência para gerar seu documento.

Preservar o conteúdo do modelo subsequente recebido, com harmonização visual e
campos de assinatura de gestão e secretaria autorizados pela equipe. QR e
consulta verificável seguem uma implementação própria; desenhar um QR não
implementa verificação nem assinatura eletrônica.

ADM e DS têm três módulos; Enfermagem, quatro. Isso não limita o número de turmas.
Letras A/B, ausência de letras e semestres sem seleção não podem mudar a lógica
de identificação. Ofertas distintas podem estar em módulos diferentes.

Guardar módulo cursado no vínculo e calendário na oferta/período. Separar início
do curso, datas do módulo e conclusão prevista. Reprovação, trancamento,
transferência e calendário alterado impedem promover automaticamente pelo relógio.
Os exemplos julho/2026 → dezembro/2027 (ADM/DS) e julho/2026 → julho/2028
(Enfermagem) não substituem datas conferidas por turma.

## Painel da secretaria e próximos passos

Há dois papéis: aluno e secretaria. Integrado/subsequente não são papéis de
permissão. O futuro painel permitirá à secretaria gerenciar contas, bloquear
acesso e iniciar redefinição de senha. Nunca mostrar a senha atual; manter hash,
revogar sessões conforme bloqueio/reset e registrar ações sensíveis sem segredos.
Contas de funcionários precisam de identidade própria, sem aluno fictício.

Implementar por etapas: dados e vínculos (EC-052/053), núcleo de prévia e gravação
(EC-056), entradas por modalidade (EC-105/106), calendário (EC-108), conferência e
recuperação (EC-058/059), naturalidade no pedido e modelos (EC-052/069/071/048).
Cada etapa deve ter testes sintéticos e revisão própria; este contrato não
declara essas funcionalidades prontas.

Os [exemplos de grade](exemplos/alunosturmas-sintetico.json) foram criados do zero,
sem reutilizar registros de alunos, e cobrem cabeçalhos vazios, filiação ausente,
datas inválidas e matrículas duplicadas.
