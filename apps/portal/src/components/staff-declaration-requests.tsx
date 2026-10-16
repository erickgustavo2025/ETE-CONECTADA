'use client';
import { useEffect, useRef, useState } from 'react';
import type { StudentView } from '@/lib/declarations';
import {
  requestDate,
  requestStatusLabels,
  type RequestSummary,
} from '@/lib/declaration-request-types';
type StaffRequest = RequestSummary & { student: StudentView };
type Results = {
  requests: StaffRequest[];
  total: number;
  page: number;
  pageSize: number;
};
type Props = {
  revision: number;
  disabled: boolean;
  onPrepare: (student: StudentView) => void;
};
export default function StaffDeclarationRequests({
  revision,
  disabled,
  onPrepare,
}: Props) {
  const [filter, setFilter] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState<StaffRequest | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const mutationLock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/secretaria/solicitacoes?status=${filter}&page=${page}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || 'Não foi possível consultar os pedidos.',
          );
        if (!controller.signal.aborted) {
          setResult(data);
          if (page !== data.page) setPage(data.page);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Não foi possível consultar os pedidos.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, page, revision, retry]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!pending && dialog.open) {
      dialog.close();
      returnFocus.current?.focus();
    }
  }, [pending]);
  async function release() {
    if (!pending || !confirmed || mutationLock.current) return;
    mutationLock.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/secretaria/solicitacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pending.id, confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Não foi possível liberar a retirada.');
      setMessage(
        `Declaração de ${pending.student.fullName || 'estudante'} marcada como pronta para retirada.`,
      );
      setPending(null);
      setConfirmed(false);
      setRetry((value) => value + 1);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Não foi possível liberar a retirada. Tente novamente.',
      );
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="staff-requests" aria-labelledby="staff-requests-title">
      <div className="request-section-heading">
        <div>
          <h2 id="staff-requests-title">Solicitações dos alunos</h2>
          <p>
            Prepare o PDF, imprima e confirme a retirada somente com o documento
            pronto.
          </p>
        </div>
        <button
          className="ete-button ete-button--secondary ete-button--compact"
          type="button"
          disabled={loading || saving || disabled}
          onClick={() => setRetry((value) => value + 1)}
        >
          Atualizar lista
        </button>
      </div>
      <div className="request-toolbar">
        <div className="declaration-field">
          <label htmlFor="request-status-filter">Situação do pedido</label>
          <select
            id="request-status-filter"
            value={filter}
            disabled={saving || disabled}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="OPEN">Em atendimento</option>
            <option value="REQUESTED">Solicitadas</option>
            <option value="IN_PREPARATION">Em preparação</option>
            <option value="READY_FOR_PICKUP">Prontas para retirada</option>
          </select>
        </div>
        <p role="status">
          {loading
            ? 'Consultando solicitações…'
            : error && !pending
              ? error
              : `${result?.total ?? 0} ${result?.total === 1 ? 'pedido' : 'pedidos'}`}
        </p>
      </div>
      {error && !pending && (
        <button
          className="ete-button ete-button--secondary ete-button--compact"
          type="button"
          onClick={() => setRetry((value) => value + 1)}
        >
          Tentar novamente
        </button>
      )}
      {!loading && !error && !result?.requests.length && (
        <div className="request-empty">
          <strong>Nenhum pedido nesta situação</strong>
          <p>Os novos pedidos dos alunos aparecerão aqui.</p>
        </div>
      )}
      {!error && (
        <ul className="request-list" aria-busy={loading}>
          {result?.requests.map((row) => (
            <li className="request-row" key={row.id}>
              <div className="request-row-copy">
                <span
                  className={`request-status request-status--${row.status.toLowerCase()}`}
                >
                  {requestStatusLabels[row.status]}
                </span>
                <h3>{row.student.fullName || 'Nome pendente'}</h3>
                <p>
                  Matrícula {row.student.schoolRegistration || 'pendente'} ·{' '}
                  {row.className}
                </p>
                <p>
                  Solicitada em {requestDate(row.createdAt)}
                  {row.readyAt
                    ? ` · retirada liberada em ${requestDate(row.readyAt)}`
                    : ''}
                </p>
              </div>
              {row.status !== 'READY_FOR_PICKUP' && (
                <div className="request-row-actions">
                  <button
                    className="ete-button ete-button--secondary ete-button--compact"
                    type="button"
                    disabled={disabled || saving || loading}
                    onClick={() =>
                      onPrepare({
                        ...row.student,
                        enrollments: row.student.enrollments.filter(
                          (enrollment) => enrollment.id === row.enrollmentId,
                        ),
                      })
                    }
                  >
                    Preparar declaração
                  </button>
                  {row.status === 'IN_PREPARATION' && (
                    <button
                      className="ete-button ete-button--compact"
                      type="button"
                      disabled={disabled || saving || loading}
                      onClick={(event) => {
                        returnFocus.current = event.currentTarget;
                        setConfirmed(false);
                        setMessage('');
                        setError('');
                        setPending(row);
                      }}
                    >
                      Liberar retirada
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {result && result.total > result.pageSize && (
        <nav
          className="results-pagination"
          aria-label="Páginas das solicitações"
        >
          <button
            className="ete-button ete-button--secondary ete-button--compact"
            type="button"
            disabled={page === 1 || loading || saving || disabled}
            onClick={() => setPage((value) => value - 1)}
          >
            Anterior
          </button>
          <span>
            {result.page} / {Math.ceil(result.total / result.pageSize)}
          </span>
          <button
            className="ete-button ete-button--secondary ete-button--compact"
            type="button"
            disabled={
              page * result.pageSize >= result.total ||
              loading ||
              saving ||
              disabled
            }
            onClick={() => setPage((value) => value + 1)}
          >
            Próxima
          </button>
        </nav>
      )}
      <p role="status" aria-live="polite" className="declaration-feedback">
        {message}
      </p>
      <dialog
        ref={dialogRef}
        className="registration-dialog"
        aria-labelledby="pickup-dialog-title"
        onCancel={(event) => {
          if (saving) event.preventDefault();
          else setPending(null);
        }}
      >
        <div className="dialog-inner">
          <span className="eyebrow">ATENDIMENTO ESCOLAR</span>
          <h2 id="pickup-dialog-title">Liberar para retirada?</h2>
          <p>
            A declaração de{' '}
            <strong>{pending?.student.fullName || 'estudante'}</strong> passará
            a aparecer como pronta para retirada no portal do aluno.
          </p>
          <label className="declaration-reviewed">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={saving}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Confirmo que o documento foi impresso, assinado e carimbado pelos
            responsáveis e está disponível na secretaria.
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="discard-actions">
            <button
              ref={cancelRef}
              className="ete-button ete-button--secondary"
              type="button"
              disabled={saving}
              onClick={() => setPending(null)}
            >
              Ainda não está pronto
            </button>
            <button
              className="ete-button"
              type="button"
              disabled={saving || !confirmed}
              aria-busy={saving}
              onClick={release}
            >
              {saving ? 'Confirmando…' : 'Confirmar retirada disponível'}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
