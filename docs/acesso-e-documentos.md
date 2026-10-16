# Acesso e entrega de documentos

Direção da equipe em 13/10/2026. Este texto orienta próximas implementações;
não declara recuperação, entrega digital ou integração GOV.BR prontas.

## Recuperação de acesso

No primeiro acesso, conferir nome e sobrenome de um dos pais registrados,
aceitando pai OU mãe. O nome é conferência adicional, não comprovação suficiente
de titularidade. Células de filiação vazias na exportação exigem consulta da
secretaria ao registro escolar, sem inventar nome ou liberar um bypass geral.

### Conferência implementada em desenvolvimento (EC-058)

O primeiro formulário pede matrícula, nascimento e **um nome completo** registrado
na filiação. O servidor repete a conferência ao criar ou retomar a conta, mesmo
quando a chamada é feita diretamente à API. Aceita qualquer um dos dois nomes;
a ordem da planilha não determina pai ou mãe. Usa somente dados com origem
escolar ou correção da secretaria, nunca uma autodeclaração para aprovar a si mesma.

Maiúsculas, acentos, espaços externos/repetidos e apóstrofo tipográfico não mudam
a comparação. O nome inteiro precisa corresponder: não há busca aproximada,
abreviação ou comparação só pelo primeiro e último nome. O limite é de 180 caracteres;
controle/caractere invisível, número e texto de uma só palavra são recusados.
Não persistimos o texto enviado como correção do cadastro.

Ausência de matrícula, bloqueio e filiação divergente produzem a mesma resposta
de não conferido, sem devolver nomes, dizer qual campo divergiu ou informar se
há filiação no registro. O estado da conta só aparece depois da conferência.
A confirmação por e-mail continua obrigatória; uma conta ativa não é sobrescrita,
e uma pendente com link válido só pode renovar usando as credenciais já escolhidas.

O link guarda um hash dos dados escolares usados na conferência, dentro da mesma
transação. Mudança posterior de identidade/filiação, bloqueio ou link legado sem
essa referência impedem a ativação. Links antigos devem ser renovados pelo novo
fluxo; a migração aditiva preserva contas, senhas, sessões e dados escolares.
Se o código for revertido, manter o cadastro desabilitado até recuperar essa
validação. A coluna aditiva pode permanecer; não há necessidade de apagar contas
nem remover a coluna durante um rollback de código.

Esse mecanismo **não comprova sozinho a identidade da pessoa**: familiares podem
ser conhecidos por terceiros. A produção continua bloqueada; limitação de tentativas
e demais proteções de acesso seguem seus cards, especialmente EC-060. Códigos de
exceção, autoedição de filiação e atendimento de divergências não foram liberados.
A orientação segue as limitações de perguntas pessoais descritas pela
[OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Choosing_and_Using_Security_Questions_Cheat_Sheet.html).

A recomendação técnica é recuperação automática por link enviado ao e-mail já
confirmado. O cadastro atual possui envio de confirmação via Resend; SMTP é uma
alternativa de transporte, não requisito para projetar a recuperação. Reutilizar
o transporte após conferir suas configurações evita introduzir outro serviço
apenas para senha. Isso reduz atendimentos rotineiros; envio real precisa ser
configurado e testado no ambiente autorizado.

O link deve ser aleatório, expirar, permitir uma utilização e ter seu segredo
armazenado de forma protegida. Usar resposta genérica, limitar solicitações e
tentativas, consumir o token e atualizar a senha de forma atômica. Após sucesso,
invalidar sessões e links anteriores e pedir novo login. Nunca enviar a senha
por e-mail nem revelar uma senha existente. Não bloquear a conta só porque alguém
enviou uma solicitação pública de recuperação.

Perda do e-mail, contato incorreto, filiação divergente e conta contestada vão à
secretaria, presencialmente ou por solicitação no site. A solicitação abre o
atendimento; não é autorização para transferir a conta. Antes da alteração,
o funcionário confere identidade e registro escolar por canal institucional.
Se o canal remoto não permitir essa conferência, encaminha ao atendimento
presencial. Preservar histórico e registrar operador, motivo, ação e resultado,
sem documentos completos, senhas ou nomes dos familiares nos logs.

