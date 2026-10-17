# Segurança a cada funcionalidade

Antes de implementar, identifique os dados e as ações que a mudança expõe, quem pode acessá-los e quais entradas vêm do navegador ou de arquivos. Escreva os casos de uso indevido junto dos critérios do card. A revisão acompanha a implementação e precisa de evidências; CI verde ou audit zerado não garantem segurança completa.

## O que conferir

Escolha os casos pertinentes ao fluxo alterado. Uma troca de texto não exige repetir uma auditoria inteira; uma mudança de autenticação exige testes dos controles de acesso.

| Mudança                         | Tentativas que precisam ser recusadas                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessão ou permissões            | Acesso sem sessão, cookie adulterado/expirado/revogado, papel enviado no corpo da requisição e aluno tentando executar ação de secretaria. A permissão vem do servidor.                              |
| Dados de aluno ou documento     | Trocar o identificador para ler ou alterar registro de outro aluno; baixar PDF sem autorização; receber campos pessoais além dos necessários.                                                        |
| Cadastro ou recuperação         | Reutilizar token, usar token expirado ou invalidado por mudança de credenciais, descobrir contas pela resposta e contornar os limites de tentativas existentes.                                      |
| Formulário, arquivo ou API      | Enviar campos extras, tipos inválidos, conteúdo malicioso, arquivo excessivo ou formato errado; enviar uma ação por outra origem. Validar no servidor e manter limites de processamento.             |
| Importação ou alteração em lote | Confirmar prévia antiga, repetir a operação, confirmar simultaneamente, falhar após uma escrita e apagar dados de quem não veio no arquivo. Conferir rollback, idempotência e preservação de contas. |
| Dependência ou integração       | Examinar pacote/versão/lockfile, executar audit e testar os fluxos afetados. Não aceitar atualização ou script de instalação automaticamente.                                                        |

Use banco identificado e descartável, contas e arquivos fictícios, sem envio de e-mail real. Os comandos e as travas estão em [testes isolados](../testes-isolados.md). Exercite ataques apenas no ambiente próprio autorizado; não faça varreduras contra serviços governamentais, terceiros ou a base escolar.

Para uma correção de segurança, reproduza a falha no ambiente isolado e demonstre que o teste passa com a correção. Quando seguro e útil, retire temporariamente o controle somente na cópia de teste para comprovar que a asserção detecta a regressão; restaure-o antes de publicar. Não envie uma falha proposital para `main`.

## Antes de entregar

Revise o diff e registre no PR os comandos executados, os casos positivos e negativos, o commit verificado e qualquer limite relevante. Confirme a limpeza dos dados sintéticos. Mantenha pendências em cards próprios, com a condição para resolvê-las; não apresente um controle planejado como implementado. Reveja essas verificações se uma alteração posterior mudar a origem dos dados, a autorização ou o ambiente de implantação.

Use o [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/) e as [Cheat Sheets do OWASP](https://cheatsheetseries.owasp.org/) como referências de teste e implementação. O [guia de sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) orienta cookies e revogação. Catálogos como [Rapid7](https://www.rapid7.com/fundamentals/web-application-vulnerabilities/) e [A-to-Z Vulnerabilities](https://github.com/0xKayala/A-to-Z-Vulnerabilities) ajudam a estudar e levantar hipóteses; cada hipótese precisa ser confirmada no código e em fontes primárias antes de virar mudança.
