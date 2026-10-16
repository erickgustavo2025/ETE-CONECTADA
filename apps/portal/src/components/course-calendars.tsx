'use client';
import { useEffect, useRef, useState } from 'react';
import {
  COURSE_MODULES,
  readCalendarDraft,
  type CalendarDraft,
} from '@/lib/course-calendar-input';
import type {
  listCourseOfferings,
  courseMembers,
} from '@/lib/course-calendars';
import { useFormValidation } from './use-form-validation';
import styles from './integrated-import.module.css';
type Offering = Awaited<
  ReturnType<typeof listCourseOfferings>
>['offerings'][number];
type Members = Awaited<ReturnType<typeof courseMembers>>;
type Editor = { id: string; revision: number; draft: CalendarDraft };
async function request<T>(input: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/secretaria/calendarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(35000)])
      : AbortSignal.timeout(35000),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error ||
        'Não foi possível confirmar a operação. Recarregue para conferir.',
    );
  return body as T;
}
function message(error: unknown) {
  return error instanceof Error &&
    !['TimeoutError', 'AbortError', 'TypeError', 'SyntaxError'].includes(
      error.name,
    )
    ? error.message
    : 'Não foi possível confirmar a operação. Confira a lista antes de tentar novamente.';
}
function blank(): CalendarDraft {
  return {
    label: '',
    courseLabel: 'DS',
    startsOn: '',
    endsOn: '',
    modules: Array.from({ length: 3 }, (_, i) => ({
      number: i + 1,
      startsOn: '',
      endsOn: '',
      periodLabel: '',
    })),
  };
}
export default function CourseCalendars() {
  const [courses, setCourses] = useState<Offering[]>([]),
    [selected, setSelected] = useState(''),
    [editor, setEditor] = useState<Editor | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request<Awaited<ReturnType<typeof listCourseOfferings>>>(
      { action: 'list' },
      controller.signal,
    )
      .then((result) => {
        setCourses(result.offerings);
        setSelected((current) =>
          result.offerings.some((c) => c.id === current)
            ? current
            : result.offerings[0]?.id || '',
        );
        if (result.changes.advanced || result.changes.updatedDates)
          setNotice(
            'Calendário atualizado. Confira novamente os vínculos alterados antes de emitir declarações.',
          );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(message(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);
  const course = courses.find((c) => c.id === selected);
  return (
    <section className={`document-page ${styles.page}`}>
      <p className={styles.eyebrow}>Secretaria · Subsequente</p>
      <h1>Calendário do subsequente</h1>
      <p>
        Cadastre as datas oficiais de cada oferta. ADM e DS têm três módulos;
        Enfermagem tem quatro. Turmas com entradas diferentes precisam de
        ofertas próprias.
      </p>
      <p className={styles.note}>
        A progressão é conferida ao abrir ou atualizar esta tela. O calendário
        não comprova conclusão do curso. Vínculos alterados precisam de nova
        conferência; ausentes na planilha não são excluídos.
      </p>
      <div className={styles.feedback} role="status">
        {loading ? 'Conferindo calendário…' : notice}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {editor ? (
        <CalendarEditor
          key={`${editor.id}:${editor.revision}`}
          editor={editor}
          onCancel={() => setEditor(null)}
          onSave={(id) => {
            setSelected(id);
            setEditor(null);
            setNotice('Calendário salvo.');
            setRefresh((n) => n + 1);
          }}
        />
      ) : (
        <>
          <div className={styles.actions}>
            <button
              className="ete-button"
              disabled={loading || !!error}
              onClick={() =>
                setEditor({
                  id: crypto.randomUUID(),
                  revision: 0,
                  draft: blank(),
                })
              }
            >
              Nova oferta
            </button>
            <button
              className="ete-button ete-button--secondary"
              disabled={loading}
              onClick={() => setRefresh((n) => n + 1)}
            >
              Atualizar calendário
            </button>
          </div>
          {!loading && !error && (
            <>
              {courses.length ? (
                <>
                  <label htmlFor="offering">Oferta</label>
                  <select
                    id="offering"
                    value={selected}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setNotice('');
                    }}
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.draft.label} · {c.draft.courseLabel}
                      </option>
                    ))}
                  </select>
                  {course && (
                    <>
                      <h2>{course.draft.label}</h2>
                      <p>
                        Versão {course.revision} ·{' '}
                        {course.currentModule
                          ? `Módulo atual: ${course.currentModule}`
                          : 'Aguardando início das aulas'}
                        {course.ended
                          ? ' · Calendário encerrado; confira a situação acadêmica.'
                          : ''}
                      </p>
                      {course.needsUpdatedList && (
                        <p className={styles.notice}>
                          Solicite a planilha atualizada desta oferta para
                          conferir novos alunos, ausentes e divergências.
                        </p>
                      )}
                      <p>
                        {course.counts.total} vínculos associados ·{' '}
                        {course.counts.held} com progressão pausada ·{' '}
                        {course.counts.unconfirmed} aguardando conferência.
                      </p>
                      <button
                        className="ete-button ete-button--secondary"
                        onClick={() =>
                          setEditor({
                            id: course.id,
                            revision: course.revision,
                            draft: structuredClone(course.draft),
                          })
                        }
                      >
                        Editar calendário
                      </button>
                      <CalendarMembers
                        key={`${course.id}:${course.revision}`}
                        course={course}
                        onChange={() => setRefresh((n) => n + 1)}
                      />
                    </>
                  )}
                </>
              ) : (
                <p>
                  Nenhuma oferta cadastrada. Comece com as datas confirmadas
                  pela secretaria.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
function CalendarEditor({
  editor,
  onCancel,
  onSave,
}: {
  editor: Editor;
  onCancel: () => void;
  onSave: (id: string) => void;
}) {
  const [draft, setDraft] = useState(editor.draft),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const validation = useFormValidation('calendar-validation'),
    alertRef = useRef<HTMLParagraphElement>(null);
  const update = (name: 'label' | 'startsOn' | 'endsOn', value: string) =>
    setDraft((d) => ({ ...d, [name]: value }));
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || !validation.validate(e.currentTarget)) return;
        try {
          readCalendarDraft(draft);
        } catch (e) {
          setError(message(e));
          requestAnimationFrame(() => alertRef.current?.focus());
          return;
        }
        setBusy(true);
        setError('');
        try {
          const result = await request<{ id: string }>({
            action: 'save',
            offeringId: editor.id,
            revision: editor.revision,
            draft,
            confirmed: true,
          });
          onSave(result.id);
        } catch (e) {
          setError(message(e));
          requestAnimationFrame(() => alertRef.current?.focus());
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{editor.revision ? 'Editar calendário' : 'Nova oferta'}</h2>
      <p className={styles.fileName}>
        Use o mesmo identificador da oferta na importação:{' '}
        <code>{editor.id}</code>. Uma nova versão preserva as datas anteriores
        no histórico.
      </p>
      <fieldset disabled={busy} className={styles.contexts}>
        <div className={styles.fields}>
          <div>
            <label htmlFor="calendar-label">Nome da oferta</label>
            <input
              id="calendar-label"
              name="label"
              required
              maxLength={120}
              value={draft.label}
              onChange={(e) => update('label', e.target.value)}
              {...validation.field('label')}
            />
          </div>
          <div>
            <label htmlFor="calendar-course">Curso</label>
            <select
              id="calendar-course"
              name="course"
              disabled={!!editor.revision}
              value={draft.courseLabel}
              onChange={(e) => {
                const courseLabel = e.target
                  .value as CalendarDraft['courseLabel'];
                setDraft((d) => ({
                  ...d,
                  courseLabel,
                  modules: Array.from(
                    { length: COURSE_MODULES[courseLabel] },
                    (_, i) =>
                      d.modules[i] || {
                        number: i + 1,
                        startsOn: '',
                        endsOn: '',
                        periodLabel: '',
                      },
                  ),
                }));
              }}
            >
              <option value="DS">Desenvolvimento de Sistemas</option>
              <option value="ADM">Administração</option>
              <option value="ENF">Enfermagem</option>
            </select>
          </div>
          {(['startsOn', 'endsOn'] as const).map((name) => (
            <div key={name}>
              <label htmlFor={`course-${name}`}>
                {name === 'startsOn' ? 'Início do curso' : 'Fim do curso'}
              </label>
              <input
                id={`course-${name}`}
                name={name}
                type="date"
                required
                min="1900-01-01"
                max="2200-12-31"
                value={draft[name]}
                onChange={(e) => update(name, e.target.value)}
                {...validation.field(name)}
              />
            </div>
          ))}
        </div>
        {draft.modules.map((module, i) => (
          <fieldset key={module.number} className={styles.context}>
            <legend>Módulo {module.number}</legend>
            <div className={styles.fields}>
              {(['startsOn', 'endsOn', 'periodLabel'] as const).map((name) => {
                const id = `module-${i}-${name}`;
                return (
                  <div key={name}>
                    <label htmlFor={id}>
                      {name === 'startsOn'
                        ? `Início do módulo ${module.number}`
                        : name === 'endsOn'
                          ? `Fim do módulo ${module.number}`
                          : `Período do módulo ${module.number}`}
                    </label>
                    <input
                      id={id}
                      name={id}
                      type={name === 'periodLabel' ? 'text' : 'date'}
                      required
                      maxLength={60}
                      min={name === 'periodLabel' ? undefined : '1900-01-01'}
                      max={name === 'periodLabel' ? undefined : '2200-12-31'}
                      value={module[name]}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          modules: d.modules.map((m, index) =>
                            index === i ? { ...m, [name]: e.target.value } : m,
                          ),
                        }))
                      }
                      {...validation.field(id)}
                    />
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
        <label className={styles.check}>
          <input
            type="checkbox"
            name="confirmed"
            required
            {...validation.field('confirmed')}
          />
          Conferi as datas e os períodos com o calendário oficial desta oferta.
        </label>
      </fieldset>
      {validation.error && (
        <p id="calendar-validation" className={styles.error} role="alert">
          {validation.error}
        </p>
      )}
      {error && (
        <p ref={alertRef} tabIndex={-1} className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button className="ete-button" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar calendário'}
        </button>
        <button
          type="button"
          className="ete-button ete-button--secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar edição
        </button>
      </div>
    </form>
  );
}
function CalendarMembers({
  course,
  onChange,
}: {
  course: Offering;
  onChange: () => void;
}) {
  const [page, setPage] = useState(0),
    [data, setData] = useState<Members>({ members: [], hasMore: false }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{
      ids: string[];
      hold: boolean;
      label: string;
    } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request<Members>(
      { action: 'members', offeringId: course.id, page },
      controller.signal,
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(message(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [course.id, page, reload]);
  useEffect(() => {
    if (pending) {
      dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
      trigger.current?.focus();
    }
  }, [pending]);
  function ask(
    ids: string[],
    hold: boolean,
    label: string,
    target: HTMLElement,
  ) {
    trigger.current = target;
    setPending({ ids, hold, label });
    setError('');
  }
  const eligible = data.members.filter(
    (m) =>
      m.offeringId === course.id &&
      m.progressionHeld &&
      m.status !== 'ENDED' &&
      m.moduleNumber === course.currentModule,
  );
  return (
    <>
      <h2>Vínculos e exceções</h2>
      <p>
        Associe cada aluno à oferta correta. A progressão automática só é
        ativada após confirmação. Pausar preserva o módulo escolar até a
        conferência.
      </p>
      {loading && <p role="status">Carregando vínculos…</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button
          className="ete-button ete-button--secondary"
          disabled={loading || busy}
          onClick={() => setReload((n) => n + 1)}
        >
          Recarregar vínculos
        </button>
        <button
          className="ete-button ete-button--secondary"
          disabled={loading || busy || !!error || !eligible.length}
          onClick={(e) =>
            ask(
              eligible.map((m) => m.id),
              false,
              `${eligible.length} vínculos já associados nesta página`,
              e.currentTarget,
            )
          }
        >
          Ativar progressão nesta página
        </button>
      </div>
      {!loading && !error && (
        <>
          <div
            className={styles.tableWrap}
            tabIndex={0}
            role="region"
            aria-label="Vínculos da oferta"
          >
            <table className={styles.table}>
              <caption>Página {page + 1} · até 50 vínculos</caption>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Turma e módulo</th>
                  <th>Progressão</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.student.fullName}
                      <br />
                      {m.student.schoolRegistration}
                    </td>
                    <td>
                      {m.className} · módulo {m.moduleNumber}
                      {m.status === 'ENDED'
                        ? ' · Encerrado'
                        : m.status === 'UNCONFIRMED'
                          ? ' · Conferência pendente'
                          : ''}
                    </td>
                    <td>
                      {!m.offeringId
                        ? 'Sem oferta'
                        : m.progressionHeld
                          ? 'Pausada'
                          : 'Automática'}
                    </td>
                    <td>
                      {m.status !== 'ENDED' && (
                        <>
                          <button
                            className="ete-button ete-button--secondary"
                            disabled={busy}
                            onClick={(e) =>
                              ask(
                                [m.id],
                                true,
                                m.student.fullName ||
                                  m.student.schoolRegistration ||
                                  'Vínculo escolar',
                                e.currentTarget,
                              )
                            }
                          >
                            {m.offeringId
                              ? 'Pausar progressão'
                              : 'Associar com progressão pausada'}
                          </button>
                          {m.moduleNumber === course.currentModule && (
                            <button
                              className="ete-button ete-button--secondary"
                              disabled={busy}
                              onClick={(e) =>
                                ask(
                                  [m.id],
                                  false,
                                  m.student.fullName ||
                                    m.student.schoolRegistration ||
                                    'Vínculo escolar',
                                  e.currentTarget,
                                )
                              }
                            >
                              Ativar progressão
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.members.length && (
            <p>
              Nenhum vínculo disponível nesta página. A importação do
              subsequente será disponibilizada separadamente.
            </p>
          )}
          <div className={styles.actions}>
            <button
              className="ete-button ete-button--secondary"
              disabled={!page || busy}
              onClick={() => setPage((n) => n - 1)}
            >
              Página anterior
            </button>
            <button
              className="ete-button ete-button--secondary"
              disabled={!data.hasMore || busy}
              onClick={() => setPage((n) => n + 1)}
            >
              Próxima página
            </button>
          </div>
        </>
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="policy-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setPending(null);
        }}
      >
        <h2 id="policy-title">Confirmar progressão</h2>
        <p>{pending?.label}</p>
        <p>
          {pending?.hold
            ? 'O vínculo será associado a esta oferta e mantido com progressão pausada.'
            : 'Confirme que estes vínculos pertencem a esta oferta e ao módulo atual. As próximas mudanças do calendário exigirão nova conferência antes da emissão.'}
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            autoFocus
            className="ete-button ete-button--secondary"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            Cancelar
          </button>
          <button
            className="ete-button"
            disabled={busy || !pending}
            onClick={async () => {
              if (!pending || busy) return;
              setBusy(true);
              setError('');
              try {
                await request({
                  action: 'policy',
                  offeringId: course.id,
                  revision: course.revision,
                  enrollmentIds: pending.ids,
                  hold: pending.hold,
                  confirmed: true,
                });
                setPending(null);
                setReload((n) => n + 1);
                onChange();
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Aplicando…' : 'Confirmar alteração'}
          </button>
        </div>
      </dialog>
    </>
  );
}
