# Passagem de turma e repetência

Regras confirmadas pela equipe em16/11/2026. EC126 trata a progressão; EC127 a enturmação de repetentes; EC130 o encerramento confirmado de concluintes. Não restaurar confirmação manual obrigatória para a passagem normal.

## Etapa acadêmica

A etapa vem da matrícula escolar, não do nome do arquivo ou da posição da aba. Progressão do integrado é anual; do subsequente é semestral, com datas fixas de início em01/02 e01/08. ADM e DS têm três módulos, Enfermagem quatro. A data é conferida no servidor no fuso America/Recife, inclusive na virada da meia-noite local.

Sem impedimento acadêmico, a progressão normal deve ocorrer automaticamente na data de início da próxima etapa. O período e o ano também avançam; não apenas o número do módulo. Durante férias e até a véspera, permanece a etapa anterior. Solicitar documento não pode antecipar a próxima etapa.

Matrícula não conferida, encerrada ou suspensa não é liberada automaticamente pelo relógio. A revisão inicial dos dados continua necessária; não significa aprovação manual de cada passagem ou emissão. Bloqueio de acesso/serviços e decisão de progressão são conceitos separados.

## Repetentes

Repetente permanece no ano/módulo a refazer. Enquanto aguarda enturmação, não há progressão normal. A espera bloqueia novas demandas acadêmicas, sem impedir login por si só; exceção administrativa com motivo não muda etapa ou turma.

Na importação, sugerir apenas quem corresponde à modalidade, ao curso e ao ano/módulo da turma de destino. A secretaria seleciona os nomes e confirma a enturmação. A/B e turno são escolhas explícitas quando houver mais de um destino. Revalidar a escolha no servidor e mostrar os repetentes separados dos alunos da planilha na prévia.

Enturmação encerra a espera atual e retira apenas o impedimento relacionado àquela repetência. Preserva bloqueios manuais, ingresso, conta, cadastro, documentos e a reprovação no histórico. Se o destino ainda não iniciou, não emitir documento de etapa futura.

## Concluintes

Estar na última etapa não comprova conclusão do curso. Não elevar além da última série/módulo nem encerrar por data ou ausência na planilha. Conclusão precisa de confirmação escolar própria. Encerrar somente o vínculo correspondente e manter os registros anteriores e a conta. Documentos de conclusão e histórico escolar serão funcionalidades futuras.

## Estado desta fatia

Apenas o motor puro de decisão e suas fronteiras estão implementados nesta fatia: esperar, avançar, etapa final ou impedimento acadêmico. A decisão não grava dados, não libera documento e ainda não é chamada pelas rotas da aplicação.

Persistência/auditoria, aplicação idempotente, continuidade controlada nas férias, rechecagem antes de gravar PDF, interface de exceções e conexão à importação precisam das próximas fatias da EC126/127. O schema antigo em stash, baseado em aprovação manual, continua preservado sem aplicação. Nenhuma migração ou mudança em dados reais nesta fatia.

Verificação focada: npm run test:school-promotion-input --workspace @ete-conectada/portal. O teste entra também em test:unit. Concorrência, rollback e jornadas de navegador devem ser comprovados quando existir a integração; o teste puro não comprova esses comportamentos.
