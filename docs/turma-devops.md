# Turma DevOps

A turma reúne dez alunos fictícios do Integrado de Desenvolvimento de Sistemas, com vínculo ativo para ensaiar o portal. Cada pessoa pode escolher uma matrícula e criar sua própria conta no primeiro acesso. Use uma linha diferente por pessoa quando o banco for compartilhado.

## Preparar o ambiente local

1. Siga o [guia de ambiente local](ambiente-local.md). A preparação carrega a turma automaticamente. Se já tiver um banco local identificado, o comando `npm run db:demo:devops` continua disponível com a [configuração manual de teste](testes-isolados.md#preparar-o-banco).
2. Abra [Primeiro acesso](http://127.0.0.1:3001/cadastro), informe matrícula, nascimento e a filiação da linha escolhida. Em seguida use o CPF fictício da mesma linha, um e-mail único como `devops-01@example.invalid` e uma senha escolhida por você. Clique em **Confirmar conta de teste** e depois em **Confirmar e-mail**. Volte ao login e entre com o e-mail e a senha que acabou de definir.

O comando de carga roda pelo código-fonte. As imagens GHCR trazem as aplicações compiladas e recebem o banco por configuração externa. Use o servidor de desenvolvimento para o primeiro acesso local com confirmação na tela. Ao usar a imagem do portal em um laboratório de produção, configure HTTPS e o provedor de e-mail conforme o [guia do banco](../apps/portal/prisma/README.md#acesso-à-secretaria).

## Dados para primeiro acesso

| Aluno             | Matrícula | Nascimento | Nome completo do pai ou da mãe | CPF fictício |
| ----------------- | --------- | ---------- | ------------------------------ | ------------ |
| Lia Martins Prado | 9900301   | 15/01/2008 | Clara Martins Prado            | 99999030106  |
| Davi Coelho Reis  | 9900302   | 21/02/2008 | Renato Coelho Reis             | 99999030297  |
| Nina Freitas Lobo | 9900303   | 09/03/2008 | Marta Freitas Lobo             | 99999030378  |
| Theo Pires Neves  | 9900304   | 17/04/2008 | Paulo Pires Neves              | 99999030459  |
| Eva Nunes Paiva   | 9900305   | 28/05/2008 | Lúcia Nunes Paiva              | 99999030530  |
| Ivo Barros Mota   | 9900306   | 06/06/2008 | César Barros Mota              | 99999030610  |
| Luna Leal Torres  | 9900307   | 24/07/2008 | Beatriz Leal Torres            | 99999030700  |
| Ravi Vale Castro  | 9900308   | 13/08/2008 | Daniel Vale Castro             | 99999030882  |
| Mila Duarte Lima  | 9900309   | 30/09/2008 | Ana Duarte Lima                | 99999030963  |
| Noé Rocha Melo    | 9900310   | 11/10/2008 | Bruno Rocha Melo               | 99999031005  |
