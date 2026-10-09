# Consulta institucional de autenticidade por QR Code

Pesquisa de 09/10/2026. Proposta para discussão com secretaria/gestão/GRE, sem implementação ou liberação de emissão oficial.

## Conclusão

É tecnicamente viável associar uma declaração a um código aleatório e a uma consulta no domínio institucional. A página permite conferir o registro de emissão, a situação administrativa e os campos autorizados do documento apresentado. Essa consulta não constitui, por si só, assinatura eletrônica, certificado ICP-Brasil nem prova automática de que todo o papel permanece íntegro.

Há exemplos institucionais de consulta de declarações por link/QR na [UNESPAR](https://apucarana.unespar.edu.br/menu-de-apoio/declaracao-de-matricula-digital-qrcode-baixo-arquivo-na-hora) e de autenticação de documentos no [SUAP/IFRN](https://ajuda.suap.ifrn.edu.br/comum/comum/). Os exemplos demonstram viabilidade; não estendem suas autorizações à ETE.

## Resultado jurídico da consulta

Reconfirmei no original do DOE de 19/12/2025, páginas 11–12, os arts. 10 e 23 da IN SEE/PE 21/2025: o texto exige assinaturas de secretaria e direção e prevê carimbos identificáveis ou validador para assinaturas digitais. Um QR de consulta, isoladamente, não satisfaz essas assinaturas. [Publicação oficial](https://cepebr-prod.s3.amazonaws.com/1/cadernos/2025/20251219/1-PoderExecutivo/PoderExecutivo%2820251219%29.pdf).

Para o fluxo em papel escolhido pela equipe, proponho QR como conferência adicional, mantendo as assinaturas e os carimbos exigidos. A escola deve confirmar o modelo vigente, o uso oficial do domínio, os responsáveis pela emissão e a política de consulta com a GRE/SEE. Não localizei autorização específica do portal ETE Conectada. A existência de registro no banco não garante aceitação universal do documento por terceiros.

O [Decreto PE 58.294/2025](https://legis.policiacivil.pe.gov.br/b/api/files/345689d130acfae07550c23e13e0d551.pdf) disciplina níveis de assinatura e mecanismos de identificação. Uma futura assinatura própria requer enquadramento institucional e controles adequados de autoria/integridade; hash, login e indicação do nome do funcionário não asseguram esse enquadramento automaticamente. A [Lei 14.063/2020](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm) também distingue os níveis e atribui à autoridade competente a definição do mínimo aplicável.

Achado adicional: a Portaria SAD 1.450 de 04/05/2026, publicada em 05/05/2026, reconhece expressamente assinaturas avançadas de CredenciaPE e GOV.BR no âmbito estadual, prevê aceitação e consulta pelos respectivos portais. Ela não menciona o nosso sistema. [DOE, página 9](https://cepebr-prod.s3.amazonaws.com/1/cadernos/2026/20260505/1-PoderExecutivo/PoderExecutivo%2820260505%29.pdf). Conferi o texto pelo PDF oficial; a extração web desse arquivo falhou, mas o download direto funcionou.

## Funcionamento proposto

1. A escola confere todos os dados necessários e prepara a versão do documento destinada à emissão.
2. O servidor gera um código aleatório criptograficamente seguro para aquela versão. O PDF já contém o QR, o endereço institucional e um código legível para consulta manual. Não incluir CPF, matrícula ou outros dados pessoais na URL.
3. Preservar os dados exatamente como aparecem nessa versão, o PDF, seu SHA-256, data, responsáveis e situação. Alterações posteriores no cadastro escolar não podem modificar uma declaração já emitida. Correção implica cancelar/substituir a versão anterior, mantendo o histórico.
4. Secretaria e gestão imprimem, assinam e carimbam. Somente a confirmação autorizada da conclusão permite apresentar o registro como emitido. Gerar uma minuta, registrar um pedido ou baixar o PDF não equivale a concluir a emissão.
5. O leitor abre uma rota como `https://eteconectada.com/validar/<codigo-aleatorio>` — endereço apenas ilustrativo, pois o domínio ainda não foi contratado/aprovado. A consulta compara os dados do documento com a versão preservada.
6. Mostrar situações distintas: registro emitido sem cancelamento; cancelado/substituído; código não encontrado; consulta temporariamente indisponível. Falha do servidor não significa documento inválido. Vencimento só se houver regra institucional aplicável.

O código de consulta e o hash do arquivo têm funções diferentes. O primeiro localiza um registro sem permitir enumeração simples. SHA-256 permite comparar os bytes de um PDF com os do original preservado; não verifica automaticamente uma folha, foto ou assinatura manuscrita. Guardar o hash separado do código também evita tentar inserir no PDF o hash final do próprio arquivo.

Para comprovar posteriormente as assinaturas em papel, definir com a escola a guarda do original físico ou de uma reprodução autorizada; não atribuir ao PDF anterior à impressão assinaturas que só foram feitas no papel.

## Dados mostrados e proteção

Proposta de campos de conferência: emitente, tipo/número, data de emissão, situação, curso, série/modalidade e período a que a declaração se refere. Identificação do aluno precisa ser suficiente para detectar troca de destinatário, com exposição justificada e autorizada pela escola. Nome mascarado com formulário para conferir os dados impressos é uma alternativa a avaliar; mascaramento incompleto não transforma os dados em anônimos.

Não publicar CPF completo, nascimento ou filiação por padrão. Esses dados no papel não tornam necessária sua publicação na internet. A [LGPD, arts. 6, 14 e 23](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) exige necessidade, finalidade e proteção, com atenção especial a crianças/adolescentes e às atribuições do poder público. O controlador institucional deve definir a base legal e a política de compartilhamento, sem presumir consentimento como único caminho.

Proponho não oferecer busca pública por aluno/CPF/matrícula nem PDF completo aberto por padrão. Usar HTTPS, domínio sob controle institucional, códigos imprevisíveis, limitação de tentativas, instruções de conferência do domínio, bloqueio de indexação e cuidado com logs/serviços externos que podem receber a URL. Conhecer o QR permite compartilhar o link; a consulta não é privada só porque não aparece no menu.

## Limite contra fraude

Alguém pode copiar um QR verdadeiro para uma folha alterada. A consulta continuará encontrando o registro legítimo. Por isso, a mensagem deve orientar a comparar os campos exibidos/confirmados com o papel. Campos não apresentados ou conferidos ficam fora dessa verificação. Para identificar alteração integral de um PDF digital, seria necessária conferência do arquivo original/hash ou assinatura eletrônica adequada.

## Pendências de decisão

- Aprovação institucional do uso da consulta e confirmação do modelo vigente.
- Campos públicos e eventual conferência adicional, considerando alunos menores.
- Quem confirma emissão/assinaturas, cancela e substitui documentos.
- Guarda da versão emitida e comprovação das assinaturas em papel.
- Responsabilidade, continuidade e acesso ao domínio/serviço/banco/backup após a saída dos desenvolvedores.
- Futuramente, avaliação de CredenciaPE/GOV.BR ou outra assinatura institucionalmente aceita, caso se deseje eliminar assinatura em papel.
