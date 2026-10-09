# Declaração de vínculo: modelo e emissão digital

Pesquisa realizada em 03/10/2026. A pesquisa inicial entregou modelos e a proposta de funcionamento. O portal agora gera minutas individuais ou em lote para impressão; emissão oficial ainda depende da validação institucional.

## Arquivos

- `output/pdf/declaracao-vinculo-alinhada.png`: reprodução alinhada da fotografia, gerada com a ferramenta de edição de imagem. Preserva o conteúdo, a data e a linha de assinatura do material enviado; não é um escaneamento oficial. O brasão reconstruído serve como referência visual.
- `output/pdf/declaracao-vinculo-referencia.pdf`: a reprodução em uma página A4.
- `output/pdf/declaracao-vinculo-modelo.pdf`: proposta com texto selecionável, marca institucional já fornecida ao projeto, campos variáveis, dois espaços de assinatura e reserva para validação. Não contém assinatura nem QR code funcional.
- `gerar-modelos.py`: fonte para reproduzir os PDFs com ReportLab e fontes DejaVu Sans. Executar na raiz do repositório; Python precisa ter `reportlab` instalado.

O pedido usado no editor foi restaurar a mesma página em A4, corrigir perspectiva e inclinação, limpar sombras e fundo, preservar textos e composição, sem acrescentar assinatura, carimbo ou QR code. O resultado foi conferido visualmente. Para emissão oficial, usar a marca original aprovada pela escola, não um brasão recriado por IA.

## O que a legislação permite

