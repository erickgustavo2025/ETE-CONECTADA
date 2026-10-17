# Limites de tentativas de acesso

O portal recusa rajadas no servidor, antes de verificar senha, filiação ou token. A pausa é temporária e não muda a situação da conta. A resposta usa status `429`, `Retry-After` em segundos e `Cache-Control: no-store`, com uma orientação simples para tentar novamente depois.

| Ação                                              | Orçamento individual                         | Janela     |
| ------------------------------------------------- | -------------------------------------------- | ---------- |
| Login                                             | 10 tentativas por identificador e por conta  | 5 minutos  |
| Primeiro acesso: conferência e início do cadastro | 20 tentativas compartilhadas pela matrícula  | 15 minutos |
| Confirmação do e-mail de cadastro                 | 10 tentativas por token                      | 5 minutos  |
| Solicitação de recuperação                        | 5 tentativas por e-mail, exista conta ou não | 15 minutos |
| Confirmação de recuperação                        | 10 tentativas por token                      | 5 minutos  |

Há também um orçamento global de 600 entradas por minuto, somando essas rotas. Ele contém trabalho no banco e no cálculo de senha diante de rotação de identificadores. O limite adicional por conta não cobra o orçamento global novamente. As janelas começam na primeira tentativa; uma requisição recusada não estende a pausa individual. Requisições inválidas recusadas na validação inicial continuam sujeitas ao limite de corpo de 4 KB.

CPF e e-mail que pertencem à mesma conta compartilham o limite dessa conta. Um login correto limpa os contadores individuais dos dois identificadores, depois da criação de sessão conferida. A recuperação confirmada também os limpa na transação que troca a senha e revoga as sessões e tokens antigos. O orçamento global permanece. Os controles anteriores de envio da recuperação — intervalo e quantidade de links — continuam valendo.

## Armazenamento e tempo

Os contadores ficam no PostgreSQL existente, compartilhados entre processos e reinícios. A admissão é uma transação curta com lock de um estado técnico; cálculo de senha e envio de e-mail ficam fora dela. Falha do armazenamento recusa a operação com erro genérico; não há fallback que libere acesso.

As chaves dos contadores são HMAC-SHA256, com material aleatório persistente criado pela migração. Não se guardam CPF, e-mail, filiação, senha ou token puro nessas tabelas. Isso é pseudonimização, não anonimização nem criptografia do banco: quem comprometer também o material da chave pode testar hipóteses de identificadores. A conta do banco precisa das restrições de acesso e backup previstas para produção.

O limite de cardinalidade é de 20 mil contadores ativos ou ainda não coletados. Uma coleta remove expirados no máximo uma vez por minuto, quando há requisições. Os cálculos e gravações de tempo usam epoch e funções SQL do PostgreSQL, evitando diferenças de fuso na representação de timestamps pelo driver. O comportamento geral de datas do restante da aplicação segue a revisão EC-119.

## Verificação e limites

`npm run test:access-throttle` verifica rajadas, normalização, CPF/e-mail alternados, cabeçalhos de IP falsos, isolamento entre alunos, expiração, login correto, recuperação, confirmação de links, dois processos em UTC/Fortaleza, cardinalidade, coleta, rollback e erro do armazenamento. A suíte de navegador verifica a mensagem, teclado e telas pequenas. A preparação usa somente o [banco identificado de teste](../testes-isolados.md).

O helper encerra o portal sintético e remove os contadores técnicos que ele gerou. `test:cleanup` continua somente leitura e confere que não restaram contadores ou registros de pessoas. O estado técnico da chave persiste como configuração, assim como as migrações; não é fixture de aluno.

Os limites iniciais são decisões deste projeto e precisam ser calibrados com tráfego legítimo antes da implantação. Não se usa um bloqueio baixo baseado apenas em IP, pois a escola compartilha rede. Cabeçalhos como `X-Forwarded-For` não alteram esses limites. O proxy confiável, proteção na borda, TLS e observabilidade continuam nas etapas de infraestrutura: este controle não impede sozinho DDoS ou um ataque que consuma todo o orçamento global.

Referências: [OWASP — Login Throttling](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling) e [OWASP — Denial of Service](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html#rate-limiting). A OWASP discute o equilíbrio entre proteção e disponibilidade; não prescreve os números escolhidos para esta escola. A produção permanece desabilitada.
