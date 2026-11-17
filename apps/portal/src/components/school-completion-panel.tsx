'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CompletionContext } from '@/lib/school-completion-input';
import type { CompletionStudent } from '@/lib/school-completion';
import { newRequestKey } from '@/lib/request-key';
import { useFormValidation } from './use-form-validation';
import styles from './document-registry.module.css';
class CompletionHttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function send(body: object, signal: AbortSignal) {
  const response = await fetch('/api/secretaria/alunos/conclusao', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new CompletionHttpError(
      typeof data.error === 'string'
        ? data.error
        : 'Não foi possível conferir os concluintes.',
      response.status,
    );
  return data;
}
const isStudents = (v: unknown): v is CompletionStudent[] =>
  Array.isArray(v) &&
  v.length <= 100 &&
  v.every(
    (s) =>
      typeof s.enrollmentId === 'string' &&
      typeof s.version === 'string' &&
      typeof s.name === 'string',
  );
export default function SchoolCompletionPanel({
  context,
  onChanged,
}: {
  context: CompletionContext;
  onChanged: (message: string) => void;
}) {
  const validation = useFormValidation('completion-error');
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false),
    [conflict, setConflict] = useState(false);
  const [data, setData] = useState<{
      students: CompletionStudent[];
      page: number;
      hasNext: boolean;
    } | null>(null),
    [choices, setChoices] = useState<CompletionStudent[]>([]),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [preview, setPreview] = useState<{
      students: CompletionStudent[];
      previewVersion: string;
    } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    active = useRef<AbortController | null>(null),
    locked = useRef(false),
    mounted = useRef(true),
    intent = useRef<object | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  useEffect(() => {
    const d = dialog.current;
    if (open && d && !d.open) {
      d.showModal();
      heading.current?.focus();
    } else if (!open && d?.open) {
      d.close();
      trigger.current?.focus();
    }
  }, [open]);
  function resetSelection() {
    setChoices([]);
    setPreview(null);
    setConfirmed(false);
    setError('');
    setUncertain(false);
    setConflict(false);
    intent.current = null;
    validation.reset();
  }
  function close() {
    if (saving) return;
    active.current?.abort();
    active.current = null;
    locked.current = false;
    setBusy(false);
    if (uncertain)
      onChanged(
        'O resultado do encerramento não foi confirmado. Confira a turma e o histórico antes de tentar outra operação.',
      );
    setOpen(false);
    resetSelection();
    setData(null);
    setReason('');
  }
  async function load(page: number) {
    if (locked.current) return;
    locked.current = true;
    active.current?.abort();
    const c = new AbortController();
    active.current = c;
    const timer = setTimeout(() => c.abort(), 20000);
    setBusy(true);
    setData(null);
    setError('');
    try {
      const v = await send(
        { operation: 'candidates', context, page },
        c.signal,
      );
      if (
        !isStudents(v.students) ||
        v.students.length > 20 ||
        v.students.some(
          (s: CompletionStudent) => typeof s.selectable !== 'boolean',
        ) ||
        v.page !== page ||
        typeof v.hasNext !== 'boolean'
      )
        throw new Error('A lista não chegou completa. Consulte novamente.');
      if (mounted.current && active.current === c && !c.signal.aborted)
        setData(v);
    } catch (e) {
      if (mounted.current && active.current === c)
        setError(
          c.signal.aborted
            ? 'A consulta foi interrompida. Consulte novamente.'
            : e instanceof Error
              ? e.message
              : 'Não foi possível consultar a turma.',
        );
    } finally {
      clearTimeout(timer);
      if (active.current === c) {
        locked.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }
  function selectedPayload() {
    return choices.map(({ enrollmentId, version }) => ({
      enrollmentId,
      version,
    }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      locked.current ||
      !validation.ready ||
      !validation.validate(event.currentTarget) ||
      !choices.length ||
      conflict
    )
      return;
    locked.current = true;
    const c = new AbortController();
    active.current = c;
    const timer = setTimeout(() => c.abort(), 20000);
    setBusy(true);
    setSaving(!!preview);
    setError('');
    try {
      if (!preview) {
        const v = await send(
          {
            operation: 'preview',
            context,
            selections: selectedPayload(),
            reason,
          },
          c.signal,
        );
        if (
          !isStudents(v.students) ||
          v.students.length !== choices.length ||
          typeof v.previewVersion !== 'string' ||
          !/^[a-f0-9]{64}$/.test(v.previewVersion)
        )
          throw new Error('A prévia não chegou completa. Confira novamente.');
        if (mounted.current && active.current === c) {
          setPreview(v);
          setConfirmed(false);
          heading.current?.focus();
        }
      } else {
        if (!confirmed) return;
        if (!intent.current)
          intent.current = {
            operation: 'confirm',
            context,
            selections: selectedPayload(),
            reason,
            previewVersion: preview.previewVersion,
            confirmed: true,
            requestKey: newRequestKey(),
          };
        const v = await send(intent.current, c.signal);
        if (v.ended !== choices.length || typeof v.replayed !== 'boolean')
          throw new Error('O resultado não chegou completo.');
        if (mounted.current && active.current === c) {
          intent.current = null;
          setUncertain(false);
          setOpen(false);
          onChanged(
            `${v.ended} vínculo(s) encerrado(s). Conta, arquivos e outras matrículas foram preservados.`,
          );
          resetSelection();
          setData(null);
          setReason('');
        }
      }
    } catch (e) {
      if (mounted.current && active.current === c) {
        const status = e instanceof CompletionHttpError ? e.status : 0;
        const unknown = !!preview && (status === 0 || status >= 500);
        setUncertain(unknown);
        setConflict(!unknown && [401, 403, 404, 409].includes(status));
        if (!unknown) intent.current = null;
        setError(
          (e instanceof Error ? e.message : 'A resposta não chegou.') +
            (unknown
              ? ' Repita a mesma confirmação para consultar o resultado, sem duplicar o encerramento.'
              : ' Confira a seleção e consulte a turma novamente.'),
        );
      }
    } finally {
      clearTimeout(timer);
      if (active.current === c) {
        locked.current = false;
        if (mounted.current) {
          setBusy(false);
          setSaving(false);
        }
      }
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ete-button ete-button--secondary"
        disabled={!validation.ready}
        onClick={() => {
          resetSelection();
          setOpen(true);
          void load(1);
        }}
      >
        Encerrar vínculos de concluintes desta turma
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="completion-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <h2 id="completion-title" ref={heading} tabIndex={-1}>
          Encerrar vínculos dos concluintes
        </h2>
        <p>
          {context.className} · {context.periodLabel} · {context.courseLabel} ·{' '}
          {context.mode === 'INTEGRADO' ? 'Integrado' : 'Subsequente'}
        </p>
        <p>
          Marque somente quem realmente concluiu o curso. A conta e os
          documentos anteriores serão mantidos. Outros vínculos do aluno não
          serão alterados.
        </p>
        <button
          type="button"
          className="ete-button ete-button--secondary"
          disabled={saving}
          onClick={close}
        >
          {uncertain
            ? 'Fechar e conferir a turma'
            : 'Voltar aos alunos da turma'}
        </button>
        {busy && (
          <p role="status">
            {saving ? 'Registrando os encerramentos…' : 'Conferindo os dados…'}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <form noValidate method="post" onSubmit={submit}>
          {!preview && (
            <>
              <button
                type="button"
                className="ete-button ete-button--secondary"
                disabled={busy}
                onClick={() => {
                  resetSelection();
                  void load(1);
                }}
              >
                Consultar concluintes novamente
              </button>
              {data && (
                <section aria-label="Concluintes para selecionar">
                  {!data.students.length && (
                    <p>
                      Nenhum vínculo disponível nesta página. Só podem ser
                      selecionados alunos da última etapa, com matrícula ativa e
                      conferida, sem repetência pendente.
                    </p>
                  )}
                  <ul className={styles.rows}>
                    {data.students.map((s) => (
                      <li key={s.enrollmentId} className={styles.row}>
                        <label className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={choices.some(
                              (c) => c.enrollmentId === s.enrollmentId,
                            )}
                            disabled={
                              busy ||
                              !s.selectable ||
                              (!choices.some(
                                (c) => c.enrollmentId === s.enrollmentId,
                              ) &&
                                choices.length >= 100)
                            }
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setChoices((prev) =>
                                checked
                                  ? [
                                      ...prev.filter(
                                        (c) =>
                                          c.enrollmentId !== s.enrollmentId,
                                      ),
                                      s,
                                    ]
                                  : prev.filter(
                                      (c) => c.enrollmentId !== s.enrollmentId,
                                    ),
                              );
                            }}
                          />
                          {s.name} · Matrícula{' '}
                          {s.registration ?? 'não informada'}
                        </label>
                        {!s.selectable && (
                          <p>
                            Os dados escolares precisam de conferência antes do
                            encerramento.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="ete-button ete-button--secondary"
                      disabled={busy || data.page <= 1}
                      onClick={() => void load(data.page - 1)}
                    >
                      Concluintes anteriores
                    </button>
                    <span>Página {data.page}</span>
                    <button
                      type="button"
                      className="ete-button ete-button--secondary"
                      disabled={busy || !data.hasNext}
                      onClick={() => void load(data.page + 1)}
                    >
                      Próximos concluintes
                    </button>
                  </div>
                </section>
              )}
              <p role="status">
                {choices.length} vínculo(s) selecionado(s), de no máximo 100.
                Uma nova consulta limpa a seleção; trocar de página mantém os
                nomes marcados.
              </p>
              {!!choices.length && (
                <section aria-label="Vínculos selecionados">
                  <ul>
                    {choices.map((s) => (
                      <li key={s.enrollmentId}>
                        {s.name} · {s.registration}
                        <button
                          type="button"
                          className="ete-button ete-button--quiet"
                          disabled={busy}
                          onClick={() =>
                            setChoices(
                              choices.filter(
                                (c) => c.enrollmentId !== s.enrollmentId,
                              ),
                            )
                          }
                        >
                          Remover {s.name} da seleção
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
          <label className="declaration-field">
            Motivo do encerramento
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              style={{ resize: 'vertical' }}
              value={reason}
              readOnly={!!preview}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: conclusão do curso conferida nos registros escolares."
              {...validation.field('reason')}
            />
          </label>
          {preview && (
            <section aria-label="Prévia dos encerramentos">
              <h3>Confira os vínculos que serão encerrados</h3>
              <ul>
                {preview.students.map((s) => (
                  <li key={s.enrollmentId}>
                    {s.name} · Matrícula {s.registration ?? 'não informada'} ·{' '}
                    {s.stage}º {context.mode === 'INTEGRADO' ? 'ano' : 'módulo'}
                  </li>
                ))}
              </ul>
              <p>
                Estes vínculos não permitirão novas declarações de vínculo. Os
                documentos anteriores não serão cancelados. Uma correção
                posterior ficará registrada no histórico e exigirá conferência
                da matrícula.
              </p>
              <label className={styles.checkbox}>
                <input
                  name="confirmed"
                  type="checkbox"
                  required
                  checked={confirmed}
                  disabled={busy || uncertain || conflict}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  {...validation.field('confirmed')}
                />
                Conferi a conclusão dos alunos selecionados e quero encerrar
                somente estes vínculos.
              </label>
            </section>
          )}
          {validation.error && (
            <p id="completion-error" role="alert">
              {validation.error}
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="submit"
              className={'ete-button' + (preview ? ' ete-button--danger' : '')}
              disabled={
                !validation.ready ||
                busy ||
                conflict ||
                !choices.length ||
                (!!preview && !confirmed)
              }
            >
              {preview
                ? uncertain
                  ? 'Repetir confirmação'
                  : 'Confirmar encerramento'
                : 'Conferir encerramento dos selecionados'}
            </button>
            {preview && !uncertain && (
              <button
                type="button"
                className="ete-button ete-button--secondary"
                disabled={busy}
                onClick={() => {
                  resetSelection();
                  void load(1);
                }}
              >
                Voltar à seleção
              </button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
