'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  auditCategories,
  type AuditCategory,
  type AuditPage,
} from '@/lib/audit-history-input';
import { useClientReady } from './use-client-ready';
import styles from './document-registry.module.css';

const categoryLabel: Record<AuditCategory, string> = {
  ACESSO: 'Acesso',
  MATRICULA: 'Matrícula',
  IMPORTACAO: 'Importação',
  CALENDARIO: 'Calendário',
  DECLARACAO: 'Declaração',
};
const actionLabel: Record<string, string> = {
  LOGIN_BLOCK: 'Acesso ao portal bloqueado',
  LOGIN_UNBLOCK: 'Acesso ao portal restabelecido',
  ISSUANCE_BLOCK: 'Novas declarações bloqueadas',
  ISSUANCE_UNBLOCK: 'Novas declarações liberadas',
  PROGRESSION: 'Passagem de etapa',
  CONTINUITY: 'Vigência mantida até a próxima etapa',
  REPEAT: 'Repetência registrada',
  RESUME: 'Acompanhamento retomado',
  OVERRIDE: 'Exceção de atendimento registrada',
  TRANSFER: 'Mudança de turma',
  END: 'Matrícula encerrada',
  REOPEN: 'Matrícula reaberta',
  ENABLE: 'Matrícula liberada',
  METADATA_CHANGE: 'Dados da matrícula atualizados',
  IDENTITY_REVIEW: 'Identidade conferida na importação',
  CALENDAR_PROGRESSION: 'Etapa atualizada pelo calendário',
  CALENDAR_BINDING: 'Matrícula vinculada ao calendário',
  CALENDAR_HOLD: 'Passagem pelo calendário suspensa',
  CALENDAR_CHANGE: 'Versão do calendário registrada',
  ISSUED: 'Declaração emitida',
  DRAFTED: 'Declaração preparada',
  CANCELLED: 'Declaração cancelada',
  SUPERSEDED: 'Declaração substituída',
};
const initial = { aluno: '', categoria: '', inicio: '', fim: '', pagina: '1' };
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Recife',
});
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf())
    ? dateTime.format(date)
    : 'Data indisponível';
}

export function AuditHistory() {
  const ready = useClientReady();
  const [filters, setFilters] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const [result, setResult] = useState<AuditPage | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/secretaria/historico', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify(submitted),
          signal: controller.signal,
        });
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok)
          setError(body.error ?? 'Não foi possível consultar o histórico.');
        else setResult(body);
      } catch {
        if (!controller.signal.aborted)
          setError('Sem conexão com o histórico. Tente novamente.');
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [submitted]);

  function search(next: typeof initial) {
    setPending(true);
    setError('');
    setResult(null);
    setSubmitted({ ...next });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    search({ ...filters, pagina: '1' });
  }
  const page = Number(submitted.pagina);

  return (
    <section className="document-page" aria-labelledby="audit-title">
      <h1 id="audit-title">Histórico de ações</h1>
      <p>Consulte quando uma ação aconteceu e quem foi responsável.</p>
      <form onSubmit={submit} aria-label="Filtrar histórico">
        <fieldset
          disabled={!ready || pending}
          className={styles.filters}
          style={{ border: 0, padding: 0, minWidth: 0 }}
        >
          <legend>Filtros</legend>
          <label className="declaration-field">
            Nome ou matrícula do aluno
            <input
              type="search"
              maxLength={100}
              value={filters.aluno}
              onChange={(event) =>
                setFilters({ ...filters, aluno: event.target.value })
              }
            />
          </label>
          <label className="declaration-field">
            Categoria
            <select
              value={filters.categoria}
              onChange={(event) =>
                setFilters({ ...filters, categoria: event.target.value })
              }
            >
              <option value="">Todas as categorias</option>
              {auditCategories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel[category]}
                </option>
              ))}
            </select>
          </label>
          <label className="declaration-field">
            Data inicial
            <input
              type="date"
              value={filters.inicio}
              max={filters.fim || undefined}
              onChange={(event) =>
                setFilters({ ...filters, inicio: event.target.value })
              }
            />
          </label>
          <label className="declaration-field">
            Data final
            <input
              type="date"
              value={filters.fim}
              min={filters.inicio || undefined}
              onChange={(event) =>
                setFilters({ ...filters, fim: event.target.value })
              }
            />
          </label>
          <div className={styles.actions}>
            <button type="submit" className="ete-button">
              Buscar
            </button>
            <button
              type="button"
              className="ete-button ete-button--secondary"
              onClick={() => {
                setFilters(initial);
                search(initial);
              }}
            >
              Limpar filtros
            </button>
          </div>
        </fieldset>
      </form>
      <div role="status">
        {pending && <p>Consultando histórico…</p>}
        {result && (
          <p>
            {result.events.length
              ? `Página ${page}`
              : 'Nenhuma ação encontrada. Ajuste os filtros e busque novamente.'}
          </p>
        )}
      </div>
      {error && (
        <div className="document-notice" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="ete-button ete-button--secondary"
            onClick={() => search(submitted)}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {result && (
        <>
          <ol className={styles.rows} aria-label="Ações registradas">
            {result.events.map((event) => (
              <li
                className={styles.row}
                key={`${event.category}:${event.id}:${event.action}`}
              >
                <time dateTime={event.at}>{formatTime(event.at)}</time>
                <h2>{actionLabel[event.action] ?? 'Ação registrada'}</h2>
                <p>
                  {[
                    event.student,
                    event.registration
                      ? `Matrícula ${event.registration}`
                      : null,
                    event.subject,
                  ]
                    .filter(Boolean)
                    .join(' · ') || categoryLabel[event.category]}
                </p>
                <p>
                  {event.automatic
                    ? 'Execução automática.'
                    : event.actor
                      ? `Responsável: ${event.actor}`
                      : 'Responsável indisponível.'}
                  {event.automatic && event.confirmedAt && (
                    <>
                      {' '}
                      Confirmação anterior{' '}
                      {event.confirmedBy
                        ? `por ${event.confirmedBy} `
                        : ''}em {formatTime(event.confirmedAt)}.
                    </>
                  )}
                </p>
                {event.reason && <p>{event.reason}</p>}
                <details>
                  <summary>Referência do registro</summary>
                  <p>Registro {event.id}</p>
                  {event.operation !== event.id && (
                    <p>Operação {event.operation}</p>
                  )}
                  {event.correctsEventId && (
                    <p>Corrige o registro {event.correctsEventId}.</p>
                  )}
                </details>
              </li>
            ))}
          </ol>
          {(page > 1 || result.hasNext) && (
            <nav aria-label="Páginas do histórico" className={styles.actions}>
              <button
                type="button"
                className="ete-button ete-button--secondary"
                disabled={page <= 1}
                onClick={() =>
                  search({ ...submitted, pagina: String(page - 1) })
                }
              >
                Página anterior
              </button>
              <button
                type="button"
                className="ete-button ete-button--secondary"
                disabled={!result.hasNext || page >= 999}
                onClick={() =>
                  search({ ...submitted, pagina: String(page + 1) })
                }
              >
                Próxima página
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
