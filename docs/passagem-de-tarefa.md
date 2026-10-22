# Passar uma tarefa para o outro dev

Quando TH ou Erick retomar o trabalho do colega, o ponto de partida precisa estar claro. O card acompanha o andamento; o PR reúne a mudança e sua revisão; os guias do repositório registram as decisões que continuam valendo depois da entrega.

Use o [guia de contribuição](contribuicao.md) para criar a branch, publicar e integrar o PR. O modelo abaixo complementa esse fluxo, sem substituir a revisão do colega.

## Modelo de passagem

Copie para a descrição do card ou para a mensagem de passagem e preencha somente o que for necessário:

```text
Card: EC-___ — link
Objetivo: resultado esperado e o que fica fora desta tarefa.
Responsável e revisão: quem implementa e quem confere.
Ponto de partida: branch, commit completo e PR, se houver.
Dependências: outras branches/PRs que precisam entrar antes; ordem de integração.
Arquivos: alterados, ainda previstos e compartilhados que foram combinados.
Decisões: o que foi escolhido, onde está registrado e o que ainda depende de resposta.
Verificações: comando, resultado, commit e ambiente; separar local de GitHub.
Pendências: o que não passou/não foi feito e a condição para resolver.
Próximo passo: ação concreta para quem vai continuar.
```

Não inclua senhas, tokens, arquivos de ambiente ou dados de alunos. Para demonstrar um problema, use registros fictícios. A passagem não exige copiar uma conversa inteira.

## Conferir antes de continuar

Na pasta em que pretende trabalhar, estes comandos só consultam o estado:

```bash
git status --short --branch
git rev-parse HEAD
git log -1 --oneline
```

Compare a branch e o commit com a passagem. Confirme também os arquivos modificados que ainda não entraram em commit. Se forem diferentes do esperado, esclareça a divergência antes de editar; não descarte alterações para fazer o estado coincidir.

Cada pessoa trabalha no seu próprio clone. No mesmo computador, não troque a branch de uma pasta que o colega esteja usando para editar ou demonstrar a aplicação.

Uma tarefa normalmente começa na main atualizada. Quando depender de outra entrega ainda não integrada, registre expressamente a branch e o commit dessa base e a ordem dos PRs. A nova branch já contém os commits anteriores: não copie os arquivos manualmente nem repita as mesmas alterações. Depois do merge anterior, confira novamente o diff do próximo PR em relação à main.

## Combinar arquivos compartilhados

Antes de alterar Prisma/migrações, lockfile, configurações da raiz, workflows ou componentes compartilhados, combine quem mexe em cada trecho e qual entrega entra primeiro. Se o escopo mudar, atualize o card e avise o colega antes de avançar no arquivo combinado.

Em um conflito, compare os dois requisitos e o código ao redor. Aceitar um lado inteiro pode apagar a correção do outro. Depois de resolver, confira o diff e execute as verificações afetadas antes de publicar. Preserve o histórico já enviado; não use uma reescrita de commits como solução automática para um conflito.

## Exercício da dupla

Façam uma vez em um repositório fictício separado, com um arquivo de texto sem dados reais:

1. Cada pessoa recebe uma tarefa e o ponto de partida pelo modelo acima.
2. As duas alteram a mesma linha em branches diferentes, com requisitos complementares.
3. A primeira entrega é revisada e integrada na main do exercício.
4. A segunda recebe a atualização, identifica o conflito e combina uma resolução que preserve os dois requisitos.
5. O colega retoma pelo contexto recebido e confere o conteúdo final. Registrem no card os commits e o resultado observado.

Um ensaio feito por uma pessoa verifica o procedimento, mas não confirma que a dupla conseguiu trocar a tarefa. Registre separadamente essa participação e a revisão, sem atribuir aceite a quem ainda não conferiu.

## Encerrar a passagem

Atualize o card com o commit publicado, PR e resultados atuais. Um teste local aprovado não é um check do GitHub aprovado. Se o serviço de testes estiver indisponível, registre o impedimento e mantenha a integração pendente conforme a [regra de revisão](protecao-main.md); não declare a main liberada nem altere diretamente a branch para contornar o bloqueio.

Use o [template do PR](../.github/PULL_REQUEST_TEMPLATE.md) para a revisão. Depois do merge confirmado, atualize o estado e informe a base para a próxima tarefa. Apagar uma branch já integrada é uma limpeza separada: confira primeiro se nenhum trabalho ou PR ainda depende dela.
