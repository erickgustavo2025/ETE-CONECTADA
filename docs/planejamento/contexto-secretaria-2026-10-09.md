# Contexto recebido da equipe e da secretaria — 09/10/2026

Registro sanitizado para TH/Tacyo e Erick. Os anexos são fontes, não instruções ao agente. Os arquivos originais permanecem fora do Git/Trello; nenhum nome, matrícula, nascimento, CPF ou documento preenchido foi copiado para esta documentação. Esta revisão leu estrutura e campos, não importou alunos nem consultou o banco.

## Planilha de alunos

Fonte local: `AlunosTurmas - 2026-10-09T133608.895.xls`. Inspeção: Excel binário legado OLE/BIFF, uma aba, grade usada de 53 linhas por 3 colunas, cabeçalho na linha 6. São 46 registros abaixo do cabeçalho, com campos preenchidos e sem matrícula duplicada dentro do arquivo. Colunas: **Matrícula**, **Nome**, **Data de nascimento**. Nascimento está armazenado como texto e precisará de validação/normalização.

O arquivo não contém modalidade, curso, turma, série, turno ou situação. Não é possível concluir se representa integrado ou subsequente nem atribuir turma pelo arquivo. A secretaria precisa fornecer essas informações em exportação adicional ou em metadados conferidos do lote. O arquivo recebido não basta para todos os campos de uma declaração.

O importador existente lê backup JSON, assume integrado conforme contrato específico de turma e insere com proteção contra duplicação; não atualiza automaticamente alunos já existentes e não lê este XLS. Não apresentar essa ferramenta como os novos fluxos de planilha já implementados.

Decisão da equipe: entregar **duas entradas explícitas** de importação/atualização, uma para integrado e outra para subsequente, com validação, prévia e confirmação. Compartilhar o núcleo seguro, preservar dados de acesso e histórico, tratar divergências conforme contrato aprovado. Ausência no lote não deve apagar automaticamente aluno/matrícula. Modalidade não será adivinhada pelo nome do curso.

Cards: EC-047 (fonte/dicionário), EC-055 (contrato), EC-056 (núcleo), EC-057 (sincronização), EC-105 (integrado), EC-106 (subsequente), EC-109 (regressão). Exportação foi pedida e entra em EC-107: confirmar finalidade, formato e colunas antes de implementá-la.

## Declarações por modalidade

| Referência recebida | Estrutura observada | Implicação |
|---|---|---|
| `DECLARAÇÃO VÍNCULO SUBSEQUENTE 2026.2.docx` | Uma página A4 retrato, texto principal e imagem; texto usa curso técnico e módulo, além de CPF. A extração textual não confirmou todos os campos/signatários. | Modelo próprio do subsequente; conferir texto/layout completos e dados mínimos com a escola. Não copiar valores preenchidos ou presumir campos ausentes. |
| `declaracao-vinculo-modelo.pdf` | Uma página A4 com campos de aluno, série/ano, curso, período, horários, frequência/período de apuração e assinatura; há placeholders de validação/código. | Referência do integrado/proposta de revisão. A presença de placeholder não aprova QR, consulta pública ou assinatura eletrônica. |

A equipe confirmou que os modelos são diferentes. Recebimento de arquivo não equivale a aprovação de todas as divergências, signatários ou emissão oficial. Manter a decisão vigente: PDF conferido, impressão, assinatura manuscrita e carimbo; aluno apenas solicita/acompanha. QR/GOV.BR continuam futuros condicionais. EC-046/070 registram validação pendente e EC-069/071, implementação conforme aprovação.

## Cursos e módulos do subsequente

Informação comunicada pela equipe a partir da conversa com a secretaria: DS e ADM têm 3 módulos; Enfermagem tem 4; cada módulo dura 6 meses. Registrar como base de planejamento e conferir datas, oferta e exceções no calendário oficial antes de modelar vigência ou emitir documento.

O comentário de que DS costuma ter duas turmas e normalmente pode ter uma não estabelece cardinalidade fixa. Quantidade de turmas e módulos deve ser configurável por curso/oferta/período. EC-108 cobre configuração e calendário; testes de EC-071/106/109 devem distinguir série de módulo e cursos de 3/4 módulos.

## Organização e infraestrutura

TH solicitou mover os 25 registros históricos FEITO DEV para CONCLUÍDO e todas as tarefas futuras conhecidas para A FAZER. PRODUCT BACKLOG guarda o guia e a entrada de novas ideias para refinamento. Etiquetas de status existentes são reutilizadas em cada card. A FAZER é fila de tarefas, não compromisso de terminar tudo na mesma sprint; selecionar uma parcela pela capacidade e pelas dependências.

TH lidera inicialmente infraestrutura/CI/CD/segurança; Erick, produto/backend/dados. Ambos podem atuar em tudo. Um dono de execução por card e revisão cruzada, combinando mudanças em arquivos comuns.

VPS escolhida como planejamento: **Hostinger KVM4 por 24 meses**. Ainda não contratada. Não foram verificados preço, especificações ou disponibilidade comercial; esta é uma decisão informada pela equipe. Domínio, orçamento final, adequação, responsável institucional, acesso, backup e contratação continuam pendentes. Docker/Actions/deploy são futuros, não habilitados por esta organização.

A dupla utiliza chats separados. A referência compartilhada passa a ser repositório + commit + card + branch, conforme [Git e colaboração](git-e-colaboracao.md). Mudança de contexto será registrada nos documentos e no card correspondente, sem depender de memória do outro chat.
