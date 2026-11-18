# Acesso e entrega de documentos

Direção da equipe em 13/10/2026, atualizada em 16/10. Cadastro e recuperação
estão disponíveis em desenvolvimento. Entrega digital e integração GOV.BR
continuam em planejamento; nenhum desses fluxos está liberado em produção.

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

### Recuperação implementada em desenvolvimento (EC-059)

Em **Esqueci minha senha**, a pessoa informa o e-mail confirmado da conta ativa.
O portal sempre responde com o mesmo recibo e só depois consulta a conta e tenta
enviar o link pelo Resend. Não devolve e-mail encontrado, token ou link de teste,
e não muda a senha nem bloqueia a conta ao receber o pedido. Contas pendentes
precisam concluir o primeiro acesso. Duplicidade antiga de e-mail exige conferência
da secretaria, sem escolher uma conta arbitrariamente.

O link usa 32 bytes aleatórios, dura 30 minutos e funciona uma única vez. O banco
armazena apenas seu hash e uma referência das credenciais: alterar o contato ou
a senha invalida links anteriores. Há intervalo mínimo de um minuto e até três
links válidos por conta; solicitar outro não inutiliza o primeiro. Limitação geral
por origem e de tentativas ainda segue EC-060 e precisa preceder produção.

O segredo vai no fragmento da URL, que não é enviado ao servidor. Ao abrir a tela,
o navegador remove esse fragmento do endereço/histórico e mantém o token somente
na memória. Abrir o link não o consome: a pessoa precisa enviar duas senhas iguais.
Se recarregar a página antes de concluir, reabra o link recebido. Não salvamos o
token no armazenamento do navegador nem o incluímos na página HTML.

A troca de senha, o consumo de todos os links de recuperação/ativação e a revogação
de todas as sessões acontecem na mesma transação. Uma falha desfaz tudo. O login
reconfere a senha verificada sob o mesmo lock, impedindo que uma sessão com senha
antiga sobreviva a uma troca concorrente. Após o sucesso não há login automático:
a pessoa entra com a nova senha. O sistema tenta enviar um aviso da alteração,
sem incluir senha. O instante fica em `accounts.password_reset_at`; isso não
substitui o histórico administrativo futuro.

Em ambiente autorizado, configure o remetente e o provedor conforme o [guia de e-mail](seguranca/falhas-email.md). A origem do portal vem de `PORTAL_PUBLIC_URL`, sem caminho. A recuperação continua com recibo genérico quando o envio está indisponível. As duas APIs continuam recusando produção antes de acessar o banco.

O envio usa `after` do Next.js após responder, com tempo limite e erro genérico
sem dados pessoais nos logs. É uma tentativa no processo do servidor, sem fila
persistente nem garantia de entrega: encerramento do processo ou indisponibilidade
do provedor exige nova tentativa depois do intervalo. Falha no aviso de alteração
não desfaz uma senha já atualizada. A entrega real por e-mail ainda exige validação
no ambiente autorizado. Os testes usam contas fictícias e verificam SMTP/TLS local e falhas simuladas.

A migração é aditiva: uma tabela de tokens e uma coluna opcional. Ao reverter
código, mantenha as APIs de recuperação bloqueadas e as estruturas no banco;
não restaure senhas antigas nem elimine contas/sessões para desfazer a entrega.

Perda do e-mail, contato incorreto, filiação divergente e conta contestada vão à
secretaria, presencialmente ou por solicitação no site. A solicitação abre o
atendimento; não é autorização para transferir a conta. Antes da alteração,
o funcionário confere identidade e registro escolar por canal institucional.
Se o canal remoto não permitir essa conferência, encaminha ao atendimento
presencial. Preservar histórico e registrar operador, motivo, ação e resultado,
sem documentos completos, senhas ou nomes dos familiares nos logs.

Referência: [orientações OWASP para recuperação de senha](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
Painel de atendimento e controles relacionados continuam em cards próprios.

## Minha conta

A pessoa titular pode alterar senha ou e-mail pelo menu **Minha conta**. A alteração exige a sessão da própria conta e a senha atual. Ao salvar uma senha nova, o portal encerra as sessões anteriores e os links de acesso pendentes.

Para alterar o e-mail, o portal envia um link ao novo endereço. O link dura 30 minutos. A pessoa abre o link com a mesma conta e confirma em um botão. Até a confirmação, o endereço atual continua sendo o de login e recuperação. Depois de confirmar, o portal invalida as sessões antigas e tenta enviar um aviso aos dois endereços.

Uma nova solicitação substitui o link anterior. Trocar ou recuperar a senha também invalida o link pendente do novo e-mail. O histórico administrativo guarda a ação, a conta e o horário, sem registrar senhas, tokens ou os endereços trocados. As telas de alteração seguem os controles de acesso de desenvolvimento até a liberação do portal.

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

A secretaria configura as ofertas em `/secretaria/calendarios`, com as datas de
cada módulo e seus períodos. O identificador da oferta deve ser reutilizado na
importação. Alterações criam versões; o histórico anterior é preservado.

Ao abrir ou atualizar a tela, o portal reconcilia os vínculos ativos associados
que tenham progressão automática autorizada. Uma mudança de módulo ou das datas
vigentes exige nova conferência antes da emissão. Pausas, correções escolares e
vínculos encerrados são preservados; ninguém é marcado como concluinte pelo
relógio. Vínculos existentes começam sem oferta e com progressão pausada.
A secretaria associa e ativa a progressão explicitamente, por aluno ou para os
vínculos já associados da página (até 50). A associação não confere o vínculo.

A prévia de importação do subsequente compara módulo e período recebidos com o
calendário, sem alterar cadastros. Divergências exigem confirmação explícita e
mantêm a progressão pausada. A tela de importação do subsequente segue na EC-106;
o importador do integrado continua separado. O aviso de reenvio de planilha
permanece enquanto não houver importação correspondente ao módulo e período.

Não há tarefa agendada instalada nem serviço de produção nesta entrega. A
reconciliação ocorre nas operações da tela; executar independentemente do acesso
exige configurar o agendamento autenticado na implantação da VPS. Datas oficiais
e associações reais devem ser conferidas pela escola antes de usar a rotina.
