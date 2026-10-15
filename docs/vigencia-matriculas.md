# Situação e vigência da matrícula

Uma matrícula importada não comprova vínculo atual. Cada matrícula mantém sua própria situação, período letivo e datas de vigência, separados do cadastro da pessoa e de outras matrículas.

## Conferência

- **Não conferida (`UNCONFIRMED`)**: estado inicial, inclusive para matrículas anteriores à migração. Datas e período continuam ausentes até conferência.
- **Ativa (`ACTIVE`)**: a secretaria informou período e datas inicial e final. Registra-se quando e por qual conta a conferência foi feita.
- **Encerrada (`ENDED`)**: impede preparar declaração de vínculo atual. A mudança preserva período e datas anteriores e não apaga solicitações.

O serviço interno `reviewEnrollment` exige secretaria ativa, conferida novamente dentro da transação. A tela de conferência e sua API ficam para o painel/importador; o operador deve vir da sessão, nunca do corpo enviado pelo aluno. Não importar a coluna descartada `Situação` nem interpretar ausência em planilha como desistência.

Para ativar, informe `status`, `periodLabel`, `validFrom` e `validUntil`. Exemplo fictício:

```json
{
  "status": "ACTIVE",
  "periodLabel": "2026.2",
  "validFrom": "2026-07-01",
  "validUntil": "2026-12-31"
}
```

As datas vêm da escola; o exemplo não define calendário oficial. O intervalo é inclusivo e considera a data de emissão no fuso `America/Recife`. Para encerrar ou voltar à conferência, informe somente a situação; período e datas são preservados. Mudanças futuras de modalidade, turma, módulo ou período que afetem o documento devem renovar ou invalidar a conferência. Progressão automática e calendário de ofertas ficam na EC-108.

## Emissão e liberação

O aluno pode abrir um pedido para a secretaria conferir a matrícula. Preparar PDF individual ou em lote exige vínculo ativo, conferido e vigente; o período informado no editor deve corresponder ao cadastrado. Uma falha no lote não entrega PDF parcial nem avança solicitações.

Antes de devolver o arquivo, o servidor reconfere autorização e matrícula. Se a conferência mudou durante a geração, o arquivo é recusado. A liberação exige vigência atual e preparação posterior à última conferência. Após corrigir a matrícula, gere o PDF novamente antes de liberar. Cliques repetidos num pedido já liberado preservam o atendimento anterior.

O protótipo mantém os estados atuais de preparação e retirada. Assinatura GOV.BR, guarda do arquivo final e download privado seguem entregas próprias. A última conferência registrada não substitui trilha completa de auditoria.

## Migração e demonstração

A migração `20261013200000_enrollment_validity` acrescenta campos e restrições sem excluir matrículas nem inventar dados para registros antigos. Aplique-a antes de iniciar o portal atualizado. Reverter apenas o código preserva as colunas aditivas; não remova uma migração aplicada nem use reset para voltar. Uma reversão funcional também retiraria os bloqueios de vigência e precisa de revisão.

`npm run db:demo` confere as guardas e a identidade do banco descartável, aplica migrações e prepara contas sintéticas. Somente as três matrículas conhecidas do seed recebem a conferência inicial; reexecução preserva senhas e situações já revistas. Período `2026` e vigência ampla são exclusivos dessas fixtures, nunca para alunos reais. O seed comum não ativa matrículas automaticamente.

## Verificação

`test:unit` inclui limites de vigência no fuso escolar, datas inválidas, período incorreto e estados recusados. `test:enrollments` exige banco novo identificado e confere autorização, múltiplas matrículas, restrições SQL, revisão posterior à geração, liberação e reexecução da demonstração preservando senha/situação. Participa de `test:integration`; não executar no banco de demonstração em uso.

`test:declarations` verifica que as rotas individual e de lote recusam vínculos não conferidos, encerrados, futuros ou vencidos sem mudar o atendimento. Os dados fictícios são removidos ao final. Veja a [preparação dos testes](testes-isolados.md).
