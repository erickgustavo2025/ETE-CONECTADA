# Aplicar migrações numa release do portal

O banco guarda cadastros, matrículas, documentos e histórico. Aplique as migrações em uma etapa de manutenção separada da troca da imagem. Iniciar site ou portal não roda migrações, seed nem importação.

## Preparar a janela

1. Identifique o ambiente, a imagem atual e a imagem proposta pelo commit e pelo digest. Compare a lista de migrações da release com o estado conhecido do banco. Registre quem executa e quem revisa a operação.
2. Leia o SQL pendente. Classifique cada mudança como compatível com a aplicação anterior ou como uma etapa que exige parar escritas. Para mudanças destrutivas, prepare uma release intermediária que mantenha os dados antigos e novos acessíveis. Retire a estrutura antiga em outra janela, só depois de verificar que a versão em uso deixou de depender dela.
3. Confirme a existência de uma cópia recente e restaurável no destino aprovado. Confira a integridade e a origem da cópia conforme o [guia de restauração](backup-restauracao.md). Se a cópia estiver ausente ou a verificação falhar, mantenha o serviço na versão atual até resolver a pendência.
4. Separe a conexão de manutenção da conexão usada pelo portal. Preserve a credencial limitada da imagem anterior durante a janela de retorno. Se a release acrescentar tabelas ou alterar permissões, prepare um segundo papel de execução e mantenha as credenciais em segredo. Consulte o [guia do banco do portal](../../apps/portal/prisma/README.md).

## Executar e verificar

Execute a partir do código da release, com as dependências do lockfile. Disponibilize `DIRECT_URL` ao processo de manutenção por meio do gerenciador de segredos. No mesmo terminal, confira o estado, aplique as migrações e confira novamente.

```sh
npm exec --workspace @ete-conectada/portal -- prisma migrate status
npm run db:migrate --workspace @ete-conectada/portal
npm exec --workspace @ete-conectada/portal -- prisma migrate status
```

A primeira consulta pode indicar migrações pendentes. A relação deve coincidir com a release. O Prisma usa um bloqueio no banco para evitar duas execuções simultâneas. Se a execução encontrar uma migração em curso ou falhar ao adquirir o bloqueio, confira quem está operando antes de tentar de novo. Mantenha o bloqueio padrão habilitado. [Documentação do Prisma Migrate](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)

Depois de migrar, conceda ao papel novo somente os acessos que a aplicação precisa. O nome abaixo é um exemplo de papel já criado por um responsável de manutenção.

```sh
npm run db:provision-runtime --workspace @ete-conectada/portal -- ete_portal_nova_release
```

Use a credencial limitada correspondente em `DATABASE_URL` da imagem nova. A conexão de manutenção permanece restrita à sessão de operação. Confira a saúde dos serviços, o acesso às funções autorizadas e a leitura do histórico antes de liberar tráfego. Registre horários, versão, migrações aplicadas e resultado. Preserve os segredos e dados dos alunos fora das evidências.

## Se algo falhar

- **Falha antes da troca da imagem.** Suspenda a sequência, preserve o log e confira quais migrações foram aplicadas. A equipe decide se a versão anterior pode continuar conectada ao esquema resultante. Um ajuste no registro de migrações exige conferir primeiro o estado real do banco e o procedimento aprovado.
- **A imagem nova falhou e o esquema continua compatível.** Volte à imagem e à credencial limitada anteriores. Confirme login, leitura e operações necessárias. Trocar a imagem mantém o esquema aplicado.
- **O esquema ficou incompatível ou houve perda de dados.** Mantenha as escritas suspensas. Restaure a cópia em um banco separado, preserve a origem para investigação e use o procedimento institucional para reconciliar alterações posteriores ao backup. A promoção do destino exige revisão e validação.

Após a janela de retorno, a equipe avalia a revogação da credencial antiga. Preserve a trilha da operação e siga a política de backup da escola.

## Ensaio de compatibilidade em 18/11/2026

O portal anterior no commit `409181f` mantinha 26 migrações. O candidato `013cf94` levou o banco descartável para 28. As duas execuções paralelas do comando terminaram e as duas migrações novas entraram uma vez cada. A sessão fictícia foi preservada.

A versão anterior continuou capaz de ler e gravar uma sessão no esquema novo com o papel original. O candidato fez o mesmo com seu próprio papel. As duas versões recusaram o papel da outra e o retorno do código anterior com seu papel original funcionou. O ensaio de restauração do candidato preservou o catálogo, os dados sintéticos e as proteções de 25 tabelas. A execução em homologação depende da infraestrutura autorizada e de uma cópia aprovada.
