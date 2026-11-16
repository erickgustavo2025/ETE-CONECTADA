'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AcademicDetail } from '@/lib/school-academic-types';
import type { AcademicAction } from '@/lib/school-academic-input';
import { newRequestKey } from '@/lib/request-key';
import { useFormValidation } from './use-form-validation';
import styles from './document-registry.module.css';
class AcademicHttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const labels: Record<AcademicAction, string> = {
  ENABLE: 'Confirmar matrícula e passagem automática',
  REPEAT: 'Marcar reprovação desta etapa',
  REPEAT_PREVIOUS: 'Corrigir reprovação da etapa anterior',
  RESUME: 'Corrigir marcação de reprovação',
};
const descriptions: Record<AcademicAction, string> = {
  ENABLE:
    'Confirme os dados escolares desta matrícula. As próximas passagens ocorrerão automaticamente na data de início, respeitando os bloqueios existentes.',
  REPEAT:
    'O aluno permanecerá nesta etapa, aguardando outra turma. Novas demandas acadêmicas ficarão bloqueadas; o acesso à conta e os documentos anteriores serão mantidos.',
  REPEAT_PREVIOUS:
    'A passagem anterior será corrigida e o aluno ficará na etapa que precisa refazer, aguardando outra turma. O histórico da passagem será preservado.',
  RESUME:
    'Use somente para corrigir uma marcação indevida. Para quem realmente repetiu, escolha uma turma compatível durante a importação.',
};
const eventNames: Record<string, string> = {
  ENABLE: 'Matrícula e passagem automática confirmadas',
  PROGRESSION: 'Passagem automática de etapa',
  CONTINUITY: 'Etapa mantida durante as férias',
  REPEAT: 'Reprovação registrada',
  RESUME: 'Marcação de repetência corrigida',
  OVERRIDE: 'Exceção de atendimento',
  TRANSFER: 'Enturmação registrada',
  END: 'Vínculo encerrado',
  REOPEN: 'Encerramento corrigido',
};
const date = (value: string | null) =>
  value ? value.split('-').reverse().join('/') : 'Não informada';
const time = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Recife',
  }).format(new Date(value));
