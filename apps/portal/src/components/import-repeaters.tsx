'use client';
import { useEffect, useRef, useState } from 'react';
import type {
  ImportContextView,
  RepeaterCandidate,
  RepeaterChoice,
} from '@/lib/sheet-import-view';
import styles from './integrated-import.module.css';
export default function ImportRepeaters({
  mode,
  fileBase64,
  contexts,
  choices,
  disabled,
  onChange,
}: {
  mode: 'INTEGRADO' | 'SUBSEQUENTE';
  fileBase64: string;
  contexts: ImportContextView[];
  choices: RepeaterChoice[];
  disabled: boolean;
  onChange: (v: RepeaterChoice[]) => void;
}) {
  const [sheet, setSheet] = useState(contexts[0]?.sheetName ?? '');
  const [data, setData] = useState<{
    candidates: RepeaterCandidate[];
    page: number;
    hasNext: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const target = contexts.find((c) => c.sheetName === sheet);
  async function load(page: number) {
    if (disabled || busy || !contexts.every((c) => c.confirmed)) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setData(null);
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/secretaria/importacao', {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'repeaters',
          format: 'school-header-v1',
          mode,
          fileBase64,
          contexts,
          sheetName: sheet,
          page,
        }),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(
          typeof value.error === 'string'
            ? value.error
            : 'Não foi possível consultar os repetentes.',
        );
      if (
        !Array.isArray(value.candidates) ||
        value.candidates.length > 20 ||
        value.page !== page ||
        typeof value.hasNext !== 'boolean'
      )
        throw new Error('A lista não chegou completa. Consulte novamente.');
      if (!controller.signal.aborted) setData(value);
    } catch (e) {
      if (active.current === controller)
        setError(
          controller.signal.aborted
            ? 'Consulta interrompida. Tente novamente.'
            : e instanceof Error
              ? e.message
              : 'Confira a conexão e consulte novamente.',
        );
    } finally {
      clearTimeout(timer);
      if (active.current === controller) setBusy(false);
    }
  }
  function choose(candidate: RepeaterCandidate, checked: boolean) {
    if (checked)
      onChange([
        ...choices.filter((c) => c.enrollmentId !== candidate.enrollmentId),
        { ...candidate, sheetName: sheet },
      ]);
    else
      onChange(
        choices.filter((c) => c.enrollmentId !== candidate.enrollmentId),
      );
  }
  return (
    <section aria-labelledby="repeaters-title" className={styles.context}>
      <h3 id="repeaters-title">Repetentes aguardando nova turma</h3>
      <p>
        Se houver repetentes, consulte os nomes da mesma modalidade, curso e
        etapa. Escolha a turma e marque somente quem deve entrar nela. O aluno
        pode ser incluído mesmo sem aparecer na planilha. Uma nova consulta
        limpa a seleção desta turma para você conferir os dados atualizados.
      </p>
      <label htmlFor="repeater-target">Turma de destino dos repetentes</label>
      <select
        id="repeater-target"
        value={sheet}
        disabled={disabled || busy}
        onChange={(e) => {
          active.current?.abort();
          setSheet(e.target.value);
          setData(null);
          setError('');
        }}
      >
        {contexts.map((c) => (
          <option key={c.sheetName} value={c.sheetName}>
            {c.className} · {c.periodLabel} · {c.stage}º{' '}
            {mode === 'INTEGRADO' ? 'ano' : 'módulo'}
          </option>
        ))}
      </select>
      <div className={styles.actions}>
        <button
          className="ete-button ete-button--secondary"
          type="button"
          disabled={disabled || busy || !contexts.every((c) => c.confirmed)}
          onClick={() => {
            onChange(choices.filter((choice) => choice.sheetName !== sheet));
            void load(1);
          }}
        >
          {busy
            ? 'Consultando repetentes…'
            : 'Consultar repetentes compatíveis'}
        </button>
      </div>
      {!contexts.every((c) => c.confirmed) && (
        <p>Confira e marque os dados de todas as abas para consultar.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {data && (
        <div aria-live="polite">
          <h4>
            Repetentes para {target?.className} · {target?.periodLabel}
          </h4>
          {!data.candidates.length && (
            <p>Nenhum repetente compatível encontrado.</p>
          )}
          {data.candidates.map((c) => {
            const selected = choices.find(
              (x) => x.enrollmentId === c.enrollmentId,
            );
            const elsewhere = selected && selected.sheetName !== sheet;
            return (
              <div key={c.enrollmentId} className={styles.context}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    disabled={
                      disabled ||
                      !!elsewhere ||
                      (!selected && choices.length >= 100)
                    }
                    checked={!!selected && !elsewhere}
                    onChange={(e) => choose(c, e.target.checked)}
                  />
                  {c.fullName} · Matrícula {c.schoolRegistration}
                </label>
                <p>
                  Turma anterior: {c.className} · {c.periodLabel}. A etapa será
                  mantida.
                </p>
                {elsewhere && (
                  <p>
                    Já selecionado para outra turma. Remova a seleção abaixo
                    antes de mudar o destino.
                  </p>
                )}
              </div>
            );
          })}
          <div className={styles.actions}>
            <button
              type="button"
              className="ete-button ete-button--secondary"
              disabled={disabled || busy || data.page <= 1}
              onClick={() => void load(data.page - 1)}
            >
              Repetentes anteriores
            </button>
            <span>Página {data.page}</span>
            <button
              type="button"
              className="ete-button ete-button--secondary"
              disabled={disabled || busy || !data.hasNext}
              onClick={() => void load(data.page + 1)}
            >
              Próximos repetentes
            </button>
          </div>
        </div>
      )}
      {!!choices.length && (
        <section aria-label="Repetentes selecionados">
          <h4>Selecionados para enturmação ({choices.length})</h4>
          <ul>
            {choices.map((c) => (
              <li key={c.enrollmentId}>
                {c.fullName} →{' '}
                {contexts.find((x) => x.sheetName === c.sheetName)?.className} ·{' '}
                {contexts.find((x) => x.sheetName === c.sheetName)?.periodLabel}{' '}
                <button
                  className="ete-button ete-button--quiet"
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      choices.filter((x) => x.enrollmentId !== c.enrollmentId),
                    )
                  }
                >
                  Remover seleção de {c.fullName}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p>
        A enturmação só acontece ao confirmar a importação. Ela preserva o
        ingresso, o histórico e os bloqueios manuais. Se a nova turma ainda não
        começou, a declaração aguarda a data de início.
      </p>
    </section>
  );
}
