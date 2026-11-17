'use client';
import { useState } from 'react';
import {
  IMPORT_ACTION_LABELS,
  IMPORT_FIELD_LABELS,
  type ImportContextView,
  type ImportPreviewView,
} from '@/lib/sheet-import-view';
import styles from './integrated-import.module.css';
export type BindingChoice = {
  index: number;
  registration: string;
  enrollmentId: string;
};
export default function ImportPreview({
  mode,
  preview,
  contexts,
  disabled,
  onBack,
  onConfirm,
  onBindMany,
}: {
  mode: 'INTEGRADO' | 'SUBSEQUENTE';
  preview: ImportPreviewView;
  contexts: ImportContextView[];
  disabled: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onBindMany: (choices: BindingChoice[]) => void;
}) {
  const [filter, setFilter] = useState('all'),
    [page, setPage] = useState(1);
  const [bindings, setBindings] = useState<Record<string, BindingChoice>>({});
  const entries = preview.entries.filter(
    (e) => filter === 'all' || e.action === filter,
  );
  const rows = entries.slice((page - 1) * 20, page * 20);
  const singles = preview.entries.filter(
    (e) =>
      e.needsBinding &&
      e.candidates.length === 1 &&
      e.candidates[0].status !== 'ENDED',
  );
  const choices = Object.values(bindings);
  const counts = preview.counts;
  function choose(
    entry: ImportPreviewView['entries'][number],
    enrollmentId: string,
  ) {
    setBindings((previous) => {
      const key = `${entry.sheet}:${entry.incoming.schoolRegistration}`,
        next = { ...previous };
      if (enrollmentId)
        next[key] = {
          index: entry.sheet - 1,
          registration: entry.incoming.schoolRegistration,
          enrollmentId,
        };
      else delete next[key];
      return next;
    });
  }
  return (
    <div>
      <h2>Confira a prévia</h2>
      <p className={styles.notice}>
        Nenhum cadastro foi alterado. Esta prévia vale até{' '}
        {new Intl.DateTimeFormat('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Recife',
        }).format(new Date(preview.expiresAt))}{' '}
        (horário de Recife).
      </p>
      {!!preview.placements?.length && (
        <section aria-label="Prévia da enturmação dos repetentes">
          <h3>Repetentes a incluir nas turmas</h3>
          <p>
            Estes alunos serão enturmados somente ao confirmar. A etapa, o
            ingresso e os bloqueios manuais serão preservados.
          </p>
          <ul>
            {preview.placements.map((p) => (
              <li key={p.enrollmentId}>
                <strong>{p.fullName}</strong> · Matrícula {p.schoolRegistration}
                <br />
                {p.fromClass} · {p.fromPeriod} → {p.toClass} · {p.toPeriod} ·{' '}
                {p.stage}º {mode === 'INTEGRADO' ? 'ano' : 'módulo'}
                <br />
                Ingresso original:{' '}
                {p.originalStartsOn
                  ? p.originalStartsOn.split('-').reverse().join('/')
                  : 'não informado no cadastro'}{' '}
                · Nova turma a partir de{' '}
                {p.startsOn.split('-').reverse().join('/')} · Conclusão
                prevista: {p.endsOn.split('-').reverse().join('/')}
                <br />
                {p.inFile
                  ? 'Também consta na planilha.'
                  : 'Selecionado fora da planilha.'}
              </li>
            ))}
          </ul>
        </section>
      )}
      <dl className={styles.counts}>
        {[
          ['Alunos novos', counts.createdStudents],
          ['Matrículas novas', counts.createdEnrollments],
          ['Alunos a atualizar', counts.updatedStudents],
          ['Matrículas a atualizar', counts.updatedEnrollments],
          ['Sem alteração', counts.unchanged],
          ['Fora da planilha, mantidos', counts.absent],
          ['Pendências', counts.conflicts],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {!!preview.sheets?.some((sheet) => sheet.reference) && (
        <section aria-label="Turmas e datas de referência">
          <h3>Turmas e datas de referência</h3>
          {preview.sheets
            .filter((sheet) => sheet.reference)
            .map((sheet) => (
              <div className={styles.context} key={sheet.sheetName}>
                <h4>{sheet.className}</h4>
                <dl className={styles.referenceFields}>
                  <div>
                    <dt>Período da planilha</dt>
                    <dd>{sheet.periodLabel}</dd>
                  </div>
                  <div>
                    <dt>Início do curso</dt>
                    <dd>
                      {sheet.reference!.startsOn.split('-').reverse().join('/')}
                    </dd>
                  </div>
                  <div>
                    <dt>Conclusão prevista</dt>
                    <dd>
                      {sheet.reference!.endsOn.split('-').reverse().join('/')}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          <p>
            Referências existentes são mantidas. Novas referências são estimadas
            pela planilha. A importação não libera acesso nem promove alunos.
          </p>
        </section>
      )}
      {!!preview.calendarComparisons?.length &&
        (!preview.sheets?.some((sheet) => sheet.reference) ||
          preview.calendarComparisons.some(
            (comparison) => comparison.differs,
          )) && (
          <div
            className={styles.tableWrap}
            tabIndex={0}
            role="region"
            aria-label="Conferência de módulo e período"
          >
            <table className={styles.table}>
              <caption>Módulo e período conferidos</caption>
              <thead>
                <tr>
                  <th>Aba</th>
                  <th>Planilha recebida</th>
                  <th>Referência cadastrada</th>
                  <th>Conferência</th>
                </tr>
              </thead>
              <tbody>
                {preview.calendarComparisons.map((c) => (
                  <tr key={c.sheetName}>
                    <td>{c.sheetName}</td>
                    <td>
                      Módulo {c.receivedModule} · {c.receivedPeriod}
                    </td>
                    <td>
                      {c.configured
                        ? `Módulo ${c.expectedModule} · ${c.expectedPeriod}`
                        : 'Sem referência cadastrada'}
                    </td>
                    <td>
                      {c.differs
                        ? 'Módulo ou período diferente: confira antes de importar'
                        : c.configured
                          ? 'De acordo com a referência'
                          : 'Sem mudança automática de módulo'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {counts.identityChanges > 0 && (
        <p className={styles.notice}>
          Há alterações de nome, nascimento ou filiação de{' '}
          {counts.identityChanges}{' '}
          {counts.identityChanges === 1
            ? 'aluno existente'
            : 'alunos existentes'}
          . Confirme essas alterações e confira as matrículas antes de emitir
          declarações.
        </p>
      )}
      {counts.conflicts > 0 && (
        <p role="status">
          Resolva as pendências antes de importar. Confira as matrículas
          encerradas e as informações já corrigidas pela secretaria.
        </p>
      )}
      {singles.length > 0 && (
        <div className={styles.notice}>
          <p>
            {singles.length} alunos já têm uma matrícula que pode corresponder a
            esta lista. Confira as opções antes de atualizar, para evitar
            matrículas duplicadas.
          </p>
          <button
            className="ete-button ete-button--secondary"
            type="button"
            disabled={disabled}
            onClick={() =>
              setBindings((previous) => {
                const next = { ...previous };
                for (const entry of singles)
                  next[`${entry.sheet}:${entry.incoming.schoolRegistration}`] =
                    {
                      index: entry.sheet - 1,
                      registration: entry.incoming.schoolRegistration,
                      enrollmentId: entry.candidates[0].id,
                    };
                return next;
              })
            }
          >
            {singles.length === 1
              ? 'Selecionar matrícula encontrada'
              : `Selecionar as ${singles.length} matrículas encontradas`}
          </button>
        </div>
      )}
      <label htmlFor="preview-filter">Mostrar na prévia</label>
      <select
        id="preview-filter"
        value={filter}
        disabled={disabled}
        onChange={(event) => {
          setFilter(event.target.value);
          setPage(1);
        }}
      >
        <option value="all">Todas as linhas</option>
        {Object.entries(IMPORT_ACTION_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <p className={styles.note} aria-live="polite">
        {entries.length
          ? `Linhas ${(page - 1) * 20 + 1} a ${Math.min(page * 20, entries.length)} de ${entries.length}`
          : 'Nenhuma linha neste filtro.'}
      </p>
      <div
        className={styles.tableWrap}
        tabIndex={0}
        role="region"
        aria-label="Diferenças da planilha"
      >
        <table className={styles.table}>
          <caption>
            Prévia de atualização —{' '}
            {mode === 'SUBSEQUENTE' ? 'subsequente' : 'integrado'}
          </caption>
          <thead>
            <tr>
              <th>Aba e linha</th>
              <th>Aluno</th>
              <th>Resultado e conferência</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={`${entry.sheet}:${entry.line}`}>
                <td>
                  {contexts[entry.sheet - 1].sheetName}
                  <br />
                  Linha {entry.line}
                </td>
                <td>
                  <strong>{entry.incoming.fullName}</strong>
                  <br />
                  Matrícula {entry.incoming.schoolRegistration}
                </td>
                <td>
                  <strong>{IMPORT_ACTION_LABELS[entry.action]}</strong>
                  {entry.conflictReason && <p>{entry.conflictReason}</p>}
                  <details>
                    <summary>Ver dados e diferenças</summary>
                    <dl className={styles.details}>
                      <dt>Nascimento</dt>
                      <dd>
                        {entry.incoming.birthDate
                          .split('-')
                          .reverse()
                          .join('/')}
                      </dd>
                      <dt>Nome do pai ou da mãe</dt>
                      <dd>
                        {[entry.incoming.parentOne, entry.incoming.parentTwo]
                          .filter(Boolean)
                          .join(' / ') ||
                          'Não informada; valores existentes serão preservados.'}
                      </dd>
                    </dl>
                    {entry.changes.map((change) => (
                      <p key={change.field}>
                        <strong>
                          {IMPORT_FIELD_LABELS[change.field] || 'Dado escolar'}:
                        </strong>{' '}
                        {change.before ?? 'Não informado'} →{' '}
                        {change.after ?? 'Não informado'}
                      </p>
                    ))}
                    {!entry.changes.length && (
                      <p>
                        {entry.action === 'create'
                          ? 'Os dados informados serão incluídos.'
                          : 'Confira também turma, série/módulo e período da aba.'}
                      </p>
                    )}
                  </details>
                  {entry.needsBinding && (
                    <div className={styles.binding}>
                      <label htmlFor={`binding-${entry.sheet}-${entry.line}`}>
                        Escolha a matrícula do aluno{' '}
                        {entry.incoming.schoolRegistration}
                      </label>
                      <select
                        id={`binding-${entry.sheet}-${entry.line}`}
                        disabled={disabled}
                        value={
                          bindings[
                            `${entry.sheet}:${entry.incoming.schoolRegistration}`
                          ]?.enrollmentId || ''
                        }
                        onChange={(e) => choose(entry, e.target.value)}
                      >
                        <option value="">Selecione após conferir</option>
                        {entry.candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.className} ·{' '}
                            {candidate.moduleNumber
                              ? `${candidate.moduleNumber}º módulo`
                              : candidate.grade
                                ? `${candidate.grade}ª série`
                                : 'etapa não informada'}{' '}
                            · {candidate.periodLabel || 'período não informado'}{' '}
                            ·{' '}
                            {candidate.status === 'ENDED'
                              ? 'Encerrado'
                              : 'Matrícula já cadastrada'}
                          </option>
                        ))}
                        <option value="new">
                          É outra matrícula: cadastrar separadamente
                        </option>
                      </select>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className={styles.actions} aria-label="Páginas da prévia">
        <button
          className="ete-button ete-button--secondary"
          type="button"
          disabled={disabled || page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Página anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(entries.length / 20))}
        </span>
        <button
          className="ete-button ete-button--secondary"
          type="button"
          disabled={disabled || page * 20 >= entries.length}
          onClick={() => setPage(page + 1)}
        >
          Próxima página
        </button>
      </nav>
      {choices.length > 0 && (
        <p>
          {choices.length} matrículas escolhidas. Confira as turmas e gere uma
          nova prévia para ver o resultado antes de importar.
        </p>
      )}
      <div className={styles.actions}>
        {choices.length ? (
          <button
            className="ete-button"
            disabled={disabled}
            type="button"
            onClick={() => onBindMany(choices)}
          >
            Conferir matrículas escolhidas
          </button>
        ) : (
          <button
            className="ete-button"
            disabled={disabled || counts.conflicts > 0}
            type="button"
            onClick={onConfirm}
          >
            Aplicar importação
          </button>
        )}
        <button
          className="ete-button ete-button--secondary"
          type="button"
          disabled={disabled}
          onClick={onBack}
        >
          Voltar às turmas
        </button>
      </div>
    </div>
  );
}
