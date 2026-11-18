# Backup e restauração

A EC-084 prepara a prova de restauração com dados fictícios. **Não há rotina de backup de produção aprovada ou instalada por esta entrega.** Persistência de volume e sucesso do comando de cópia não comprovam recuperação.

## Decisões para a escola e a equipe

| Decisão                    | O que precisa ser aprovado                                                     |
| -------------------------- | ------------------------------------------------------------------------------ |
| Perda tolerável (RPO)      | Quanto tempo de alterações pode ser perdido; orienta frequência e estratégia   |
| Tempo de recuperação (RTO) | Prazo para voltar ao serviço, incluindo conferência e liberação                |
| Responsáveis               | Quem recebe falha, restaura, substitui o titular e autoriza retorno            |
| Retenção                   | Prazos e exclusão das cópias, conforme política de dados                       |
| Proteção                   | Criptografia, chaves separadas, permissões e recuperação dessas chaves         |
| Cópia externa              | Destino fora do servidor, acesso restrito e prova de restauração a partir dele |
| Escopo                     | Banco, configurações, segredos e documentos cuja guarda tenha sido aprovada    |

Esses valores continuam pendentes das EC-049/050. Não usar tempos medidos em uma fixture pequena como RPO/RTO contratado. Não guardar dump, planilha ou cópia de segredo em Git, Trello, logs de CI ou artefato público.

## Prova automatizada existente

Com dependências instaladas, banco **descartável, migrado e identificado** conforme [testes isolados](../testes-isolados.md) e clientes PostgreSQL 16 disponíveis:

```bash
TEST_PG_BIN=/usr/lib/postgresql/16/bin npm run test:backup
```

O caminho é o usado pelo runner Ubuntu 24.04. Em outro ambiente, informar o diretório confiável dos executáveis; o teste confere a versão. Não aponta para `.env`, demonstração ou banco da escola.

O teste exige ausência de dados de negócio na origem, cria fixtures de integrado/subsequente, filiação, contas, calendário, matrícula, solicitação, histórico e autorizações fictícias. Faz um dump custom completo e o restaura em outro banco com nome aleatório e marcador distinto. O destino é criado pela própria execução: não pode ser informado pelo usuário.

Antes de restaurar, confere hash, identidade e destino vazio. Usa transação única e interrupção por erro, sem `--clean` ou recriação de banco pelo arquivo. Compara conteúdo de todas as tabelas públicas e catálogo de colunas, constraints, índices e enums; prova que uma FK restaurada continua recusando referência inexistente. Apenas uma representação equivalente de cast de arrays literais entre `character varying` e `text` é normalizada; valores, tipos e operadores diferentes continuam distintos. As três regras afetadas também são exercitadas nos dois bancos, com cursos, motivos de histórico e todas as UFs permitidas, além de valores proibidos. Arquivo adulterado, marcador errado e destino ocupado devem ser recusados sem alteração. A origem do ensaio deve permanecer intacta durante a restauração. As fixtures ficam nos bancos descartáveis da execução, removidos após a conferência.

Diretório temporário 0700 e arquivos 0600 são removidos no encerramento, assim como somente o destino criado e identificado pelo teste. O CI também confere a limpeza dos registros e remove seu container descartável. Não instala ferramentas nem inicia o Docker Desktop no computador pessoal.

## Restauração real futura

1. Autorizar incidente/janela, bloquear alterações e notificações e preservar evidências. Separar credenciais de backup, migração e aplicação.
2. Escolher cópia confiável pelo inventário protegido, conferir integridade, versão PostgreSQL e disponibilidade das chaves. **Restaurar dump pode executar código da origem**; nunca aceitar arquivo de upload ou fonte desconhecida como backup confiável.
3. Restaurar primeiro em destino isolado, sem tráfego e sem envio de e-mail. Conferir schema/migrações, contagens, relações, datas e amostras autorizadas. Roles, grants e configurações do host exigem conferência própria: o dump de um banco não é backup de todo o servidor.
4. Tratar sessões e tokens restaurados antes de liberar tráfego, para não reativar acessos antigos. Conferir segredos e documentos separados; não expor o banco restaurado para facilitar inspeção.
5. Só promover após autorização e testes pertinentes. Registrar início/fim, cópia e versão utilizadas, responsáveis e resultado, sem dados pessoais ou credenciais. Em falha, manter o destino isolado e preservar a origem; não insistir sobre o banco em uso.

O ensaio atual comprova a mecânica no laboratório. Criptografia, cópia externa, agendamento, retenção, restauração de documentos e o procedimento institucional ainda precisam ser implementados e testados no ambiente aprovado.

Referências: [pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html) e [SQL dump](https://www.postgresql.org/docs/16/backup-dump.html).
