# Pacote verificado das imagens

O workflow de imagens pode guardar um pacote de ensaio com as mesmas imagens que construiu, iniciou e auditou. Não faz outro build para empacotar. O pacote serve para preparar promoção e rollback por uma versão identificada, enquanto o registry e a infraestrutura definitiva ainda não foram aprovados.

O envio é solicitado por execução manual do workflow de imagens, depois do teste das imagens e do Compose. PRs e pushes na main mantêm todos os testes sem guardar automaticamente outro pacote de cerca de 193 MB a cada mudança. Branches comuns não disparam workflows no push.

Antes de solicitar o pacote de uma branch, execute manualmente CI e análise de segurança nessa mesma branch e confira que ambos aprovaram o mesmo commit. Não envie outro commit entre essas execuções e a solicitação das imagens. Na main, os checks automáticos do push também servem. A execução manual fica disponível depois que a configuração estiver integrada na branch padrão.

Antes de guardar os arquivos, o workflow exige CI e análise de segurança aprovados no mesmo commit, branch e repositório, originados de push ou execução manual. Confere a execução mais recente elegível e todos os jobs obrigatórios: PR, agendamento, sucesso antigo, execução cancelada ou job ignorado não substituem a verificação atual.

## Conteúdo e identidade

O artefato `imagens-COMMIT-RUN-TENTATIVA` contém apenas:

- `site.tar.gz` e `portal.tar.gz`: imagens salvas pelo Docker, comprimidas depois dos testes;
- `site-audit.json` e `portal-audit.json`: relatórios de vulnerabilidades vinculados aos IDs das imagens efetivamente testadas;
- `release.json`: commit, repositório, checks confirmados, nomes dos arquivos, tamanhos, hashes SHA256 e IDs das imagens;
- `SHA256SUMS`: hashes dos cinco arquivos acima.

As imagens recebem o commit e a identificação do app em seus rótulos. O verificador exige correspondência entre arquivo, configuração da imagem, app, commit, auditoria e todas as camadas. Ele confere cada camada pelo hash de seus bytes descomprimidos, sem extrair arquivos no computador.

Após o upload, o próprio runner baixa somente o artefato recém-criado pelo seu ID, reprova divergência no digest e verifica novamente seus arquivos. O manifesto e a lista de hashes baixados também precisam ser idênticos aos originais. Essa conferência não exige baixar as imagens na conexão do desenvolvedor.

O **ID da imagem**, o **hash do arquivo comprimido**, o **digest do artefato GitHub** e um futuro **digest de manifesto no registry** são identificadores diferentes. Este pacote guarda os dois primeiros; o GitHub fornece o digest de seu próprio artefato. Ele não inventa um digest de registry antes de publicar uma imagem.

## Obter e verificar

Na execução aprovada de [Imagens Docker](../.github/workflows/images.yml), abra a seção de artefatos e baixe o pacote correspondente ao commit e à tentativa conferidos. O acesso segue as permissões do repositório. O pacote de ensaio expira em três dias; isso não é política de retenção de release ou backup.

Após descompactar o arquivo externo baixado do GitHub em uma pasta própria, confira o pacote com o commit esperado:

```bash
python3 scripts/release-artifact.py verify /caminho/do/pacote COMMIT_DE_40_CARACTERES
```

Esse comando não inicia containers nem faz deploy. Usa somente os seis arquivos conhecidos e não extrai as camadas. Um hash prova integridade em relação à referência conferida; não é assinatura nem comprovação independente de autoria. Obtenha o pacote por uma execução confiável, confirme o commit revisado e a origem. Não aceite um manifesto recebido por outro canal somente porque seus próprios hashes combinam.

Uma nova tentativa pode produzir outro ID de imagem. Escolha o pacote exato e promova seus mesmos bytes; não reconstrua a imagem silenciosamente para outro ambiente. A publicação no GHCR é feita por um workflow separado, que reaproveita este pacote ([Publicação no GHCR](publicacao-ghcr.md)). Armazenamento definitivo, aprovação de deploy e rollback continuam em suas etapas próprias.

## Limites e segurança

O pacote só é criado depois de os testes de contexto/camadas, runtime, navegador e auditoria das imagens passarem. Arquivos de ambiente, bancos, planilhas, backups, dados de alunos e credenciais reais não participam do build. Os relatórios permitem rever o alcance do scanner; nenhuma suíte ou auditoria assegura ausência total de falhas.

O job tem leitura de código e de execuções para conferir os checks, sem permissão de publicar packages nem credencial de registry ou servidor. O token de leitura é fornecido somente à etapa de consulta. O upload usa a ação oficial fixada por commit, uma lista explícita de seis arquivos e não sobrescreve artefatos existentes.

Referências: [artefatos de workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts) e [ação oficial de upload](https://github.com/actions/upload-artifact).
