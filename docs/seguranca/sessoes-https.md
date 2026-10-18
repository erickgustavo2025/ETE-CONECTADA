# Sessões do portal em HTTPS

`PORTAL_PUBLIC_URL` define a origem confiável do servidor. Ao configurar HTTPS,
o portal cria e lê somente `__Host-ete_portal_session`. O cookie usa `Secure`,
`HttpOnly`, `SameSite=Lax`, caminho `/` e não informa `Domain`. Assim, nos navegadores
compatíveis com esse prefixo, outro subdomínio não pode criar um cookie de domínio
pai com o mesmo nome para sobrepor a sessão do portal. Host e forwarded recebidos
do cliente não escolhem essa política.

Em desenvolvimento HTTP local, mantém-se `ete_portal_session`, com os mesmos
atributos, exceto Secure. Isso permite a demonstração atual em localhost/LAN.
Configuração inválida ou ambiente diferente de desenvolvimento nunca relaxa
Secure. O nome antigo não serve como fallback de autenticação em HTTPS.

A duração atual é de **sete dias desde o login**, tanto no cookie quanto no banco.
Não é um prazo por inatividade. Fechar o navegador ou reiniciar o servidor não
encerra uma sessão válida. O prazo não é renovado apenas por navegar. Logout,
troca de senha, bloqueio ou revogação da conta seguem as verificações do servidor;
o token puro não é armazenado no banco. A remoção do cookie no logout repete os
atributos de criação e usa expiração passada/Max-Age zero. Se o banco estiver
indisponível durante logout, o navegador perde o cookie, mas não há confirmação
de revogação do token no banco até a indisponibilidade ser tratada.

## Como foi verificado

- `test:unit`: política em desenvolvimento HTTP, HTTPS, produção e configuração
  inválida; ausência de Domain e duração única; origem de laboratório recusa
  destinos públicos, credenciais/caminho e uso sem portal próprio.
- `test:browser`: jornada HTTPS usa certificado efêmero e proxy somente no
  loopback. Faz login pela tela, confere os atributos no Chromium, isolamento de
  subdomínio, recusa de cookie com Domain pai, token adulterado, nome legado,
  logout e replay do token revogado. Remove certificado e registros ao terminar.
- `test:session`: expiração, bloqueio, papel, isolamento e revogação continuam
  exercitados por HTTP com contas fictícias. `test:production` confere remoção do
  cookie seguro e os bloqueios atuais, sem consultar um banco real.

O certificado do laboratório não é instalado no sistema. Apenas o contexto
isolado do teste aceita esse certificado temporário. O servidor de teste continua
sendo iniciado pelo próprio helper; TEST_BASE_URL permanece recusada.

Antes da implantação, conferir a origem HTTPS definitiva, TLS/proxy e cookies no
endereço real. Acesso de produção continua bloqueado. Não compartilhar a base ou
as contas de demonstração com produção; a habilitação e invalidação de sessões
anteriores pertencem à etapa de liberação. Cookies seguros complementam a
verificação de origem e a autorização no servidor.

Referências: [atributos e prefixos de cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
e [API cookies do Next.js](https://nextjs.org/docs/app/api-reference/functions/cookies).
