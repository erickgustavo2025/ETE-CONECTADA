# Turmas e períodos a partir do XLS

EC125 substitui o cadastro prévio de calendário na importação das duas modalidades. O arquivo continua passando pelo leitor isolado, limites, validação de conteúdo, prévia privada e confirmação transacional já existentes.

## Conferência da secretaria

1. Escolher integrado ou subsequente e ler a exportação XLS.
2. Conferir código da turma, curso, série/módulo e período preenchidos pelo cabeçalho. Esses campos não são editados no navegador; erro no cabeçalho exige corrigir a exportação e ler novamente.
3. Para listas antigas, escolher explicitamente a lista anterior. A opção padrão usa código e período do arquivo. Matrículas antigas sem associação ainda exigem a escolha do vínculo correspondente na prévia.
4. Conferir diferenças e confirmar. A prévia não cria alunos, matrículas ou referências de datas. A confirmação aplica o lote inteiro ou não aplica nada.

Na exportação, a segunda linha termina em ano (integrado) ou ano/semestre (subsequente); a quarta informa série/módulo, turno e código. A posição/nome da aba não define a etapa. Turmas A/B são distintas. O leitor não cria turmas para módulos que não apareceram na planilha.

## Datas estimadas e histórico

ADM e DS: três módulos. Enfermagem: quatro. Semestre 1 começa em 01/02 e termina em 31/07; semestre 2 começa em 01/08 e termina em 31/12. A referência inicial desconta os módulos anteriores do período informado. Exemplo: módulo 2 em 2026.2 estima ingresso em 2026.1 e conclusão em 2027.1 em ADM/DS. Trata-se de referência semestral, não de confirmação do dia real em que começaram as aulas.

A referência só é criada para uma turma nova do subsequente ao confirmar o lote. É armazenada na estrutura versionada já existente (`course_offerings`/`course_calendar_versions`), com operador e data. Não há segundo calendário a preencher: os módulos futuros nessa referência representam datas previstas, não turmas criadas. A versão inicial é preservada; correção autorizada acrescenta versão pelo serviço existente. A reimportação usa a versão atual, sem sobrescrevê-la pela estimativa. Matrículas existentes mantêm suas datas e nomes conferidos. A prévia mostra a referência que será usada.

No integrado, o ano vem do cabeçalho e a vigência inicial é o ano civil, ainda sem conferência. Importar não ativa matrícula nem libera cadastro ou declaração. A situação individual da exportação continua descartada; a matrícula deve passar pela conferência já existente. Emissão automática significa ausência de aprovação por pedido, não autorização de emitir sobre vínculo ainda não conferido.

A associação da lista usa UUIDv8 derivado de SHA256 sobre versão do contrato, modalidade, curso, código e período. Não inclui nomes, nascimento, filiação ou posição da aba. É identidade de uma lista em um período, não identificador do aluno ou prova de sua progressão. Mesmo em requisições do contrato antigo, vínculos dessa associação não podem mudar turma, etapa ou período pelo importador. Passagem e transferência têm confirmação própria nas EC126/127. Importação mantém bloqueios, retenções, situação encerrada, correções de filiação e alunos ausentes.

## Contrato e compatibilidade

A tela envia `format: school-header-v1`. Inspeção retorna apenas metadados; prévia/confirmação releem o arquivo e conferem todos os campos no servidor. `sourceChoice: header` exige a associação derivada; `existing` exige fonte já persistida da modalidade/curso. Não há confiança no UUID ou módulo enviado pelo cliente. O token vincula operador, arquivo, contexto e estado atual, incluindo revisões dos bloqueios. Mudança após prévia exige nova conferência; repetição após confirmação retorna o resultado anterior sem novas escritas.

O contrato anterior permanece para compatibilidade das ferramentas de importação, com as proteções de colocação dos vínculos novos. Calendários e histórico antigos não são apagados ou reinterpretados. Não há migração de banco nem dependência nova. Reverter o código mantém referências geradas compatíveis com os leitores anteriores. Os limites existentes continuam: até 25 abas, 5.000 linhas, 2 MiB e catálogo de até 200 referências.

## Verificação

Fixtures inteiramente sintéticas. Testes de cabeçalho, cálculos, A/B, módulo 4 na terceira aba, cabeçalho inválido, requisição adulterada, aba renomeada, ausência de escrita na inspeção/prévia, rollback das referências e alunos, repetição de confirmação, correção versionada, bloqueios e vínculo de outra modalidade preservados. Testes Chromium cobrem a importação das duas modalidades e a recuperação de resposta perdida. Ver resultados finais da entrega antes de considerar homologada: código implementado não significa teste de implantação ou aceite institucional.
