# Falhas no envio de e-mail

Cadastro e recuperação usam o mesmo transporte. O sistema informa que o provedor aceitou a mensagem. A confirmação de recebimento precisa ser feita na caixa de entrada. O servidor evita repetir automaticamente um envio cujo resultado é incerto.

## Configuração e demonstração

Configure `EMAIL_FROM` com um remetente autorizado e `PORTAL_PUBLIC_URL` com a origem do portal, sem caminho. Fora de desenvolvimento, a origem deve usar HTTPS.

- Para SMTP, selecione `EMAIL_TRANSPORT=smtp` e informe `SMTP_HOST`, `SMTP_USER` e `SMTP_PASSWORD` fornecidos pelo provedor. A porta padrão é 587 com STARTTLS obrigatório. A porta 465 usa TLS desde o início. Se o provedor usar outra porta, defina `SMTP_PORT` e, quando necessário, `SMTP_TLS_MODE=starttls` ou `SMTP_TLS_MODE=implicit`. A conexão exige certificado válido e TLS 1.2 ou superior.
- Para manter o envio pela API Resend, use a configuração existente com `RESEND_API_KEY` e `EMAIL_FROM`. O seletor `EMAIL_TRANSPORT=resend` é opcional nesse caso. O endereço HTTPS do provedor é fixo e o prazo de resposta é de cinco segundos. Redirecionamentos são recusados.

Guarde senhas e chaves no gerenciador de segredos do ambiente. A conexão SMTP tem limites de espera para DNS, abertura, saudação e inatividade. Falhas não devolvem dados do provedor, destinatário ou token. Uma configuração selecionada incompleta bloqueia o envio antes de criar a pendência, sem troca automática de provedor.

Somente em desenvolvimento e sem qualquer configuração de e-mail, o cadastro oferece o link local de demonstração. A ausência de origem permite link relativo nessa situação.

Os bloqueios de cadastro, login e recuperação em produção continuam ativos. Configurar e-mail é uma etapa da preparação para uso real.

## Reenvio e recuperação

Se o envio da confirmação falhar após a criação da pendência, a conta permanece pendente e sem sessão. A pessoa pode solicitar outro envio com o mesmo CPF, e-mail e senha e os dados escolares conferidos. A nova tentativa substitui o token anterior; não permite escolher outro destinatário enquanto a pendência estiver válida. Os limites de tentativas, expiração de 30 minutos e uso único continuam vigentes.

A solicitação de recuperação mantém a mesma resposta pública para e-mails existentes e inexistentes. O envio ocorre em segundo plano, sem link na resposta. A falha do aviso posterior à troca de senha não desfaz a senha já alterada nem restaura sessões antigas. Os registros de falha usam textos fixos e não incluem nomes, e-mails, tokens, credenciais ou detalhes devolvidos pelo provedor.

## Verificação

- `npm run test:unit`: matriz por ambiente, configuração parcial, resposta aceita, rejeições, redirect, erro de rede e aborto real pelo prazo do transporte. Sem rede externa.
- `npm run test:smtp --workspace @ete-conectada/portal`: envio entre processos em loopback, SMTP com TLS implícito e STARTTLS, rejeição de certificado não confiável e recusa de conexão sem TLS. Usa OpenSSL para criar um certificado fictício e apaga os arquivos ao encerrar.
- `npm run test:mail-failures`: handler real com banco sintético identificado e transporte externo simulado. Confere configuração, falhas, conta pendente, destinatário, senha preservada, rotação e uso único dos tokens.
- `npm run test:registration`, `npm run test:password-reset`, `npm run test:production` e jornadas de navegador: fluxos existentes, bloqueios de produção e respostas sem dados privados.

O teste de envio real depende da configuração e autorização do remetente na EC065. Esses testes não enviam mensagens reais nem comprovam recebimento, reputação do domínio ou validade institucional.
