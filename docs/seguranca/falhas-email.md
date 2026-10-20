# Falhas no envio de e-mail

Cadastro e recuperação usam o mesmo transporte Resend. O endereço do provedor é fixo em HTTPS, redirecionamentos são recusados e o envio tem prazo de cinco segundos. Não há repetição automática: após um timeout, a mensagem pode já ter sido aceita. Uma resposta aceita pelo provedor não comprova entrega na caixa de entrada.

## Configuração e demonstração

O envio exige `RESEND_API_KEY`, `EMAIL_FROM` e uma origem válida em `PORTAL_PUBLIC_URL`. Fora de desenvolvimento, essa origem precisa usar HTTPS. Configuração incompleta ou inválida bloqueia o início da confirmação antes de criar uma conta pendente.

Somente em `NODE_ENV=development`, sem chave **e** sem remetente, o cadastro oferece o link local de demonstração. A ausência de origem permite link relativo nessa situação. Quando o provedor está configurado, rejeição, erro de rede ou timeout devolvem erro genérico, sem link alternativo, token, destinatário ou resposta do provedor.

Os bloqueios de cadastro, login e recuperação em produção continuam ativos. Configurar e-mail não libera o portal para uso real.

## Reenvio e recuperação

Se o envio da confirmação falhar após a criação da pendência, a conta permanece pendente e sem sessão. A pessoa pode solicitar outro envio com o mesmo CPF, e-mail e senha e os dados escolares conferidos. A nova tentativa substitui o token anterior; não permite escolher outro destinatário enquanto a pendência estiver válida. Os limites de tentativas, expiração de 30 minutos e uso único continuam vigentes.

A solicitação de recuperação mantém a mesma resposta pública para e-mails existentes e inexistentes. O envio ocorre em segundo plano, sem link na resposta. A falha do aviso posterior à troca de senha não desfaz a senha já alterada nem restaura sessões antigas. Os registros de falha usam textos fixos e não incluem nomes, e-mails, tokens, credenciais ou detalhes devolvidos pelo provedor.

## Verificação

- `npm run test:unit`: matriz por ambiente, configuração parcial, resposta aceita, rejeições, redirect, erro de rede e aborto real pelo prazo do transporte. Sem rede externa.
- `npm run test:mail-failures`: handler real com banco sintético identificado e transporte externo simulado. Confere configuração, falhas, conta pendente, destinatário, senha preservada, rotação e uso único dos tokens.
- `npm run test:registration`, `npm run test:password-reset`, `npm run test:production` e jornadas de navegador: fluxos existentes, bloqueios de produção e respostas sem dados privados.

O teste de envio real depende da configuração e autorização do remetente na EC065. Esses testes não enviam mensagens reais nem comprovam recebimento, reputação do domínio ou validade institucional.
