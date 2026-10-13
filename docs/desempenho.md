# Medição de desempenho

O comando `npm run measure:performance` mede o fluxo atual com dados fictícios. Ele inicia seu próprio portal e só aceita PostgreSQL descartável em loopback, com o marcador e as permissões descritos em [Testes isolados](testes-isolados.md). Execute em uma cópia do repositório sem `.env.local`, depois de instalar dependências, aplicar migrações e gerar Prisma. Não rode na pasta onde seu servidor de desenvolvimento está aberto.

```sh
npm run measure:performance > /tmp/ete-desempenho.log
npm run test:cleanup
```

As variáveis `NODE_ENV=test`, `TEST_DATABASE_URL`, `TEST_DATABASE_NAME`, `TEST_DATABASE_ID` e `ALLOW_TEST_DATABASE_WRITES=true` são as mesmas dos testes isolados. Não use `TEST_BASE_URL`. O comando limpa somente os registros sintéticos que criou, encerra o portal próprio e desconecta Prisma mesmo em falha. Não imprime corpos de requisição/resposta, cookies, senhas ou endereços do banco.

## O que é medido

- Três processos Next novos, com 500 alunos sintéticos em cada rodada e concorrência de uma requisição.
- Primeira chamada e 20 chamadas aquecidas por rodada: login HTTP, busca da secretaria com página de 20 alunos e geração HTTP de uma declaração.
- Geração direta de PDF de 1, 20 e 100 páginas: primeira chamada e cinco aquecidas por tamanho. O cache de fontes/imagem começa vazio somente no primeiro tamanho. Os demais tamanhos já aproveitam esse cache.
- Latência inclui leitura completa da resposta HTTP; a medição direta termina quando os bytes do PDF estão prontos. A validação posterior confere páginas e não entra nessa latência.
- p50 e p95 pelo posto mais próximo, máximo e tamanho máximo da resposta. Com cinco amostras, p95 é o máximo observado; não é uma estimativa confiável da cauda em produção.
- CPU acumulada e pico de RSS do processo Node do medidor durante os lotes diretos, incluindo a validação dos PDFs e trabalho anterior. Esse pico não mede o Next ou PostgreSQL em processos separados, nem significa memória por página.

O login inclui consulta da conta, verificação da senha e criação de sessão. `Server-Timing` separa essas etapas. A busca confere total de 500 e limite de 20 registros; os PDFs são carregados novamente para conferir a quantidade de páginas. Nenhum PDF é gravado.

## Metas iniciais para comparação

Estas são metas de investigação do ambiente local, com uma execução por vez. Não são SLA da escola, bloqueio de merge ou garantia da VPS futura. Compare com a mesma máquina, versão, carga e modo de execução; confirme depois na hospedagem aprovada.

| Operação aquecida             | Meta inicial de p95 |
| ----------------------------- | ------------------- |
| Login HTTP                    | Até 500 ms          |
| Página de 20 alunos entre 500 | Até 500 ms          |
| PDF HTTP de uma página        | Até 2 s             |
| PDF direto de 20 páginas      | Até 5 s             |
| PDF direto de 100 páginas     | Até 15 s            |

Referências de recursos: resposta de uma página da lista até 128 KiB; PDF de até 100 páginas até 5 MiB; pico do medidor até 512 MiB. Ao superar uma referência, repita a execução e investigue antes de alterar a aplicação. A memória agregada de Next, PostgreSQL e sistema operacional ainda precisa de medição na implantação; estes limites não dimensionam a KVM4.

A primeira chamada é registrada separadamente, sem meta rígida: Next em desenvolvimento compila rotas sob demanda. O cache em disco da compilação, o PostgreSQL e o sistema operacional podem estar aquecidos mesmo com um processo novo. Isso não simula máquina recém-ligada, banco Neon suspenso, rede móvel, renderização no navegador ou carga simultânea.

## Como decidir uma alteração

Guarde duas execuções com ambiente, amostra e revisão do código. Se uma operação exceder a meta nas duas, localize o custo observado, altere uma coisa e repita com a mesma carga. Não remova validações, reduza a proteção da senha ou reutilize dados privados entre usuários para ganhar tempo. Se a melhora ficar dentro da variação normal, descarte a mudança.

A medição é manual para evitar falhas de CI causadas por máquinas compartilhadas e compilação em desenvolvimento. Os testes funcionais seguem no CI. Ao liberar autenticação em produção, medir novamente com build de produção, conexão aprovada e concorrência representativa antes de definir alertas ou prometer capacidade.

## Referência local de 12/10/2026

Duas execuções no Linux x64, Ryzen 7 7735HS (16 CPUs lógicas), Node 24.21.0, Next 16.4.0 em desenvolvimento e PostgreSQL 16 em loopback. Mesma implementação nas duas; nenhuma otimização aplicada. Valores HTTP abaixo são o maior p95 das três rodadas de cada execução, cada rodada com 20 amostras aquecidas. Os lotes diretos têm cinco amostras aquecidas por tamanho e execução.

| Operação                  | Execução 1 | Execução 2 |
| ------------------------- | ---------- | ---------- |
| Login HTTP                | 76,4 ms    | 67,1 ms    |
| Lista paginada            | 27,7 ms    | 36,0 ms    |
| PDF HTTP de uma página    | 153,8 ms   | 154,0 ms   |
| PDF direto de uma página  | 207,3 ms   | 115,1 ms   |
| PDF direto de 20 páginas  | 517,5 ms   | 721,4 ms   |
| PDF direto de 100 páginas | 2.422,1 ms | 2.431,9 ms |

Primeiros logins: 3,05–3,33 s; primeira busca: 0,43–0,67 s; primeiro PDF HTTP: 1,11–3,27 s. No primeiro login, `Server-Timing` apontou aproximadamente 114–120 ms de consulta, 42 ms de senha e 11–14 ms de sessão na primeira execução. O tempo HTTP restante inclui trabalho do Next, compilação e transporte; não foi isolado por um trace.

A lista retornou cerca de 7 KiB e o PDF de 100 páginas cerca de 298 KiB. O pico acumulado de RSS do medidor foi 447,5 e 429,3 MiB. A variação entre execuções, especialmente no lote de 20 páginas, reforça que uma única leitura não justifica uma otimização. Todas as operações ficaram dentro das referências locais; não foram introduzidos caches, índices ou alterações na senha. Os relatórios numéricos completos ficam em `tasks/ec-079-evidencias/` local, fora do Git.
