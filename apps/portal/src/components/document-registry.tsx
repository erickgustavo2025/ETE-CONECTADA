'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useFormValidation } from './use-form-validation';
import {
  documentStateLabels,
  type DocumentDetailResult,
  type DocumentSearchResult,
  type DocumentStudent,
} from '@/lib/document-search-types';
import styles from './document-registry.module.css';
const date = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Recife',
  }).format(new Date(value));
type Filters = {
  query: string;
  className: string;
  mode: string;
  status: string;
  from: string;
  to: string;
};
const initial: Filters = {
  query: '',
  className: '',
  mode: '',
  status: '',
  from: '',
  to: '',
};
async function search(body: object, signal?: AbortSignal) {
  const response = await fetch('/api/secretaria/documentos/busca', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || 'Não foi possível consultar os documentos.',
    );
  return result;
}
export default function DocumentRegistry() {
  const validation = useFormValidation('registry-search-error'),
    actionValidation = useFormValidation('registry-action-error');
  const [filters, setFilters] = useState(initial),
    [applied, setApplied] = useState<Filters | null>(null);
  const [student, setStudent] = useState<DocumentStudent | null>(null),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [results, setResults] = useState<DocumentSearchResult | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [documentId, setDocumentId] = useState(''),
    [detail, setDetail] = useState<DocumentDetailResult | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState('');
  const [pending, setPending] = useState<'CANCELLED' | 'SUPERSEDED' | null>(
      null,
    ),
    [reason, setReason] = useState(''),
    [successor, setSuccessor] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [saving, setSaving] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [message, setMessage] = useState('');
  const [candidate, setCandidate] = useState<
    DocumentDetailResult['document'] | null
  >(null);
  const [candidateError, setCandidateError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null),
    safe = useRef<HTMLButtonElement>(null),
    trigger = useRef<HTMLElement | null>(null),
    lock = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!applied) return;
    const controller = new AbortController();
    setResults(null);
    setLoading(true);
    setError('');
    search({ ...applied, studentId: student?.id, page }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResults(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : 'Não foi possível consultar os documentos.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applied, student, page, revision]);
  useEffect(() => {
    if (!documentId) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    search({ documentId }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setDetail(data);
          heading.current?.focus();
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setDetailError(
            err instanceof Error
              ? err.message
              : 'Não foi possível abrir a minuta.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [documentId, revision]);
  useEffect(() => {
    if (pending !== 'SUPERSEDED' || !successor) return;
    const controller = new AbortController();
    setCandidate(null);
    setCandidateError('');
    search({ documentId: successor }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setCandidate(data.document);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCandidateError(
            'Não foi possível conferir a substituta. Escolha novamente ou volte à conferência.',
          );
      });
    return () => controller.abort();
  }, [pending, successor]);
  useEffect(() => {
    if (pending && !dialog.current?.open) {
      dialog.current?.showModal();
      safe.current?.focus();
    } else if (!pending && dialog.current?.open) {
      dialog.current.close();
      if (trigger.current?.isConnected) trigger.current.focus();
      else heading.current?.focus();
    }
  }, [pending]);
  useEffect(() => {
    if (uncertain && dialog.current?.open) safe.current?.focus();
  }, [uncertain]);
  useEffect(() => {
    if (!saving) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [saving]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validation.ready || !validation.validate(event.currentTarget)) return;
    if (filters.from && filters.to && filters.from > filters.to) {
      validation.reject(
        'to',
        'A data final precisa ser igual ou posterior à inicial.',
        event.currentTarget,
      );
      return;
    }
    setStudent(null);
    setDocumentId('');
    setDetail(null);
    setPage(1);
    setMessage('');
    setApplied({
      ...filters,
      query: filters.query.trim(),
      className: filters.className.trim(),
    });
    setRevision((r) => r + 1);
  }
  function openAction(action: 'CANCELLED' | 'SUPERSEDED') {
    trigger.current = document.activeElement as HTMLElement;
    setPending(action);
    setReason('');
    setSuccessor('');
    setCandidate(null);
    setCandidateError('');
    setConfirmed(false);
    setUncertain(false);
    actionValidation.reset();
  }
  function closeAction() {
    if (lock.current) return;
    setPending(null);
    if (uncertain) {
      setRevision((r) => r + 1);
      setMessage(
        'Confira a situação atual da minuta antes de tentar outra ação.',
      );
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (
      !pending ||
      !detail ||
      lock.current ||
      !actionValidation.ready ||
      !actionValidation.validate(form)
    )
      return;
    lock.current = true;
    setSaving(true);
    actionValidation.reset();
    try {
      const response = await fetch('/api/secretaria/documentos/alteracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: detail.document.id,
          action: pending,
          reason,
          successorId: pending === 'SUPERSEDED' ? successor : null,
          confirmed,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        actionValidation.reject(
          data.field || 'reason',
          data.error || 'Não foi possível registrar a ação.',
          form,
        );
        if (response.status === 409) setUncertain(true);
        return;
      }
      setMessage(
        pending === 'CANCELLED'
          ? 'Minuta cancelada. O pedido do aluno foi preservado.'
          : 'Minuta substituída. O histórico original foi preservado.',
      );
      setPending(null);
      setRevision((r) => r + 1);
    } catch {
      setUncertain(true);
      actionValidation.reject(
        'reason',
        'A resposta não chegou. A ação pode ter sido registrada. Consulte a situação ou repita o mesmo envio.',
        form,
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  const currentPage = results?.page ?? page,
    totalPages = Math.max(1, Math.ceil((results?.total ?? 0) / 20));
  return (
    <section className="document-page">
      <Link href="/secretaria/declaracoes">
        Voltar ao atendimento de declarações
      </Link>
      <h1>Histórico de documentos</h1>
      <p className="document-intro">
        Encontre o aluno para conferir as minutas preparadas e acompanhar
        cancelamentos e substituições.
      </p>
      <aside className="document-notice">
        <strong>Área de testes: minutas sem validade oficial</strong>
        <p>
          Este registro ainda não inclui assinatura digital nem documentos
          oficiais. Cancelar uma minuta não cancela o pedido do aluno.
        </p>
      </aside>
      <form
        onSubmit={submit}
        noValidate
        aria-label="Buscar documentos por aluno"
      >
        <div className={styles.filters}>
          <label className={'declaration-field ' + styles.wide}>
            Nome ou matrícula do aluno
            <input
              name="query"
              type="search"
              required
              minLength={2}
              maxLength={180}
              value={filters.query}
              onChange={(e) =>
                setFilters({ ...filters, query: e.target.value })
              }
              {...validation.field('query')}
            />
          </label>
          <label className="declaration-field">
            Modalidade
            <select
              name="mode"
              value={filters.mode}
              onChange={(e) => setFilters({ ...filters, mode: e.target.value })}
            >
              <option value="">Integrado e Subsequente</option>
              <option value="INTEGRADO">Integrado</option>
              <option value="SUBSEQUENTE">Subsequente</option>
            </select>
          </label>
          <label className="declaration-field">
            Situação
            <select
              name="status"
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">Todas as situações</option>
              {Object.entries(documentStateLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={'declaration-field ' + styles.wide}>
            Nome exato da turma (opcional)
            <input
              name="className"
              maxLength={120}
              placeholder="Ex.: 1A DS"
              value={filters.className}
              onChange={(e) =>
                setFilters({ ...filters, className: e.target.value })
              }
            />
          </label>
          <label className="declaration-field">
            Preparada a partir de
            <input
              name="from"
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              {...validation.field('from')}
            />
          </label>
          <label className="declaration-field">
            Preparada até
            <input
              name="to"
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              {...validation.field('to')}
            />
          </label>
        </div>
        <p role="alert" id="registry-search-error">
          {validation.error}
        </p>
        <div className={styles.actions}>
          <button
            type="submit"
            className="ete-button ete-button--primary"
            disabled={!validation.ready || loading}
          >
            {!validation.ready
              ? 'Carregando…'
              : loading
                ? 'Buscando…'
                : 'Buscar aluno'}
          </button>
          <button
            type="button"
            className="ete-button ete-button--secondary"
            disabled={!validation.ready || loading}
            onClick={() => {
              setFilters(initial);
              setApplied(null);
              setStudent(null);
              setDocumentId('');
              setDetail(null);
              setResults(null);
              setMessage('');
              validation.reset();
            }}
          >
            Limpar busca
          </button>
        </div>
      </form>
      <p role="status" className="declaration-feedback">
        {message}
      </p>
      {loading ? (
        <p role="status">Consultando os documentos…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="ete-button ete-button--secondary"
            onClick={() => setRevision((r) => r + 1)}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
      {!applied && (
        <p className="document-empty">
          Digite o nome ou a matrícula. A lista de todos os alunos não é exibida
          aqui.
        </p>
      )}
      {results && !loading && !error && (
        <>
          {student ? (
            <div className={styles.actions}>
              <h2>{student.name}</h2>
              <button
                className="ete-button ete-button--secondary"
                onClick={() => {
                  setStudent(null);
                  setDocumentId('');
                  setDetail(null);
                  setPage(1);
                }}
              >
                Voltar aos alunos
              </button>
            </div>
          ) : (
            <h2>Alunos encontrados: {results.total}</h2>
          )}
          {!results.total && (
            <p className="document-empty">
              Nenhum documento encontrado com esses filtros. Confira a busca ou
              procure outra turma e data.
            </p>
          )}
          <ul className={styles.rows}>
            {results.students.map((s) => (
              <li className={styles.row} key={s.id}>
                <strong>{s.name}</strong>
                <p>
                  Matrícula: {s.registration || 'Não informada'} · {s.count}{' '}
                  minuta(s)
                </p>
                <button
                  className="ete-button ete-button--secondary"
                  onClick={() => {
                    setStudent(s);
                    setPage(1);
                    setDocumentId('');
                    setDetail(null);
                  }}
                >
                  Ver documentos de {s.name}
                </button>
              </li>
            ))}
            {results.documents.map((d) => (
              <li className={styles.row} key={d.id}>
                <strong>{documentStateLabels[d.state]}</strong>
                <p>
                  {d.mode === 'INTEGRADO' ? 'Integrado' : 'Subsequente'} ·{' '}
                  {d.className} · {d.period}
                  <br />
                  Preparada em {date(d.createdAt)} · Página {d.page}
                </p>
                <button
                  className="ete-button ete-button--secondary"
                  onClick={() => {
                    trigger.current = document.activeElement as HTMLElement;
                    setDocumentId(d.id);
                  }}
                >
                  Conferir minuta {d.id.slice(-8)}
                </button>
              </li>
            ))}
          </ul>
          {results.total > 20 && (
            <nav
              className="results-pagination"
              aria-label="Páginas do histórico"
            >
              <button
                className="ete-button ete-button--secondary"
                disabled={currentPage <= 1}
                onClick={() => {
                  setPage(currentPage - 1);
                  setDocumentId('');
                }}
              >
                Anterior
              </button>
              <span>
                Página {currentPage} de {totalPages}
              </span>
              <button
                className="ete-button ete-button--secondary"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setPage(currentPage + 1);
                  setDocumentId('');
                }}
              >
                Próxima
              </button>
            </nav>
          )}
        </>
      )}
      {documentId && (
        <section aria-label="Conferência da minuta" aria-busy={detailLoading}>
          <h2 ref={heading} tabIndex={-1}>
            Conferência da minuta
          </h2>
          {detailLoading ? (
            <p role="status">Carregando a minuta…</p>
          ) : detailError ? (
            <div role="alert">
              <p>{detailError}</p>
              <button
                className="ete-button ete-button--secondary"
                onClick={() => setRevision((r) => r + 1)}
              >
                Tentar abrir novamente
              </button>
            </div>
          ) : (
            detail?.document.id === documentId && (
              <>
                <p>
                  <strong>{documentStateLabels[detail.document.state]}</strong>{' '}
                  · {date(detail.document.createdAt)}
                </p>
                <p className={styles.identity}>
                  Minuta: {detail.document.id.slice(-8)}
                </p>
                <div className={styles.body}>
                  {detail.document.body ||
                    'Texto não disponível neste registro de teste.'}
                </div>
                <h3>Histórico desta minuta</h3>
                <ol className={styles.history}>
                  {detail.document.history.map((event, i) => (
                    <li key={i}>
                      <strong>
                        {documentStateLabels[
                          event.action as keyof typeof documentStateLabels
                        ] ?? event.action}
                      </strong>
                      <p>
                        {date(event.date)} · {event.actor}
                      </p>
                      {event.reason && <p>Motivo: {event.reason}</p>}
                      {event.relatedId && (
                        <button
                          className="ete-button ete-button--secondary"
                          onClick={() => setDocumentId(event.relatedId!)}
                        >
                          Ver minuta substituta
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
                {detail.document.state === 'DRAFT' && (
                  <div className={styles.actions}>
                    <button
                      className="ete-button ete-button--danger-outline"
                      disabled={!validation.ready}
                      onClick={() => openAction('CANCELLED')}
                    >
                      Cancelar minuta
                    </button>
                    <button
                      className="ete-button ete-button--secondary"
                      disabled={!validation.ready}
                      onClick={() => openAction('SUPERSEDED')}
                    >
                      Substituir minuta
                    </button>
                  </div>
                )}
              </>
            )
          )}
        </section>
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="registry-action-title"
        onCancel={(event) => {
          event.preventDefault();
          closeAction();
        }}
      >
        <h2 id="registry-action-title">
          {pending === 'SUPERSEDED' ? 'Substituir minuta' : 'Cancelar minuta'}
        </h2>
        <p>
          Confira a minuta {detail?.document.id.slice(-8)}. Esta ação fica no
          histórico e não pode ser desfeita por esta tela.
        </p>
        <p>O pedido do aluno continua no atendimento.</p>
        <form noValidate onSubmit={save}>
          {pending === 'SUPERSEDED' && (
            <label className="declaration-field">
              Minuta corrigida
              <select
                name="successorId"
                required
                disabled={saving || uncertain}
                value={successor}
                onChange={(e) => setSuccessor(e.target.value)}
                {...actionValidation.field('successorId')}
              >
                <option value="">Selecione após conferir</option>
                {detail?.successors.map((d) => (
                  <option value={d.id} key={d.id}>
                    {date(d.createdAt)} · {d.period} · {d.id.slice(-8)}
                  </option>
                ))}
              </select>
              <span>
                Somente minutas disponíveis do mesmo aluno, matrícula e período.
                Prepare uma nova minuta se a corrigida ainda não aparecer.
              </span>
            </label>
          )}
          {pending === 'SUPERSEDED' && successor && (
            <section aria-label="Texto da minuta substituta">
              <h3>Confira a minuta corrigida</h3>
              {candidate?.id === successor ? (
                <>
                  <p>{documentStateLabels[candidate.state]}</p>
                  <div className={styles.body}>{candidate.body}</div>
                </>
              ) : (
                <p role="status">
                  {candidateError || 'Carregando o texto da substituta…'}
                </p>
              )}
            </section>
          )}
          <div className="declaration-field">
            <label htmlFor="registry-reason">Motivo</label>
            <textarea
              id="registry-reason"
              className="resize-none"
              name="reason"
              required
              minLength={3}
              maxLength={500}
              disabled={saving || uncertain}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              {...actionValidation.field('reason')}
            />
          </div>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              name="confirmed"
              required
              checked={confirmed}
              disabled={saving || uncertain}
              onChange={(e) => setConfirmed(e.target.checked)}
              {...actionValidation.field('confirmed')}
            />
            Conferi o aluno, a minuta e o motivo desta ação.
          </label>
          <p role="alert" id="registry-action-error">
            {actionValidation.error}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              ref={safe}
              className="ete-button ete-button--secondary"
              disabled={saving}
              onClick={closeAction}
            >
              {uncertain
                ? 'Fechar e consultar situação'
                : 'Voltar à conferência'}
            </button>
            <button
              type="submit"
              className="ete-button ete-button--danger"
              disabled={
                !actionValidation.ready ||
                saving ||
                !confirmed ||
                (pending === 'SUPERSEDED' &&
                  (!successor ||
                    candidate?.id !== successor ||
                    candidate.state !== 'DRAFT'))
              }
            >
              {saving
                ? 'Registrando…'
                : uncertain
                  ? 'Repetir o mesmo envio'
                  : pending === 'SUPERSEDED'
                    ? 'Confirmar substituição'
                    : 'Confirmar cancelamento'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
