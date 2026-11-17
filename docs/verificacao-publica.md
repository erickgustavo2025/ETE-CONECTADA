# Verificação pública de declarações

Contrato técnico aprovado pela equipe em04/11/2026. Não constitui aceite jurídico
ou institucional dos modelos. GOV.BR está fora deste fluxo; os modelos com as
assinaturas fornecidas pela escola ficam para a etapa final046/054.

## O que a consulta mostra

O QR contém somente o endereço canônico configurado no servidor e um código
aleatório de32bytes. `PORTAL_PUBLIC_URL` define a origem; Host/forwarded nunca
escolhem o endereço. HTTPS é obrigatório fora de desenvolvimento/teste. Endereços
locais explicitamente configurados são permitidos em teste; um QR com localhost
não torna o servidor acessível pelo celular de outra pessoa.

A resposta pública contém apenas código, situação, instante da consulta,
identificação da escola/tipo, data da emissão, curso, modalidade, série ou módulo,
período e nome parcialmente oculto. O nome social preservado, quando houver,
tem preferência no texto mascarado. A conferência aceita um nome completo do
aluno preservado no documento, sem devolver nomes completos. Essa conferência
não autentica conta, concede permissões ou libera download.

Nunca retorna CPF, nascimento, naturalidade, filiação, matrícula, IDs internos,
conta, motivo privado de cancelamento, lista de alunos ou PDF. O snapshot privado
não é serializado. Nome completo vai somente no corpo de uma consulta explícita;
não entra em endereço, logs, analytics ou armazenamento da aplicação no navegador.

## Situação e original

- Declaração válida: emissão escolar publicada para consulta, arquivo original
  guardado, sem evento terminal e ainda apontada como documento atual.
- Cancelado: evento de cancelamento preservado, mesmo depois de outra emissão.
- Substituído: uma nova emissão bem-sucedida tornou a anterior histórica.
- Não encontrado: código inexistente ou registro anterior que continua privado.
- Indisponível: falha de serviço/dados inconsistentes; não significa inválido.

A consulta lê um snapshot consistente no banco e não usa cache. Recarregar,
Atualizar consulta e retornar à aba consultam novamente; respostas antigas não
substituem as novas. Não há expiração por prazo. A situação diz respeito ao
registro do documento, sem recalcular o cadastro atual ou afirmar presença atual.
Documentos anteriores não emitidos e registros sem publicação explícita permanecem privados.
A secretaria pode cancelar; substituição de emissão exige nova emissão, não
promoção manual de um registro antigo. Arquivos de demonstração permanecem identificados como tais, inclusive quando cancelados ou substituídos.

Copiar o QR não comprova o conteúdo inteiro. O navegador compara SHA-256 do PDF
selecionado com o original, sem upload. Só lê arquivos de até16MiB, sob demanda,
e descarta resultados de leituras antigas. Igualdade de bytes não desfaz um
cancelamento/substituição nem comprova assinatura. A página orienta conferir
os dados de versões impressas; teste físico de impressão continua necessário.

## Acesso, limites e reversão

O POST `/api/documentos/verificacao` é anônimo, exige mesma origem e JSON de até4KiB,
aceita somente code/fullName e não fornece busca/listagem. Sem CORS aberto.
Usa no-store/no-referrer/noindex e as políticas existentes de CSP/frames.
Limites persistentes:60consultas simples e10conferências de nome por código em5min;
orçamento público global300/min separado do login. Identificadores são HMAC,
com expiração/coleta e cardinalidade limitada. Erros não expõem valores privados.

`DECLARATION_ISSUANCE_MODE=school` habilita o fluxo de documentos escolares
com origem pública explícita válida. `PORTAL_PUBLIC_URL` precisa caber no QR e
usar HTTPS em produção; configuração incompleta ou modo desconhecido recusa a
emissão, sem cair no fluxo antigo. Habilitar este modo é uma decisão de operação,
não prova de assinatura, aceite jurídico ou conclusão dos modelos EC046/054.
Não habilita autenticação, remetente de e-mail, VPS ou publicação por si só.

Novos documentos escolares usam snapshot3 (`testOnly:false`,
`issuanceMode:SCHOOL`) e arquivo `vinculo-a4-qr-v1`. `snapshot2`/testOnlytrue com
template `minuta-a4-qr-v1` continua sendo demonstração; snapshot1 é preparação
anterior, sem emissão pública. A migração é aditiva e não atualiza registros ou
bytes anteriores. O servidor exige correspondência de versão/proveniência/template;
uma amostra antiga não pode ser promovida por trocar apenas o texto da tela.

`DECLARATION_REGISTRY_PREVIEW=true`, sem modo escolar, conserva a compatibilidade
somente em development/test; permanece bloqueado em produção. A consulta distingue
uma demonstração de uma declaração escolar e não afirma validade escolar para a
amostra. Cancelar/substituir continua refletido no QR. PDF é sempre privado:
a secretaria ativa acessa o original autorizado, e o aluno somente o próprio
arquivo individual. As rotas antigas de preparação manual retornam410 no modo
escolar; o aluno usa a emissão automática.

Para desabilitar o fluxo, retire o modo escolar; não apague arquivos, eventos ou
tabelas nem reescreva o histórico. O controle atual de novas demandas do aluno é
independente da existência e consulta dos PDFs anteriores. Backup precisa manter
os bytes, ponteiros e eventos, além de comparar catálogo/regras.

## Verificação reproduzível

`npm run test:public-verification` usa banco descartável identificado e cobre
whitelist, nomes, legado, origem, limites, erro503 e estados após mudanças.
`verification.spec.ts` cobre navegador sem login, nome/arquivo local, reflow,
resposta atrasada, cancelamento/substituição e recuperação de falhas.
`npm run test:pdf-qr` exige Poppler (`pdftoppm`) e decodifica os dois PDFs renderizados
a150dpi com jsQR, independente do gerador. As dependências fixadas são
qrcode-generator2.0.4 MIT (runtime, sem transitivas) e jsQR1.4.0 Apache2.0 (teste).
A licença do gerador acompanha as imagens; nenhum serviço externo recebe PDFs.
O pipeline prepara essa checagem sem reativar os workflows manualmente suspensos.

`npm run test:declaration-configuration --workspace @ete-conectada/portal` confere
origem, HTTPS, configuração explícita e falha fechada sem dependência no ambiente
implícito do processo. `test:school-issuance` exige banco sintético identificado
próprio: prova snapshot3, constraints, os dois cursos/modalidades, proveniência e
bytes anteriores, downloads privados, cancelamento/substituição e bloqueios. Os
registros sintéticos ficam no banco até descartar a instância inteira, sem apagar
histórico para facilitar o teste. O navegador executa também os dois modos escolares
em `automatic-declaration.spec.ts`, incluindo naturalidade e leitura pública.
