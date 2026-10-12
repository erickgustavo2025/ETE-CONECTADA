# Tipos, lint e formatação

Na raiz, com Node24 e `npm ci --ignore-scripts`:

```bash
npm run typecheck
npm run lint
npm run format:check
```

`typecheck` gera o cliente Prisma e os tipos de rotas do Next e executa TypeScript sem emitir JavaScript nos dois apps. Não conecta ao banco. A geração escreve arquivos locais em `src/generated`, `.next` e `next-env.d.ts`; execute as verificações em uma cópia separada se precisar preservar um servidor em execução.

`lint` verifica apps, scripts e código compartilhado. Usa as regras recomendadas de ESLint/TypeScript e as regras fundamentais de Hooks (ordem de chamada e dependências). Avisos também reprovam. Não inclui o pacote completo de regras do Next/React Compiler; verificações de acessibilidade e regras específicas do Next não são cobertas por esta configuração.

## Formatação gradual

Para evitar uma reformatação geral, o padrão verifica arquivos novos e alterados em relação a `origin/main`, incluindo alterações locais e staged. Atualize essa referência com `git fetch origin main`. Arquivos ignorados pelo Git, gerados, lockfile e gestão local ficam fora do escopo. A ausência da referência reprova a checagem, em vez de aprová-la sem verificar.

```bash
npm run format
npm run format:check
# Outra base explícita, se necessário:
FORMAT_BASE=HEAD npm run format:check
# Diagnóstico de todo o código rastreado, incluindo formatação antiga:
npm run format:check:all
```

`format` modifica somente os arquivos selecionados; revise o diff antes do commit. A checagem completa pode apontar pendências antigas que não foram reformadas nesta entrega. O escopo incremental não substitui lint ou tipos: essas duas verificações cobrem todo o código das aplicações.

Também existem `typecheck`, `lint`, `format` e `format:check` em cada workspace:

```bash
npm run typecheck --workspace @ete-conectada/portal
npm run lint --workspace @ete-conectada/site
npm run format:check --workspace @ete-conectada/portal
```

O lint individual cobre aquela aplicação; o comando da raiz também cobre `shared` e os scripts raiz. A formatação individual limita o escopo à aplicação escolhida.

## CI

O job Build dos dois apps confere tipos, lint, formatação alterada, testes unitários/guardas e build. Em PRs, usa o commit-base do PR para a formatação; em pushes, o commit anterior. Para publicação inicial de uma branch, usa `origin/main`. O checkout traz o histórico necessário. Qualquer erro interrompe o job; o job separado de migrações/integração mantém seu banco descartável e cleanup.

Referências: [ESLint/TypeScript](https://typescript-eslint.io/docs/), [Hooks](https://react.dev/reference/eslint-plugin-react-hooks), [tipos Next](https://nextjs.org/docs/app/api-reference/config/typescript), [Prettier](https://prettier.io/docs/cli).
