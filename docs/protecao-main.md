# Revisão e proteção da main

Antes do merge, o outro dev revisa o PR e os dois checks do CI precisam passar no commit atual. Se houver mudanças depois da aprovação, peça nova revisão. Push direto, force push e exclusão de `main` ficam fora do fluxo de trabalho da equipe.

## Situação conferida em 12/10/2026

A API do GitHub informou `protected: false` para `main`. A conta Thz081 tem permissão de escrita, sem administração. O endpoint de proteção retornou404; esse retorno sozinho não identifica o plano contratado. Não foi aplicada uma regra de proteção.

O CI detecta erros e registra os resultados, mas isso **não impede o merge por si só**. Até a configuração administrativa e sua validação, revisão e checks antes do merge dependem do cumprimento do processo pela equipe.

## Configuração para o administrador

No GitHub, abra Settings → Branches e configure uma regra para `main`, caso a opção esteja disponível no plano do proprietário:

- Exigir pull request e pelo menos uma aprovação do outro dev.
- Invalidar aprovações antigas quando novos commits forem enviados.
- Exigir resolução das conversas de revisão.
- Exigir os dois checks abaixo e a branch atualizada com `main`.
- Aplicar a regra também aos administradores, sem bypass rotineiro.
- Manter force push e exclusão da branch desabilitados.

Checks do workflow CI, com origem GitHub Actions:

| Check                                              | Cobertura                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `Build dos dois apps`                              | Tipos, lint, formatação alterada, unitários, guardas e build        |
| `Migrações e integração em PostgreSQL descartável` | Migrações/schema/reexecução, cadastro, declarações, banco e limpeza |

Os nomes foram conferidos nos checks da `main`; se forem renomeados no workflow, atualize a regra. Não selecione os jobs genéricos do Dependabot como substitutos destes checks. A auditoria periódica mantém alertas Prisma conhecidos para triagem; não foi configurada como gate desta regra.

A [documentação do GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) informa que proteção em repositório privado depende de plano elegível. O administrador deve conferir a disponibilidade na conta proprietária; não tornar o repositório público para contornar a limitação. O [guia de configuração](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule) detalha as opções e permissões necessárias.

## Enquanto a proteção não estiver disponível

O autor publica a branch e abre o PR. O colega confere o diff, resultados e limitações, e registra uma aprovação no GitHub. Quem fizer o merge confere novamente os dois checks no commit atual e aguarda qualquer execução pendente. Check falho ou pedido de alteração mantém o PR aberto. Isso é uma regra de trabalho, sem bloqueio técnico equivalente à proteção do GitHub.

Após o merge, confira o CI da `main` e registre o PR no card. Se o CI falhar, priorize corrigir ou reverter a alteração antes de integrar outras mudanças.

## Validar a proteção quando for aplicada

Com autorização da equipe, use um PR temporário com dados fictícios e um erro controlado de tipos. Observe que o merge fica bloqueado pelo check; não confirme um merge para testar. Corrija o erro e confira o bloqueio por ausência de aprovação. Depois da aprovação do outro dev e dos checks verdes, confira a liberação. Feche o PR de prova sem integrar e remova sua branch.

Registre no card a regra aplicada, os commits/checks usados e os resultados observados. A prova da EC-029 confirmou falha de CI por erro de tipos; não demonstrou bloqueio de merge. Essa validação administrativa permanece pendente.

## Exceção urgente

Prefira reverter a mudança problemática em um PR curto, mantendo revisão e checks. Se uma indisponibilidade externa do CI impedir uma correção urgente, registre no PR o motivo, impacto, commit exato, verificações alternativas e aprovação do outro dev. Somente um administrador pode avaliar um bypass excepcional quando houver proteção; a equipe não deve desativar a regra como rotina.

Registre qualquer alteração temporária da regra e sua restauração. Quando o CI voltar, execute-o no commit integrado e acompanhe o resultado no mesmo PR/card. A exceção não autoriza incluir dados reais, ignorar falhas conhecidas de segurança ou publicar o portal em produção.