**Há base legal para uma declaração escolar eletrônica, desde que emitida pela instituição e validada pelos responsáveis competentes.** A IN SEE/PE 21/2025, publicada em 19/12/2025, trata da escrituração escolar, admite validador nas assinaturas digitais (art. 10) e exige assinaturas da secretaria escolar e da direção. Para a declaração, o art. 23 pede identificação, nome social quando aplicável, nascimento, filiação, naturalidade/UF, período letivo, ano/série, conteúdo, local e data. O art. 22 disciplina quem solicita; o art. 56 revoga a IN 05/2025. [Diário Oficial de Pernambuco](https://cepebr-prod.s3.amazonaws.com/1/cadernos/2025/20251219/1-PoderExecutivo/PoderExecutivo%2820251219%29.pdf).

A Lei 14.063/2020 distingue assinatura simples, avançada e qualificada. A qualificada utiliza certificado ICP-Brasil; a autoridade pública define o nível mínimo aplicável ao serviço. [Lei 14.063/2020, arts. 4 e 5](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm). A MP 2.200-2 reconhece os documentos eletrônicos e a presunção ligada à ICP-Brasil, sem excluir outros meios aceitos pelas partes. [MP 2.200-2/2001, art. 10](https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm).

O Decreto estadual 58.294/2025 regulamenta as assinaturas na Administração Pública de Pernambuco, contempla assinaturas avançadas e permite à autoridade competente exigir nível superior. A norma escolar faz referência a esse decreto. A escolha efetiva para a ETE deve ser confirmada com direção, secretaria e, quando necessário, GRE/SEE; não foi localizado um ato que autorize especificamente esta plataforma. [Decreto, publicado em 21/03/2025](https://cepebr-prod.s3.amazonaws.com/1/cadernos/2025/20250321/1-PoderExecutivo/PoderExecutivo%2820250321%29.pdf).

Na consulta também apareceu a IN SEE 4/2026 com referência ao número 21/2025, mas seu teor trata de EJA Quilombola e dos arts. 12/17, não dos arts. 10/23 acima. A indicação numérica no ato é inconsistente com a ementa da norma de escrituração; confirmar a consolidação oficial com a GRE/SEE antes de implantar. [Publicação de 27/03/2026](https://cepebr-prod.s3.amazonaws.com/1/cadernos/2026/20260327/1-PoderExecutivo/PoderExecutivo%2820260327%29.pdf).

## Certificado e liberação

| Caminho | Funcionamento | Providência |
| --- | --- | --- |
| Assinatura avançada GOV.BR | Responsáveis assinam o PDF com contas prata/ouro; serviço gratuito | Confirmar o aceite institucional e preservar as duas assinaturas válidas |
| Assinatura qualificada ICP-Brasil | Responsáveis assinam usando certificados emitidos pela cadeia ICP-Brasil | Obter certificados adequados e definir custódia, autorização e renovação |
| Integração GOV.BR dentro do portal | A assinatura é acionada pelo sistema, com participação do signatário | Solicitação formal de integração por agente público/gestor, homologação e aprovação |

O assinador público pode ser utilizado manualmente, sem uma integração da ETE com a API. [Assinatura eletrônica GOV.BR](https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica/assinatura-eletronica/). A integração programática exige análise do órgão; a orientação oficial exige integrar primeiro o Login Único antes da assinatura avançada. Isso não obriga, por si só, trocar o login atual de todos os alunos. [Serviço de integração](https://www.gov.br/governodigital/pt-br/estrategias-e-governanca-digital/transformacao-digital/servico-de-integracao-aos-produtos-de-identidade-digital-gov.br/).

Não foi encontrada uma licença federal específica para criar a página de consulta por QR code. Isso não substitui a aprovação administrativa da emissão, dos signatários, do modelo e da política de dados pela escola/SEE. Um certificado próprio do servidor ou o HTTPS do site não equivalem a certificado ICP-Brasil dos signatários.

## QR code: fluxo recomendado

1. A secretaria confere os dados e a finalidade; o sistema gera um identificador aleatório não sequencial e um PDF com QR code e código legível.
2. Secretaria escolar e direção assinam o PDF. O segundo processo precisa preservar a primeira assinatura; validar as duas antes de disponibilizar.
3. Guardar o PDF final, sem alterações, em armazenamento privado. Registrar o hash SHA-256 desse arquivo, versão, datas, responsáveis e situação do documento no banco. Acrescentar QR code depois de assinar compromete a assinatura.
4. O QR aponta para o domínio institucional com HTTPS, em uma rota como `/validar-documento/<codigo>`. O domínio ainda precisa ser contratado e aprovado para esse uso.
5. A consulta exibe emitente, tipo, data, código, identificação mínima e situação: emitido, cancelado ou não encontrado. A situação administrativa e a integridade criptográfica são verificações distintas.
6. O original assinado permite conferir a assinatura no VALIDAR/ITI. O acesso completo deve respeitar a política de compartilhamento aprovada. Não presumir que qualquer QR do portal será compatível com a leitura direta do ITI; essa compatibilidade tem especificação própria.

**O QR identifica o registro; sozinho não assina o documento.** Alguém pode alterar um papel e manter seu QR. A conferência deve comparar o conteúdo com o original assinado ou com uma representação oficial suficiente, dentro das regras de acesso. Impressão não preserva a assinatura criptográfica; a prova é o arquivo digital original. O ITI distingue imagem de assinatura manuscrita de assinatura eletrônica. [Dúvidas do VALIDAR](https://validar.iti.gov.br/duvidas.html).

Por necessidade e proteção de crianças/adolescentes, a consulta pública não deve expor CPF completo, nascimento e filiação. Não colocar esses dados na URL, nem oferecer busca pública por CPF. O QR/código também não deve transformar automaticamente o PDF inteiro em um arquivo público; definir acesso e compartilhamento com a escola. [LGPD, arts. 6, 14 e 23](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

## Diferenças entre a foto e o modelo proposto

- A reprodução mantém a foto. A proposta acrescenta naturalidade/UF, período letivo, nome social quando aplicável e o segundo signatário.
- A frequência de 100% da referência não pode virar regra automática. A proposta pede percentual e intervalo de apuração, e o bloco só entra se pertinente e comprovado.
- Curso, série, turno, horários e vínculo precisam vir dos registros validados. Na pesquisa inicial, o banco continha apenas CPF, nascimento e nome. A importação posterior acrescentou matrícula, turma, série e sigla do curso; filiação, naturalidade/UF e frequência continuam ausentes.
- Endereço, telefone, marca, textos, responsáveis e regras de atendimento a menores precisam ser conferidos pela escola.

## Próxima etapa sugerida

### Prioridade definida pela equipe: impressão e assinatura em papel

Em 03/10/2026, a equipe confirmou a escolha de gerar a declaração preenchida, pronta em A4, e imprimir para colher assinatura manuscrita e carimbo dos responsáveis. Assinatura eletrônica fica para uma etapa futura. A geração de minutas A4 e o download para impressão foram implementados depois desta decisão; os PDFs continuam sendo modelos em revisão. A equipe pretende conversar com a secretaria sobre as divergências entre o modelo fotografado e os requisitos encontrados; confirmar o modelo vigente e eventuais orientações da GRE, sem tratar a comparação com uma fotografia como conclusão definitiva sobre a regularidade de toda a emissão da escola.

Fluxo proposto: secretaria seleciona o aluno, confere os dados, gera o PDF, imprime e colhe as assinaturas previstas na norma. A operação do sistema pela secretaria não dispensa a assinatura da direção nem as regras institucionais de substituição. A escola/GRE deve validar modelo e responsáveis antes da emissão oficial.

Se houver QR code nessa etapa, ele pode consultar o registro e a situação administrativa da declaração. Não atribuir assinatura digital ao PDF sem assinatura, nem marcar uma folha como assinada somente porque foi gerada ou impressa. A forma de registrar a conclusão da assinatura em papel e permitir comparar o conteúdo deve ser definida com a escola.

### Opção futura: assinatura eletrônica

Quando solicitada e aprovada, adicionar assinatura dos responsáveis em ferramenta aceita pela SEE, conferir o arquivo no ITI quando compatível e disponibilizá-lo pelo fluxo autorizado. Automatizar a assinatura e a validação somente após essas definições. O portal não deve emitir em nome dos responsáveis usando credenciais compartilhadas com alunos ou desenvolvedores.

## Conferência dos campos e impressão em lote — 03/10/2026

Reconsulta ao original do DOE de 19/12/2025, páginas 11/12: o art. 23 enumera nascimento, filiação, naturalidade/UF, período, ano/série, texto, local/data e as duas assinaturas. O art. 10, §1º, prevê os respectivos carimbos legíveis com nome completo, função e matrícula/autorização; portanto, nomes digitados no portal podem ficar em branco para identificação no carimbo, sem dispensar assinatura/carimbo no papel. Nome social é incluído quando aplicável. O percentual não aparece como item geral obrigatório do art. 23: depende do teor/finalidade (art. 22, §1º). Quando declarado, usar o percentual real e informar o intervalo de apuração. CPF não é enumerado nesse artigo como requisito geral da declaração, embora seja usado no acesso ao portal. Também conferir metadados do cabeçalho exigidos no art. 7º (cadastro escolar, INEP, atos autorizativos e tipificação); ainda não fornecidos para o modelo oficial.

A equipe confirmou manter secretaria e gestor por enquanto e consultará a escola. O portal agora prepara minutas individuais ou lote de até 100 páginas, com dados conferidos por aluno. Filiação, naturalidade e frequência não estavam no backup: devem ser fornecidas pela escola, sem presumir valores. O preenchimento atual fica em memória e não altera o cadastro. Para emissão automática com somente assinatura/carimbo pendentes, esses campos deverão passar a vir de um cadastro/arquivo institucional autorizado. O PDF em lote não substitui a assinatura e o carimbo em cada declaração.
