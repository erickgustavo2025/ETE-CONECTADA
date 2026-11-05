'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { newRequestKey } from '@/lib/request-key';
import { useFormValidation } from './use-form-validation';
import type {
  AdminStudent,
  StudentAdminResult,
} from '@/lib/student-administration-types';
import type {
  StudentAccessKind,
  StudentSearch,
} from '@/lib/student-administration-input';
import styles from './document-registry.module.css';

const initial: StudentSearch = {
  operation: 'search',
  query: '',
  mode: '',
  className: '',
  status: '',
  page: 1,
};
const time = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Recife',
  }).format(new Date(value));
const schoolStatus: Record<string, string> = {
  ACTIVE: 'Matrícula ativa',
  ENDED: 'Matrícula encerrada',
  UNCONFIRMED: 'Matrícula a conferir',
};
const accountStatus: Record<string, string> = {
  active: 'Conta ativa',
  pending: 'Cadastro em confirmação',
  unclaimed: 'Cadastro ainda não ativado',
};
const kindLabel = (kind: StudentAccessKind) =>
  kind === 'LOGIN' ? 'acesso ao portal' : 'novas declarações';
function isStudent(value: unknown): value is AdminStudent {
  if (!value || typeof value !== 'object') return false;
  const s = value as AdminStudent;
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.loginBlocked === 'boolean' &&
    typeof s.issuanceBlocked === 'boolean' &&
    Number.isSafeInteger(s.revision) &&
    Array.isArray(s.enrollments)
  );
}
class AdminHttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function send(
  body: object,
  signal?: AbortSignal,
): Promise<StudentAdminResult> {
  const response = await fetch('/api/secretaria/alunos/administracao', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new AdminHttpError(
      typeof result.error === 'string'
        ? result.error
        : 'Não foi possível consultar os alunos.',
      response.status,
    );
  if (
    !Array.isArray(result.students) ||
    !result.students.every(isStudent) ||
    (result.student !== null && !isStudent(result.student)) ||
    !Array.isArray(result.classes) ||
    !Array.isArray(result.history) ||
    !Number.isSafeInteger(result.total) ||
    !Number.isSafeInteger(result.page)
  )
    throw new Error(
      'A resposta não pôde ser conferida. Atualize os dados e tente novamente.',
    );
  return result;
}
type Pending = {
  kind: StudentAccessKind;
  blocked: boolean;
  studentId: string;
  revision: number;
};
export default function StudentAdministration() {
  const searchValidation = useFormValidation('students-search-error'),
    actionValidation = useFormValidation('students-action-error');
  const [filters, setFilters] = useState(initial),
    [applied, setApplied] = useState<StudentSearch | null>(null),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [results, setResults] = useState<StudentAdminResult | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<StudentAdminResult | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState(''),
    [historyPage, setHistoryPage] = useState(1);
  const [pending, setPending] = useState<Pending | null>(null),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null),
    safe = useRef<HTMLButtonElement>(null),
    trigger = useRef<HTMLElement | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    lock = useRef(false),
    intent = useRef<object | null>(null),
    saveController = useRef<AbortController | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saveController.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!applied) return;
    const controller = new AbortController();
    setResults(null);
    setLoading(true);
    setError('');
    send({ ...applied, page }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResults(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : 'Não foi possível consultar os alunos.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applied, page, refresh]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    setDetailError('');
    send(
      { operation: 'detail', studentId: selected, page: historyPage },
      controller.signal,
    )
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
              : 'Não foi possível consultar este aluno.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selected, historyPage, refresh]);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (pending && !d.open) {
      d.showModal();
      safe.current?.focus();
    } else if (!pending && d.open) {
      d.close();
      trigger.current?.focus();
    }
  }, [pending]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !searchValidation.ready ||
      !searchValidation.validate(event.currentTarget)
    )
      return;
    setSelected('');
    setDetail(null);
    setPage(1);
    setMessage('');
    setApplied({ ...filters });
    setRefresh((n) => n + 1);
  }
  function openAction(kind: StudentAccessKind) {
    const s = detail?.student;
    if (!s) return;
    trigger.current = document.activeElement as HTMLElement;
    intent.current = null;
    actionValidation.reset();
    setReason('');
    setConfirmed(false);
    setUncertain(false);
    setConflict(false);
    setPending({
      kind,
      studentId: s.id,
      revision: s.revision,
      blocked: !(kind === 'LOGIN' ? s.loginBlocked : s.issuanceBlocked),
    });
  }
  function close() {
    if (lock.current) return;
    setPending(null);
    intent.current = null;
    if (uncertain || conflict) {
      setRefresh((n) => n + 1);
      setMessage(
        'Confira a situação atual do aluno antes de fazer outra alteração.',
      );
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !pending ||
      lock.current ||
      !actionValidation.ready ||
      !actionValidation.validate(event.currentTarget)
    )
      return;
    const form = event.currentTarget;
    lock.current = true;
    setBusy(true);
    actionValidation.reset();
    try {
      intent.current ??= {
        operation: 'change',
        ...pending,
        requestKey: newRequestKey(),
        reason,
        confirmed,
      };
      const controller = new AbortController();
      saveController.current = controller;
      const data = await send(intent.current, controller.signal);
      if (!mounted.current) return;
      setDetail(data);
      setHistoryPage(1);
      setPending(null);
      intent.current = null;
      setUncertain(false);
      setRefresh((n) => n + 1);
      setMessage(
        data.created === false
          ? 'Esta alteração já havia sido registrada. A situação atual foi consultada.'
          : `${pending.blocked ? 'Bloqueio de' : 'Desbloqueio de'} ${kindLabel(pending.kind)} registrado. As declarações anteriores foram preservadas.`,
      );
    } catch (err) {
      if (mounted.current) {
        const correctable =
          err instanceof AdminHttpError && [400, 413].includes(err.status);
        const stale =
          err instanceof AdminHttpError && [401, 403, 409].includes(err.status);
        setUncertain(!correctable && !stale);
        setConflict(stale);
        if (correctable) intent.current = null;
        actionValidation.reject(
          'reason',
          (err instanceof Error ? err.message : 'A resposta não chegou.') +
            (correctable
              ? ' Confira o motivo e envie novamente.'
              : stale
                ? ' Feche e consulte a situação atual.'
                : ' Consulte a situação atual ou repita o mesmo envio.'),
          form,
        );
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const student = detail?.student;
  return (
    <section className="document-page">
      <Link href="/secretaria/declaracoes">Voltar às declarações</Link>
      <h1>Alunos e acesso</h1>
      <p className="document-intro">
        Encontre o aluno para consultar suas turmas e controlar o acesso ao
        portal ou a emissão de novas declarações.
      </p>
      <aside className="document-notice">
        <strong>Área de testes</strong>
        <p>
          Bloquear o acesso encerra as sessões do aluno. Bloquear novas
          declarações mantém o acesso e os downloads anteriores. Nenhuma dessas
          ações cancela um documento já emitido.
        </p>
      </aside>
      <form onSubmit={submit} noValidate aria-label="Buscar alunos">
        <div className={styles.filters}>
          <label className={'declaration-field ' + styles.wide}>
            Nome ou matrícula do aluno
            <input
              name="query"
              type="search"
              minLength={2}
              maxLength={180}
              placeholder="Ex.: Maria ou 3711533"
              value={filters.query}
              onChange={(e) =>
                setFilters({ ...filters, query: e.target.value })
              }
              {...searchValidation.field('query')}
            />
          </label>
          <label className="declaration-field">
            Modalidade
            <select
              value={filters.mode}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  mode: e.target.value as StudentSearch['mode'],
                  className: '',
                })
              }
            >
              <option value="">Integrado e Subsequente</option>
              <option value="INTEGRADO">Integrado</option>
              <option value="SUBSEQUENTE">Subsequente</option>
            </select>
          </label>
          <label className="declaration-field">
            Turma
            <input
              maxLength={120}
              value={filters.className}
              onChange={(e) =>
                setFilters({ ...filters, className: e.target.value })
              }
              list="student-classes"
              placeholder="Todas as turmas"
            />
            <datalist id="student-classes">
              {(results?.classes ?? []).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label className="declaration-field">
            Situação
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  status: e.target.value as StudentSearch['status'],
                })
              }
            >
              <option value="">Todas as situações</option>
              <option value="UNBLOCKED">Sem bloqueios</option>
              <option value="LOGIN_BLOCKED">Acesso bloqueado</option>
              <option value="ISSUANCE_BLOCKED">
                Novas declarações bloqueadas
              </option>
            </select>
          </label>
        </div>
        {searchValidation.error && (
          <p
            id="students-search-error"
            role="alert"
            className="declaration-feedback request-error"
          >
            {searchValidation.error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="submit"
            className="ete-button"
            disabled={!searchValidation.ready || loading}
          >
            Buscar alunos
          </button>
          {loading && <span role="status">Buscando alunos…</span>}
        </div>
      </form>
      {message && (
        <p className="declaration-feedback" role="status">
          {message}
        </p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="ete-button ete-button--secondary"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Tentar buscar novamente
          </button>
        </div>
      )}
      {!applied && (
        <p>
          Digite um nome, use os filtros ou clique em Buscar alunos para
          consultar a primeira página.
        </p>
      )}
      {results && (
        <section aria-label="Resultado da busca de alunos">
          <p>
            {results.total} aluno(s) encontrado(s). Página {results.page} de{' '}
            {Math.max(1, Math.ceil(results.total / results.pageSize))}.
          </p>
          {!results.students.length ? (
            <p>
              Nenhum aluno encontrado. Confira o nome, a matrícula ou os
              filtros.
            </p>
          ) : (
            <ul className={styles.rows}>
              {results.students.map((s) => (
                <li className={styles.row} key={s.id}>
                  <h2>{s.name}</h2>
                  <p>
                    Matrícula: {s.registration ?? 'Não informada'} ·{' '}
                    {s.loginBlocked
                      ? 'Acesso bloqueado'
                      : 'Acesso sem bloqueio'}{' '}
                    ·{' '}
                    {s.issuanceBlocked
                      ? 'Novas declarações bloqueadas'
                      : 'Novas declarações sem bloqueio'}
                  </p>
                  <p>
                    {s.enrollments
                      .map(
                        (e) =>
                          `${e.className} · ${e.mode === 'INTEGRADO' ? 'Integrado' : 'Subsequente'}`,
                      )
                      .join(' / ') || 'Sem turma cadastrada'}
                  </p>
                  <button
                    type="button"
                    className="ete-button ete-button--secondary"
                    onClick={() => {
                      setSelected(s.id);
                      setHistoryPage(1);
                      setMessage('');
                    }}
                  >
                    Ver aluno e bloqueios
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className="ete-button ete-button--secondary"
              disabled={results.page <= 1}
              onClick={() => setPage(results.page - 1)}
            >
              Página anterior
            </button>
            <button
              type="button"
              className="ete-button ete-button--secondary"
              disabled={results.page * results.pageSize >= results.total}
              onClick={() => setPage(results.page + 1)}
            >
              Próxima página
            </button>
          </div>
        </section>
      )}
      {selected && (
        <section aria-labelledby="student-detail-title">
          <h2 ref={heading} id="student-detail-title" tabIndex={-1}>
            Dados e bloqueios do aluno
          </h2>
          {detailLoading && <p role="status">Consultando o aluno…</p>}
          {detailError && (
            <div role="alert">
              <p>{detailError}</p>
              <button
                type="button"
                className="ete-button ete-button--secondary"
                onClick={() => setRefresh((n) => n + 1)}
              >
                Consultar aluno novamente
              </button>
            </div>
          )}
          {student && (
            <>
              <h3 className={styles.identity}>{student.name}</h3>
              <p>
                Matrícula: {student.registration ?? 'Não informada'} ·{' '}
                {student.accountStatus
                  ? (accountStatus[student.accountStatus] ?? 'Conta a conferir')
                  : 'Ainda sem conta no portal'}
              </p>
              <p>Até dez matrículas mais recentes.</p>
              <ul className={styles.rows}>
                {student.enrollments.map((e) => (
                  <li className={styles.row} key={e.id}>
                    {e.className} ·{' '}
                    {e.mode === 'INTEGRADO' ? 'Integrado' : 'Subsequente'} ·{' '}
                    {e.courseLabel} ·{' '}
                    {e.mode === 'INTEGRADO'
                      ? `${e.grade ?? '—'}ª série`
                      : `${e.moduleNumber ?? '—'}º módulo`}{' '}
                    · {e.periodLabel ?? 'Período não informado'}
                    <p>{schoolStatus[e.status] ?? 'Matrícula a conferir'}</p>
                  </li>
                ))}
              </ul>
              <h3>Bloqueios</h3>
              <p>
                Acesso ao portal:{' '}
                <strong>
                  {student.loginBlocked ? 'Bloqueado' : 'Sem bloqueio'}
                </strong>
              </p>
              <p>
                Novas declarações:{' '}
                <strong>
                  {student.issuanceBlocked ? 'Bloqueadas' : 'Sem bloqueio'}
                </strong>
              </p>
              <div className={styles.actions}>
                <button
                  className="ete-button ete-button--secondary"
                  type="button"
                  onClick={() => openAction('LOGIN')}
                >
                  {student.loginBlocked
                    ? 'Desbloquear acesso'
                    : 'Bloquear acesso'}
                </button>
                <button
                  className="ete-button ete-button--secondary"
                  type="button"
                  onClick={() => openAction('ISSUANCE')}
                >
                  {student.issuanceBlocked
                    ? 'Desbloquear novas declarações'
                    : 'Bloquear novas declarações'}
                </button>
                <button
                  className="ete-button ete-button--secondary"
                  type="button"
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  Atualizar dados do aluno
                </button>
              </div>
              <h3>Histórico dos bloqueios</h3>
              {detail?.history.length ? (
                <>
                  <ol className={styles.history}>
                    {detail.history.map((h) => (
                      <li key={h.revision}>
                        <strong>
                          {h.blocked ? 'Bloqueio de' : 'Desbloqueio de'}{' '}
                          {kindLabel(h.kind)}
                        </strong>
                        <p>
                          {time(h.date)} · {h.actor}
                        </p>
                        <p>Motivo: {h.reason}</p>
                      </li>
                    ))}
                  </ol>
                  <p>
                    Página {detail.page} de{' '}
                    {Math.max(1, Math.ceil(detail.total / detail.pageSize))} do
                    histórico.
                  </p>
                  <div className={styles.actions}>
                    <button
                      className="ete-button ete-button--secondary"
                      type="button"
                      disabled={detail.page <= 1}
                      onClick={() => setHistoryPage(detail.page - 1)}
                    >
                      Histórico anterior
                    </button>
                    <button
                      className="ete-button ete-button--secondary"
                      type="button"
                      disabled={detail.page * detail.pageSize >= detail.total}
                      onClick={() => setHistoryPage(detail.page + 1)}
                    >
                      Mais registros
                    </button>
                  </div>
                </>
              ) : (
                <p>Nenhum bloqueio registrado para este aluno.</p>
              )}
            </>
          )}
        </section>
      )}
      <dialog
        className={styles.dialog}
        ref={dialog}
        aria-labelledby="student-action-title"
        aria-describedby="student-action-description"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <h2 id="student-action-title">
          {pending?.blocked ? 'Bloquear' : 'Desbloquear'}{' '}
          {kindLabel(pending?.kind ?? 'LOGIN')}
        </h2>
        <p className={styles.identity}>{student?.name}</p>
        <p id="student-action-description">
          {pending?.kind === 'LOGIN'
            ? pending.blocked
              ? 'O aluno será desconectado e não poderá entrar no portal até o desbloqueio.'
              : 'O aluno poderá entrar novamente com sua senha. As sessões antigas não serão recuperadas.'
            : pending?.blocked
              ? 'O aluno poderá acessar o portal e baixar documentos anteriores, mas não poderá emitir outra declaração.'
              : 'O aluno poderá solicitar novas declarações se a matrícula e os dados estiverem corretos.'}{' '}
          Documentos já emitidos serão preservados.
        </p>
        <form
          noValidate
          onSubmit={save}
          aria-label="Confirmar alteração de bloqueio"
        >
          <label className="declaration-field">
            Motivo
            <textarea
              className="resize-none"
              name="reason"
              required
              minLength={3}
              maxLength={500}
              value={reason}
              disabled={busy || uncertain || conflict}
              onChange={(e) => setReason(e.target.value)}
              {...actionValidation.field('reason')}
            />
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              name="confirmed"
              required
              checked={confirmed}
              disabled={busy || uncertain || conflict}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Conferi o aluno e quero registrar esta alteração.
          </label>
          {actionValidation.error && (
            <p
              className="declaration-feedback request-error"
              role="alert"
              id="students-action-error"
            >
              {actionValidation.error}
            </p>
          )}
          <div className={styles.actions}>
            <button
              className="ete-button ete-button--secondary"
              ref={safe}
              type="button"
              disabled={busy}
              onClick={close}
            >
              {uncertain || conflict ? 'Fechar e consultar situação' : 'Voltar'}
            </button>
            <button
              className="ete-button"
              type="submit"
              disabled={busy || conflict || !actionValidation.ready}
            >
              {busy
                ? 'Registrando…'
                : uncertain
                  ? 'Repetir o mesmo envio'
                  : 'Confirmar alteração'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