async function send(
  body: object,
  signal: AbortSignal,
): Promise<AcademicDetail> {
  const response = await fetch('/api/secretaria/alunos/situacao-escolar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new AcademicHttpError(
      typeof data.error === 'string'
        ? data.error
        : 'Não foi possível consultar a matrícula.',
      response.status,
    );
  if (
    typeof data.academicWaiting !== 'boolean' ||
    !data.enrollment ||
    typeof data.enrollment.id !== 'string' ||
    typeof data.enrollment.version !== 'string' ||
    !Array.isArray(data.history) ||
    typeof data.total !== 'number'
  )
    throw new Error(
      'A resposta da matrícula não chegou completa. Consulte novamente.',
    );
  return data;
}
export default function AcademicEnrollmentPanel({
  enrollmentId,
  onChanged,
}: {
  enrollmentId: string;
  onChanged?: (value: AcademicDetail) => void;
}) {
  const [data, setData] = useState<AcademicDetail | null>(null),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [action, setAction] = useState<AcademicAction | null>(null),
    [reason, setReason] = useState(''),
    [nextName, setNextName] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false);
  const validation = useFormValidation('academic-action-error');
  const dialog = useRef<HTMLDialogElement>(null),
    safe = useRef<HTMLButtonElement>(null),
    trigger = useRef<HTMLElement | null>(null),
    lastAction = useRef<AcademicAction | null>(null),
    intent = useRef<object | null>(null),
    locked = useRef(false),
    mounted = useRef(true),
    save = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      save.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => controller.abort(), 20000);
    send({ operation: 'detail', enrollmentId, page }, controller.signal)
      .then((value) => {
        if (active && !controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (active && mounted.current)
          setError(
            e instanceof AcademicHttpError
              ? e.message
              : 'Não foi possível consultar a matrícula. Tente novamente.',
          );
      })
      .finally(() => {
        clearTimeout(timer);
        if (active && mounted.current) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [enrollmentId, page, refresh]);
  useEffect(() => {
    if (action && !dialog.current?.open) {
      dialog.current?.showModal();
      safe.current?.focus();
    } else if (!action && dialog.current?.open) {
      dialog.current.close();
      trigger.current?.focus();
    }
  }, [action]);
  function open(value: AcademicAction, button: HTMLElement) {
    trigger.current = button;
    intent.current = null;
    setConfirmed(false);
    setUncertain(false);
    setConflict(false);
    validation.reset();
    if (lastAction.current !== value) {
      setReason('');
      setNextName(data?.enrollment.nextClassName ?? '');
    }
    lastAction.current = value;
    setAction(value);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !data || !action) return;
    const form = event.currentTarget;
    if (!validation.ready || !validation.validate(form)) return;
    if (!intent.current)
      intent.current = {
        operation: 'change',
        enrollmentId,
        action,
        version: data.enrollment.version,
        reason,
        nextClassName: action === 'ENABLE' ? nextName : null,
        confirmed: true,
        requestKey: newRequestKey(),
      };
    locked.current = true;
    setBusy(true);
    const controller = new AbortController();
    save.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const value = await send(intent.current, controller.signal);
      if (!mounted.current) return;
      setData(value);
      onChanged?.(value);
      setPage(1);
      intent.current = null;
      setUncertain(false);
      setAction(null);
      setReason('');
      lastAction.current = null;
      setMessage(
        value.created === false
          ? 'Esta alteração já havia sido registrada. A situação atual foi consultada.'
          : 'Situação escolar atualizada. O histórico anterior foi preservado.',
      );
    } catch (e) {
      if (mounted.current) {
        const status = e instanceof AcademicHttpError ? e.status : 0,
          correctable = [400, 413, 422].includes(status),
          stale = [401, 403, 404, 409].includes(status);
        setUncertain(!correctable && !stale);
        setConflict(stale);
        if (correctable) intent.current = null;
        validation.reject(
          'reason',
          (e instanceof AcademicHttpError
            ? e.message
            : 'A resposta não chegou.') +
            (stale
              ? ' Feche a confirmação e consulte novamente.'
              : correctable
                ? ' Confira os dados antes de enviar.'
                : ' Repita o mesmo envio ou consulte a situação.'),
          form,
        );
      }
    } finally {
      clearTimeout(timer);
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const row = data?.enrollment;
  return (
    <section aria-labelledby="academic-detail-title" className={styles.row}>
      <h3 id="academic-detail-title">Situação escolar</h3>
      {loading && <p role="status">Consultando a matrícula…</p>}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="ete-button ete-button--secondary"
        disabled={loading || busy}
        onClick={() => setRefresh((n) => n + 1)}
      >
        Consultar situação escolar novamente
      </button>
      {message && <p role="status">{message}</p>}
      {row && !loading && !error && (
        <>
          <p>
            <strong>{row.className}</strong> ·{' '}
            {row.mode === 'INTEGRADO' ? 'Integrado' : 'Subsequente'} ·{' '}
            {row.courseLabel} · {row.stage}º{' '}
            {row.mode === 'INTEGRADO' ? 'ano' : 'módulo'} · {row.periodLabel}
          </p>
          <p>
            <strong>
              {row.status === 'ENDED'
                ? 'Vínculo encerrado'
                : row.repetitionPending
                  ? 'Reprovado: aguardando nova turma'
                  : row.status === 'UNCONFIRMED'
                    ? 'Matrícula a conferir'
                    : 'Matrícula ativa'}
            </strong>
          </p>
          <p>
            Vigência: {date(row.validFrom)} a {date(row.validUntil)}.
          </p>
          <p>
            {row.repetitionPending
              ? 'A passagem automática fica suspensa enquanto aguarda nova turma.'
              : row.progressionHeld
                ? 'A passagem automática aguarda conferência da secretaria.'
                : row.nextDate
                  ? `Próxima etapa a partir de ${date(row.nextDate)}. Até lá, a declaração usa a etapa atual.`
                  : 'Última etapa do curso. A conclusão precisa ser confirmada pela secretaria.'}
          </p>
          {row.status !== 'ENDED' && (
            <div className={styles.actions}>
              {!row.repetitionPending && (
                <>
                  <button
                    type="button"
                    className="ete-button ete-button--secondary"
                    onClick={(e) => open('ENABLE', e.currentTarget)}
                  >
                    {labels.ENABLE}
                  </button>
                  {row.status === 'ACTIVE' && (
                    <button
                      type="button"
                      className="ete-button ete-button--danger-outline"
                      onClick={(e) => open('REPEAT', e.currentTarget)}
                    >
                      {labels.REPEAT}
                    </button>
                  )}
                  {row.status === 'ACTIVE' && row.previousStage !== null && (
                    <button
                      type="button"
                      className="ete-button ete-button--danger-outline"
                      onClick={(e) => open('REPEAT_PREVIOUS', e.currentTarget)}
                    >
                      {labels.REPEAT_PREVIOUS} ({row.previousStage}º)
                    </button>
                  )}
                </>
              )}
              {row.repetitionPending && (
                <button
                  type="button"
                  className="ete-button ete-button--secondary"
                  onClick={(e) => open('RESUME', e.currentTarget)}
                >
                  {labels.RESUME}
                </button>
              )}
            </div>
          )}
          <h4>Histórico da situação escolar</h4>
          {!data.history.length ? (
            <p>Nenhuma alteração registrada nesta matrícula.</p>
          ) : (
            <ol className={styles.history}>
              {data.history.map((h, index) => (
                <li key={`${data.page}-${index}`}>
                  <strong>
                    {eventNames[h.kind] ?? 'Alteração da situação escolar'}
                  </strong>
                  <p>
                    {time(h.date)} · {h.actor}
                  </p>
                  <p>Data escolar: {date(h.effectiveOn)}</p>
                  <p>Motivo: {h.reason}</p>
                </li>
              ))}
            </ol>
          )}
          <p>
            Página {data.page} de{' '}
            {Math.max(1, Math.ceil(data.total / data.pageSize))} do histórico
            escolar.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className="ete-button ete-button--secondary"
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
            >
              Histórico escolar anterior
            </button>
            <button
              type="button"
              className="ete-button ete-button--secondary"
              disabled={data.page * data.pageSize >= data.total}
              onClick={() => setPage(data.page + 1)}
            >
              Mais registros escolares
            </button>
          </div>
        </>
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="academic-dialog-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setAction(null);
        }}
      >
        <h2 id="academic-dialog-title">
          {action ? labels[action] : 'Situação escolar'}
        </h2>
        <p>{action ? descriptions[action] : ''}</p>
        <form
          noValidate
          onSubmit={submit}
          aria-label="Confirmar situação escolar"
        >
          {action === 'ENABLE' && (
            <label className="declaration-field">
              Nome da próxima turma (somente se precisar corrigir)
              <input
                name="nextClassName"
                maxLength={100}
                placeholder="Ex.: 2A DS"
                value={nextName}
                disabled={busy || uncertain || conflict}
                onChange={(e) => setNextName(e.target.value)}
              />
              <span>
                Deixe vazio para usar o nome correspondente à próxima etapa.
              </span>
            </label>
          )}
          <label className="declaration-field">
            Motivo da alteração
            <textarea
              className="resize-none"
              rows={6}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              value={reason}
              disabled={busy || uncertain || conflict}
              onChange={(e) => setReason(e.target.value)}
              {...validation.field('reason')}
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
              {...validation.field('confirmed')}
            />
            Conferi a matrícula e as consequências desta alteração.
          </label>
          {validation.error && (
            <p id="academic-action-error" role="alert">
              {validation.error}
            </p>
          )}
          <div className={styles.actions}>
            <button
              ref={safe}
              type="button"
              className="ete-button ete-button--secondary"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Voltar sem alterar
            </button>
            <button
              type="submit"
              className="ete-button"
              disabled={!validation.ready || busy || conflict}
            >
              {busy
                ? 'Registrando…'
                : uncertain
                  ? 'Repetir o mesmo envio'
                  : 'Confirmar alteração escolar'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
