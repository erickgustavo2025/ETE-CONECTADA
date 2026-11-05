# Alunos e acesso

A exigência adicional de 05/11 para histórico administrativo sem edição ou exclusão está em [Histórico administrativo protegido](seguranca/auditoria-administrativa.md). A proteção atual contra UPDATE descrita abaixo não cobre ainda DELETE, TRUNCATE nem exclusões em cascata; o reforço e os testes completos são pendências da EC067.

Fatia experimental EC124, disponível apenas em desenvolvimento/teste com DECLARATION_REGISTRY_PREVIEW=true. Produção continua recusada. Não altera papel, senha, e-mail, filiação ou situação escolar.

A secretaria pode buscar alunos por nome/matrícula, modalidade, turma e situação de bloqueio. São20 resultados por página e até10 matrículas recentes por aluno, sem CPF, nascimento, filiação, senha ou tokens. A conta da secretaria não aparece como aluno administrável. O detalhe traz o histórico dos bloqueios,20 registros por página.

Bloquear acesso impede novo login e encerra sessões existentes. Desbloquear permite novo login com a senha atual; não recupera tokens antigos. O estado pertence ao aluno e também vale para uma conta criada posteriormente. Bloquear novas declarações permite acesso/download do histórico, mas impede nova emissão. Repetir uma emissão já concluída recupera o original. Bloqueio nunca cancela, substitui ou altera o arquivo original nem a consulta pública.

Cada alteração requer confirmação, motivo, aluno, tipo, valor esperado da versão e chave da tentativa. Ator vem da sessão e é reconferido na transação. Contas e aluno são travados na mesma ordem do login/emissão. Apenas um envio concorrente sobre a mesma versão pode alterar o aluno. Repetição da mesma chave não duplica auditoria nem reaplica uma intenção antiga; retorna a situação atual. Outra intenção usando a mesma chave ou dados desatualizados recebe409. Estado, auditoria e exclusão das sessões são atômicos; falha desfaz tudo. Eventos não são atualizados pela aplicação e o banco recusa UPDATE da auditoria. Atores vinculados não podem ser excluídos enquanto houver histórico; a exclusão de fixture é restrita ao banco de teste identificado.

O serviço e as rotas exigem secretaria ativa; identidade e papel enviados no JSON são recusados. Corpo limitado, origem conferida, respostas privadas sem cache e orçamento de busca/alteração separado do login e da consulta pública. Segredos e motivos não são registrados em logs técnicos. Importação não recebe nem escreve estes campos de bloqueio.

## Contrato de interface

Direção visual institucional existente: marinho/azul, tipografia e tokens compartilhados. Sem nova paleta, dependências ou telas de desenvolvedor. Português simples e nomes das ações preservados em tela, confirmação e histórico.

| Capacidade          | Responsável canônico                              | Comportamento nesta tela                                                                                     |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Botões e foco       | shared/styles/buttons.css, classe ete-button      | Buscar, Ver aluno, Bloquear/Desbloquear; alvo móvel e foco visível                                           |
| Formulários e erros | useFormValidation e declaration-field             | Motivo e confirmação obrigatórios, erro junto do formulário                                                  |
| Busca               | padrão privado document-registry                  | POST, filtros na memória, sem dados pessoais na URL/storage,20por página, página reinicia ao aplicar filtros |
| Seletores           | select/input/datalist nativos existentes          | Modalidade, situação e turma; filtros aplicados apenas ao buscar                                             |
| Confirmação         | dialog nativo modal como document-registry        | Foco inicial Voltar, Escape, fundo inerte e retorno ao acionador; bloqueio de fechamento durante envio       |
| Feedback            | declaration-feedback/request-error e status/alert | Carregando, vazio, erro com tentativa, sucesso e resposta incerta                                            |
| Assíncrono          | AbortController e limite20s                       | Busca/detalhe antigos descartados; erro não é sucesso; mesma chave ao repetir envio incerto                  |
| Rolagem             | estilos globais existentes                        | Página natural, sem altura fixa ou scroll oculto,320/1440px                                                  |

A ação preserva os filtros e mostra a situação do aluno. Resposta perdida permite repetir exatamente o mesmo envio ou fechar e consultar o estado. Nova ação só usa uma nova versão após conferir os dados atualizados. Histórico usa responsável, horário de Recife e motivo, sem depender apenas de cor.
