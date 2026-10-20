# Branches e pull requests

Cada mudança usa uma branch curta criada da `main` atualizada, com o ID do card e uma descrição em ASCII: `feature/ec-027-padrao-pr`, por exemplo. A branch contém o projeto inteiro; o nome não limita os arquivos que podem mudar. As branches antigas de área são referências iniciais: prefira uma branch nova por card para evitar acumular mudanças sem integração.

## Começar uma tarefa

Escolha um card pronto em A Fazer, combine quem implementa e quem revisa e mova o mesmo card para Em Andamento. Cada pessoa mantém um card ativo. Antes de mexer em `package.json`, lockfile, Prisma/migrações ou `shared/`, combine os arquivos e a ordem de integração com o colega.

Na raiz, com o trabalho anterior salvo e a árvore limpa:

```bash
git status --short --branch
git switch main
git pull --ff-only origin main
git switch -c feature/ec-027-padrao-pr
```

Troque o nome da branch pelo card escolhido. `--ff-only` atualiza a branch somente quando basta avançá-la, sem criar um merge local. Se houver divergência, pare e confira os commits com o colega antes de integrar; preserve o trabalho dos dois.

## Verificar e publicar

Execute as verificações pertinentes à mudança e registre comando e resultado. Para código compartilhado ou alterações nas aplicações, `npm run build` verifica os dois apps; os demais comandos e a preparação do banco descartável estão no [README](../README.md#verificações-disponíveis). Para uma alteração apenas documental, revise conteúdo, links e diff. Use dados sintéticos nos testes e evidências. Antes de encerrar uma funcionalidade, confira os usos indevidos aplicáveis no [guia de segurança por funcionalidade](seguranca/verificacao-por-funcionalidade.md) e registre as verificações no PR.

```bash
git diff
git add .github/PULL_REQUEST_TEMPLATE.md docs/contribuicao.md README.md
git diff --staged
git commit -m "docs: padronizar branches e pull requests por card"
git push -u origin feature/ec-027-padrao-pr
```

Esse exemplo publica o EC-027; em outro card, adapte arquivos, mensagem e branch ao que foi revisado. Commits usam `feat`, `fix`, `test`, `docs`, `refactor` ou `chore`, seguidos de uma descrição curta do resultado. Prefira commits pequenos com uma finalidade.

No GitHub, abra o PR com **base `main`** e **compare a branch do card**. Use um título direto, como `fix(auth): evitar credenciais na URL antes da hidratação`. Preencha o [template](../.github/PULL_REQUEST_TEMPLATE.md) com problema, solução, verificações e link do card. Inclua limitações quando afetarem a revisão; nomes da equipe e acompanhamento da sprint ficam nos campos do GitHub e no Trello.

O template passa a preencher novos PRs depois de integrado à branch padrão, conforme a [documentação do GitHub](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository). Neste primeiro PR, copie a descrição preparada. Por padrão, o agente fornece título, descrição e origem/destino; a equipe abre o PR. O agente só cria o PR quando solicitado.

## Revisar e integrar

O outro dev revisa o diff, os critérios do card e as evidências. Registre a revisão no PR; revisão automatizada pode ajudar, mas não representa o aceite do colega. Os dois checks do CI devem passar no commit atual antes do merge. A [regra de revisão e proteção da main](protecao-main.md) descreve a configuração administrativa e o procedimento enquanto ela não estiver aplicada; CI verde sozinho não bloqueia merges indevidos.

Em Andamento inclui implementação e revisão. Mova o card para Fase de Teste quando a entrega estiver pronta para conferir os critérios. Marque Concluído após verificações, aceite e merge confirmado, registrando PR e commit no card. Push publica commits na branch; merge integra em `main`; a liberação em produção segue validação própria.

Após o merge e com a árvore limpa:

```bash
git switch main
git pull --ff-only origin main
```

Comece o próximo card em uma nova branch dessa base. Cada dev usa seu próprio clone; as alterações chegam à outra máquina pelo push e pela atualização do remoto.

## Quando os testes automáticos executam

CI, imagens Docker e segurança executam ao abrir ou atualizar um PR para main e depois do merge na main. O push de uma branch comum, sem PR, não inicia essas suítes. Abra um PR para obter a conferência automática antes do merge; mantenha os testes locais pertinentes enquanto trabalha. Execução manual é uma opção para conferir uma branch específica após a configuração estar na main. Não execute manualmente uma suíte que já esteja rodando no PR sem necessidade.

A conferência da main verifica a versão integrada. A redução elimina a duplicação push de branch/PR; não promete uma porcentagem fixa de economia nem libera uma franquia de Actions já esgotada. O limite da conta continua independente desta configuração.
