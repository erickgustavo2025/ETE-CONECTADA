# Regressão da importação de alunos

Os dois caminhos usam a API privada de inspeção, prévia e confirmação. Os testes
geram XLS fictícios em memória e usam PostgreSQL descartável identificado. Não
copiam registros da escola nem dependem de e-mail ou serviços governamentais.

## Cobertura por modalidade

| Critério                                                   | Integrado                                           | Subsequente                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Arquivo inválido e matrícula repetida com nomes diferentes | `test:sheet-input`, nos unitários                   | Mesmo teste, executado explicitamente na modalidade                              |
| Matrículas de seis a oito dígitos e zeros iniciais         | `test:sheet-input` e primeiro acesso HTTP/navegador | `test:sheet-input` e DS em `test:subsequent-import`                              |
| Modalidade/curso incompatíveis                             | `test:sheet-input` e `test:sheet-import`            | `test:subsequent-import`: ADM, DS e Enfermagem; módulos 3/4                      |
| Prévia sem alterar alunos/vínculos                         | `test:sheet-import`                                 | `test:subsequent-import`, inclusive lote com atualização e inclusão              |
| Atualização explícita e preservação da outra modalidade    | `test:sheet-import` e `test:sheet-history`          | `test:subsequent-import` e `test:sheet-history`                                  |
| Arquivo ou confirmação repetidos sem duplicação            | `test:sheet-import` e `test:sheet-history`          | `test:subsequent-import`, incluindo repetição após recuperar lote recusado       |
| Rollback após escrita, sem consumir a prévia               | `test:sheet-import` e `test:sheet-history`          | `test:subsequent-import`, em ADM, DS e Enfermagem                                |
| Histórico e calendário preservados em lote recusado        | Histórico no `test:sheet-history`                   | Snapshot de pessoa, vínculos, histórico e calendário em `test:subsequent-import` |
| Conferência no navegador                                   | `tests/browser/importacao.spec.ts`                  | `tests/browser/subsequente.spec.ts`                                              |

Arquivo duplicado (reimportação) é diferente de matrícula duplicada dentro do
arquivo: o primeiro é idempotente; o segundo deve ser recusado. Uma pessoa pode
ter vínculos nas duas modalidades. Colisão significa tentar associar uma fonte
ou vínculo à modalidade/curso errados, e não proibir essa coexistência.

Autorização, origem, token vinculado ao operador, expiração, prévia desatualizada
e confirmação concorrente são exercitados em `test:sheet-import`, no serviço
compartilhado. Os testes do subsequente acrescentam calendário, divergência
explícita, limites do curso e preservação do integrado. Estas são coberturas
complementares; não há promessa de testar todas as combinações possíveis.

## Executar e conferir o CI

Prepare somente o banco descartável descrito em [Testes isolados](testes-isolados.md).
Os comandos abaixo partem da raiz; não os execute contra a demonstração em uso.

```bash
npm run test:unit
npm run test:integration
npm run test:browser
npm run test:cleanup
```

No workflow `CI`, os unitários pertencem ao job de build. O job **Migrações e
integração em PostgreSQL descartável** executa a integração serial, as jornadas
Chromium e a conferência de limpeza. Falha interrompe a sequência; limpeza e
remoção do banco continuam nas condições `always()` já configuradas.

## Controle negativo

Uma suíte verde também precisa demonstrar que detecta regressões reais. Faça a
prova em uma branch temporária, sem PR, derivada do commit que será entregue:

1. Suspenda somente a gravação de histórico de importações do subsequente no
   serviço compartilhado, mantendo as asserções dos testes intactas.
2. Confira que o teste de histórico reprova pela ausência da versão anterior,
   e não por instalação, formatação ou indisponibilidade do banco.
3. Publique apenas a branch de controle e confira essa mesma falha no job de
   integração. Registre SHA, execução, etapa e resultado da limpeza.
4. Restaure o serviço original, confirme que a branch de entrega não contém a
   alteração defeituosa e que seu CI passa. Remova a branch temporária ao encerrar.

Não se introduz essa falha na `main`, não se altera o resultado esperado para
fabricar um vermelho e não se enfraquecem as asserções para obter um verde.
Os links e resultados da prova específica ficam no card e na descrição da entrega.

Passar nessas verificações não aprova as datas oficiais dos calendários, o modelo
de declaração, a emissão oficial ou o uso de dados reais em produção.
