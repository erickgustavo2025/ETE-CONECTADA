'use client';
import { useEffect, useState } from 'react';
import type {
  SchoolClassResult,
  SchoolClassSummary,
} from '@/lib/student-administration-types';
import styles from './document-registry.module.css';
export default function SchoolClassList({
  onSelect,
}: {
  onSelect: (row: SchoolClassSummary) => void;
}) {
  const [mode, setMode] = useState<'INTEGRADO' | 'SUBSEQUENTE'>('INTEGRADO');
  const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<SchoolClassResult | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 20000);
    let active = true;
    setLoading(true);
    setError('');
    setResult(null);
    void (async () => {
      try {
        const response = await fetch('/api/secretaria/alunos/administracao', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          signal: c.signal,
          body: JSON.stringify({
            operation: 'classes',
            mode,
            page,
            afterStudentId: cursor,
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : 'Não foi possível consultar as turmas.',
          );
        if (
          !Array.isArray(data.classes) ||
          data.classes.length > 20 ||
          !data.classes.every(
            (r: SchoolClassSummary) =>
              r.mode === mode &&
              typeof r.className === 'string' &&
              typeof r.courseLabel === 'string' &&
              (r.periodLabel === null || typeof r.periodLabel === 'string') &&
              Number.isSafeInteger(r.students) &&
              r.students >= 0,
          ) ||
          data.page !== page ||
          typeof data.hasNext !== 'boolean' ||
          typeof data.updating !== 'boolean' ||
          (data.nextCursor !== null && typeof data.nextCursor !== 'string')
        )
          throw new Error(
            'A lista de turmas não chegou completa. Tente novamente.',
          );
        if (active && data.updating) {
          if (!data.nextCursor || data.nextCursor === cursor)
            throw new Error(
              'Não foi possível concluir a atualização das turmas. Tente novamente.',
            );
          setCursor(data.nextCursor);
        } else if (active) setResult(data);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error && e.name === 'Error'
              ? e.message
              : 'A consulta demorou ou foi interrompida. Tente novamente.',
          );
      } finally {
        clearTimeout(timer);
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      clearTimeout(timer);
      c.abort();
    };
  }, [mode, page, refresh, cursor]);
  return (
    <section aria-labelledby="school-classes-title">
      <h2 id="school-classes-title">Turmas</h2>
      <p>Escolha a modalidade e abra uma turma para consultar os alunos.</p>
      <div className={styles.actions} aria-label="Modalidade das turmas">
        {(['INTEGRADO', 'SUBSEQUENTE'] as const).map((m) => (
          <button
            type="button"
            key={m}
            className={
              'ete-button' + (mode === m ? '' : ' ete-button--secondary')
            }
            aria-pressed={mode === m}
            onClick={() => {
              setCursor(null);
              setMode(m);
              setPage(1);
            }}
          >
            {m === 'INTEGRADO' ? 'Integrado' : 'Subsequente'}
          </button>
        ))}
      </div>
      {loading && (
        <p role="status">Atualizando séries e módulos e consultando turmas…</p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="ete-button ete-button--secondary"
            onClick={() => {
              setCursor(null);
              setRefresh((n) => n + 1);
            }}
          >
            Tentar consultar turmas novamente
          </button>
        </div>
      )}
      {result && (
        <>
          {!result.classes.length ? (
            <p>Nenhuma turma encontrada nesta página.</p>
          ) : (
            <ul className={styles.rows}>
              {result.classes.map((row) => (
                <li
                  className={styles.row}
                  key={JSON.stringify([
                    row.className,
                    row.periodLabel,
                    row.courseLabel,
                  ])}
                >
                  <h3>{row.className}</h3>
                  <p>
                    {row.courseLabel} ·{' '}
                    {row.periodLabel ?? 'Período não informado'} ·{' '}
                    {row.students} aluno(s)
                  </p>
                  <button
                    type="button"
                    className="ete-button ete-button--secondary"
                    onClick={() => onSelect(row)}
                  >
                    Ver alunos da turma {row.className} ·{' '}
                    {row.periodLabel ?? 'sem período'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className="ete-button ete-button--secondary"
              disabled={page === 1}
              onClick={() => {
                setCursor(null);
                setPage((p) => p - 1);
              }}
            >
              Turmas anteriores
            </button>
            <span>Página {page}</span>
            <button
              type="button"
              className="ete-button ete-button--secondary"
              disabled={!result.hasNext}
              onClick={() => {
                setCursor(null);
                setPage((p) => p + 1);
              }}
            >
              Próximas turmas
            </button>
            <button
              type="button"
              className="ete-button ete-button--secondary"
              onClick={() => {
                setCursor(null);
                setRefresh((n) => n + 1);
              }}
            >
              Atualizar turmas
            </button>
          </div>
        </>
      )}
    </section>
  );
}
