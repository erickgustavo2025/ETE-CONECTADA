# Origem das requisições e dos links

As 14 rotas POST verificam a origem no servidor. Isso inclui login, logout,
primeiro acesso, confirmação de e-mail, recuperação de senha, pedidos de declaração
e operações da secretaria. Nas rotas privadas, sessão e papel continuam sendo
exigidos; origem correta não concede permissão.

Configure `PORTAL_PUBLIC_URL` com a origem do portal, por exemplo
`https://portal.example.invalid`, sem caminho, credenciais, consulta ou fragmento.
É uma configuração do servidor, não um dado recebido do navegador. Quando
configurada, a comparação usa essa origem e ignora Host e cabeçalhos forwarded.
O proxy pode encaminhar para um endereço interno diferente sem mudar a origem
pública confiável. Fora de desenvolvimento, a origem precisa usar HTTPS.

Pedidos sem Origin, com Origin nulo, caminho indevido, origem externa ou
`Sec-Fetch-Site: cross-site` são recusados. Não há fallback para aceitar uma
requisição mutável somente por ausência do cabeçalho. Um cliente HTTP de teste
precisa enviar o Origin esperado, como o navegador envia nos POSTs.

Em desenvolvimento sem `PORTAL_PUBLIC_URL`, admite-se apenas a própria origem
loopback, IP de rede privada ou nome local explicitamente configurado em
`NEXT_PUBLIC_LAN_HOST` (nome simples, `.local` ou `.lan`). Host auxilia o Next dev quando ele usa 0.0.0.0
internamente; um domínio público não é aceito nesse fallback. Não se publica o
servidor de desenvolvimento como produção. Outros domínios de laboratório
exigem a origem HTTPS explícita em `PORTAL_PUBLIC_URL`.

O link de confirmação usa a origem configurada. Sem configuração, a demonstração
local pode devolver somente um caminho relativo à página aberta. Envio real de
e-mail exige a origem confiável configurada; Host/forwarded nunca escolhem o
destino de um token. A recuperação de senha mantém o mesmo contrato. Configuração
inválida falha de modo fechado e não é incluída na mensagem pública de erro.

## Verificação

- `test:unit` inclui configuração, proxy, Host adulterado, LAN, produção e recusa
  antecipada dos handlers públicos antes de corpo/banco/cookies.
- `test:origin`, dentro de `test:integration`, exercita as 14 rotas reais com
  origem ausente/nula/externa. Confere que contas, sessões, pedidos, prévias e
  contadores permanecem intactos. Proxy e logout legítimos são controles positivos.
- Cadastro, recuperação, sessão, produção e navegador continuam nas suítes
  existentes. O portal próprio de teste recebe sua origem em porta livre.

Essas verificações usam dados fictícios e banco descartável. A configuração real
do domínio/proxy precisa ser conferida antes da implantação; os bloqueios de
autenticação e emissão em produção permanecem.

Referências: [OWASP: prevenção de CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[OWASP: links de recuperação](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
e [Next.js: hospedagem própria](https://nextjs.org/docs/app/guides/self-hosting).
