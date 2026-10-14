# Dados complementares do aluno

A tabela `student_details` guarda filiação, nome social e município/UF/país de
nascimento. Existe no máximo um complemento por aluno. A migração é aditiva:
não modifica alunos, contas ou matrículas existentes e não preenche informação
desconhecida. Um cadastro antigo pode continuar sem complemento.

`parentOne` e `parentTwo` são posições dos nomes registrados, sem presumir pai ou
mãe. Uma filiação é suficiente para armazenar o registro. A origem é guardada
separadamente para filiação, nome social e naturalidade: registro escolar,
autodeclaração ou correção da secretaria. Filiação usada para conferência não
aceita autodeclaração como origem.

## Atualização autorizada

`updateStudentDetails` é um serviço interno. O chamador obtém o operador da
sessão no servidor; nunca aceita seu ID informado pelo aluno como autorização.
O serviço exige conta ativa com papel de secretaria, trava essa conta durante
a transação e registra o operador e a data da última atualização. Os dados
e sua origem são gravados na mesma operação.

A alteração recebe apenas grupos explícitos (`parentage`, `socialName`,
`birthplace`), com campos limitados e origem obrigatória. Não recebe nome civil,
CPF, senha, papel ou situação da matrícula. Grupos omitidos são preservados;
segunda filiação omitida também. Remover segunda filiação exige `null` explícito
e origem de correção da secretaria. Nome social também pode ser removido
explicitamente; uma célula vazia da importação não deve gerar essa operação.

Naturalidade brasileira exige município e UF reconhecida, separados de país
`BR`. Nascimento no exterior aceita município e código de país com duas letras,
sem forçar UF brasileira. A estrutura não verifica se município pertence à UF,
se o país realmente existe ou se o nascimento foi comprovado. A futura seleção
e conferência precisam validar essas informações antes de aceitar o pedido.
Autodeclaração é origem da informação, não homologação automática.

O banco impede combinações incoerentes e ausência de origem em dados preenchidos.
Os campos ausentes permanecem nulos. A data e o operador indicam a última escrita;
não são um histórico completo de alterações. Auditoria histórica e retenção
seguem seus próprios cards e a política institucional.

## Operação e limites

Aplicar a migração com o comando existente `db:migrate` em ambiente autorizado,
após conferir o banco e o procedimento de backup. Esta entrega foi testada
somente com banco descartável e dados fictícios. O banco da demonstração e
os dados reais da escola não foram migrados pelo agente.

A interface de declaração ainda usa o editor atual. Este incremento fornece
armazenamento e escrita protegida para o importador/painel futuros; não habilita
autoedição do aluno, código de exceção, upload de planilha ou acesso em produção.
Nenhuma rota pública passou a expor filiação ou naturalidade.

Em uma reversão do código, a tabela adicional pode ser mantida sem alterar o
funcionamento anterior. Não apagar a tabela se já contiver dados sem antes
preservá-los e obter autorização para esse descarte. Não editar migrações já
aplicadas para tentar desfazer a estrutura.

## Verificação

- `npm run test:unit`: campos permitidos, tamanhos, origens, controles e naturalidade.
- `npm run test:student-details`: persistência, omissão, correção, permissões e constraints.
- `npm run test:schema`: modelo migrado, chaves, origens e histórico de migrações.
- `npm run test:integration` inclui os dados complementares no CI.
- `npm run test:cleanup` confirma ausência de resíduos no banco novo de teste.

Os testes de banco exigem `TEST_DATABASE_*`, permissão explícita de escrita
sintética e marcador SQL, conforme [Testes isolados](testes-isolados.md).