Referência: [orientações OWASP para recuperação de senha](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
Implementação: EC-059 e painel/controles relacionados.

## Entrega digital desejada

A equipe substituiu o objetivo de retirada física pelo seguinte fluxo:

1. Aluno solicita declaração.
2. Secretaria confere os dados e prepara a versão individual do PDF.
3. Os responsáveis autorizam suas assinaturas digitais.
4. O sistema verifica o resultado e preserva o arquivo final assinado.
5. Secretaria revisa e executa **Liberar documento**.
6. Aluno vê a disponibilidade no pedido e baixa esse mesmo arquivo.

Gerar o PDF, iniciar a assinatura ou receber uma resposta de callback não libera
o documento. Cancelamento, falha, assinatura incompleta e divergência de versão
precisam de estados próprios. O download deve ser autorizado no servidor e ficar
limitado ao aluno titular e aos funcionários autorizados. O arquivo assinado
não deve ser regenerado, receber QR depois da assinatura ou ter páginas recortadas.
Correção exige nova versão e novas assinaturas; preservar a anterior conforme
política institucional de guarda. Uma liberação repetida não cria outro documento.

O art. 23, VIII da Instrução Normativa SEE/PE nº 21/2025 apresentada à equipe
prevê secretaria **e** gestão. A menção a assinatura da secretaria **ou** gestão
na conversa não deve ser implementada como suficiência de apenas uma sem
orientação institucional que esclareça essa divergência e eventuais substitutos.
EC-046 permanece com essa pendência; EC-097/098 tratam integração e homologação.

## O que a API GOV.BR permite

O [manual oficial](https://manual-integracao-assinatura-eletronica.servicos.gov.br/pt-br/latest/iniciarintegracao.html)
descreve solicitação por gestor público, integração prévia ao Login Único,
domínio oficial e credenciais autorizadas. Um domínio comercial ou a geração
do PDF não concedem acesso à API. Cada signatário precisa autorizar o uso do
seu certificado, com conta no nível admitido pelo serviço; não compartilhar
credenciais nem assinar silenciosamente em nome de outra pessoa.

Na API descrita, a aplicação prepara o PDF, envia o hash apropriado e recebe
um pacote de assinatura PKCS#7. Para entregar um PDF com assinatura incorporada,
a aplicação precisa montar e verificar essa assinatura no arquivo. Não presumir
que enviar um PDF ao site público produzirá callback e arquivo final automático.
Assinar manualmente no portal e devolver o arquivo é outra operação; não é a
integração automática desejada, nem deve ser improvisada sem fluxo de conferência.

O retorno só pode marcar assinatura concluída depois de verificar vínculo com
pedido/versão, integridade, assinaturas exigidas e signatários autorizados.
O QR institucional e o código devem ser preparados antes da assinatura e apontar
para a consulta aprovada; não expor CPF, nascimento ou filiação nessa consulta.

Produção aguarda autorização, credenciais, domínio e homologação. Enquanto isso,
modelos sintéticos, persistência de vínculos e importação podem evoluir em cards
próprios. O protótipo atual continua com seu comportamento até uma entrega
específica implementar e testar a mudança de fluxo.

## Progressão do subsequente

A equipe autorizou progressão automática conforme calendário configurado da
oferta. Administração e DS têm três módulos; Enfermagem, quatro. O módulo
importado e o calendário precisam de referência de período para não promover
duas vezes a mesma turma. A rotina deve ser repetível sem duplicar progressões,
respeitar exceções e não ultrapassar o último módulo.

Na transição, apresentar aviso para atualizar a lista e uma prévia que compare
novos alunos, ausentes, permanências, mudanças de módulo e divergências.
Ausência significa **ausente nesta exportação**, até a secretaria confirmar
desistência, transferência ou outra situação. Não apagar conta/histórico nem
emitir documento atestando vínculo apenas com base nessa ausência ou no relógio.
O registro conferido prevalece sobre o cálculo e ajustes autorizados não devem
ser desfeitos automaticamente. Datas oficiais por oferta serão cadastradas com
fonte conferida; seis meses não é uma quantidade fixa de dias.

EC-070 encerra o levantamento dos dados/modelo. EC-108 implementará calendário,
progressão e aviso; o núcleo de importação implementará a comparação e prévia.
