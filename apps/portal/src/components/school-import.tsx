'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  ImportContextView,
  ImportCounts,
  ImportInspection,
  ImportPreviewView,
} from '@/lib/sheet-import-view';
import { useFormValidation } from './use-form-validation';
import ImportPreview from './import-preview';
import styles from './integrated-import.module.css';

class ImportRequestError extends Error {}

type SelectedFile = { name: string; base64: string };
type DialogAction = 'confirm' | 'discard' | { href: string };
const button = 'ete-button';
const secondary = 'ete-button ete-button--secondary';
function readFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    signal.addEventListener('abort', abort, { once: true });
    reader.onloadend = () => signal.removeEventListener('abort', abort);
    reader.onabort = () =>
      reject(new DOMException('Leitura cancelada.', 'AbortError'));
    reader.onerror = () =>
      reject(
        new Error('Não foi possível ler o arquivo. Selecione-o novamente.'),
      );
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}
export default function SchoolImport({
  mode,
}: {
  mode: 'INTEGRADO' | 'SUBSEQUENTE';
}) {
  const subsequent = mode === 'SUBSEQUENTE',
    modeLabel = subsequent ? 'subsequente' : 'integrado';
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [contexts, setContexts] = useState<ImportContextView[]>([]);
  const [preview, setPreview] = useState<ImportPreviewView | null>(null);
  const [result, setResult] = useState<ImportCounts | null>(null);
  const [busy, setBusy] = useState<'inspect' | 'preview' | 'confirm' | null>(
    null,
  );
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [action, setAction] = useState<DialogAction | null>(null);
  const [identityAccepted, setIdentityAccepted] = useState(false);
  const [calendarAccepted, setCalendarAccepted] = useState(false);
  const calendarDiffers = !!preview?.calendarComparisons?.some(
    (c) => c.differs,
  );
  const fileRef = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    cancelButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null),
    request = useRef<AbortController | null>(null);
  const busyRef = useRef(false),
    dirtyRef = useRef(false);
  const validation = useFormValidation('import-form-error');
  const dirty = !!file && !result;
  const step = result ? 4 : preview ? 3 : inspection ? 2 : 1;
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || busyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const navigate = (event: MouseEvent) => {
      if (
        (!dirtyRef.current && !busyRef.current) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        !(target instanceof HTMLAnchorElement) ||
        target.target === '_blank' ||
        target.download
      )
        return;
      const url = new URL(target.href);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.href === location.href ||
        (url.hash && url.pathname === location.pathname)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!busyRef.current) {
        returnFocus.current = target;
        setAction({ href: target.href });
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', navigate, true);
    };
  }, []);
  useEffect(() => {
    if (action && !dialog.current?.open) {
      dialog.current?.showModal();
      cancelButton.current?.focus();
    }
    if (!action && dialog.current?.open) {
      dialog.current.close();
      returnFocus.current?.focus();
    }
  }, [action]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  function openDialog(value: DialogAction) {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setIdentityAccepted(false);
    setCalendarAccepted(false);
    setAction(value);
  }
  function reset() {
    request.current?.abort();
    setFile(null);
    setInspection(null);
    setContexts([]);
    setPreview(null);
    setResult(null);
    setError('');
    setSessionExpired(false);
    validation.reset();
    setAction(null);
    if (fileRef.current) fileRef.current.value = '';
  }
  async function send<T>(
    body: Record<string, unknown>,
    controller: AbortController,
  ) {
    const response = await fetch('/api/secretaria/importacao', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const value = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        setSessionExpired(true);
      if (body.action === 'confirm' && response.status === 409) {
        setAction(null);
        setPreview(null);
      }
      throw new ImportRequestError(
        value.error ||
          'Não foi possível concluir. Confira os dados e tente novamente.',
      );
    }
    return value as T;
  }
  async function inspectFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const form = event.currentTarget;
    if (!validation.validate(form)) return;
    const selected = fileRef.current?.files?.[0];
    if (!selected) return;
    if (
      !/\.xls$/i.test(selected.name) ||
      selected.size < 512 ||
      selected.size > 2 * 1024 * 1024
    ) {
      validation.reject('file', 'Escolha um XLS binário de até 2 MiB.', form);
      return;
    }
    busyRef.current = true;
    setBusy('inspect');
    setError('');
    setSessionExpired(false);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const base64 = await readFile(selected, controller.signal);
      const value = await send<ImportInspection>(
        { action: 'inspect', mode, fileBase64: base64 },
        controller,
      );
      if (!controller.signal.aborted) {
        setFile({ name: selected.name, base64 });
        setInspection(value);
        setContexts(
          value.sheets.map((s) => ({
            sheetName: s.sheetName,
            courseLabel: s.courseLabel,
            stage: s.stage,
            scopeId: '',
            className: '',
            periodLabel: '',
            confirmed: false,
            bindings: {},
          })),
        );
      }
    } catch (e) {
      if (request.current === controller)
        setError(
          controller.signal.aborted
            ? 'Leitura interrompida. Tente novamente.'
            : e instanceof ImportRequestError
              ? e.message
              : 'Não foi possível ler o arquivo. Confira a conexão e tente novamente.',
        );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }
  function updateContext(index: number, patch: Partial<ImportContextView>) {
    setContexts((previous) =>
      previous.map((context, i) =>
        i === index ? { ...context, ...patch, confirmed: false } : context,
      ),
    );
    validation.reset();
    setError('');
  }
  async function createPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !file) return;
    if (!validation.validate(event.currentTarget)) return;
    busyRef.current = true;
    setBusy('preview');
    setError('');
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const value = await send<ImportPreviewView>(
        {
          action: 'preview',
          mode,
          fileBase64: file.base64,
          contexts,
        },
        controller,
      );
      if (!controller.signal.aborted) setPreview(value);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? 'Prévia interrompida. Tente novamente.'
          : e instanceof ImportRequestError
            ? e.message
            : 'Não foi possível gerar a prévia. Confira a conexão e tente novamente.',
      );
    } finally {
      clearTimeout(timeout);
      busyRef.current = false;
      setBusy(null);
    }
  }
  async function apply() {
    if (
      busyRef.current ||
      !preview ||
      !file ||
      preview.counts.conflicts ||
      (preview.counts.identityChanges && !identityAccepted) ||
      (calendarDiffers && !calendarAccepted)
    )
      return;
    busyRef.current = true;
    setBusy('confirm');
    setError('');
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 150000);
    try {
      const value = await send<ImportCounts>(
        {
          action: 'confirm',
          mode,
          contexts,
          fileBase64: file.base64,
          token: preview.token,
          confirmed: true,
          acceptIdentityChanges: identityAccepted,
          acceptCalendarDifferences: calendarAccepted,
        },
        controller,
      );
      setResult(value);
      setAction(null);
      setPreview(null);
      setFile(null);
      setInspection(null);
      setContexts([]);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(
        e instanceof ImportRequestError
          ? e.message
          : 'Resultado não confirmado. Mantenha a prévia e repita a confirmação: o mesmo envio não será aplicado duas vezes.',
      );
    } finally {
      clearTimeout(timeout);
      busyRef.current = false;
      setBusy(null);
    }
  }
  return (
    <section
      className={`document-page ${styles.page}`}
      aria-labelledby="import-title"
    >
      <p className={styles.eyebrow}>
        SECRETARIA · ALUNOS DO {modeLabel.toUpperCase()}
      </p>
      <h1 id="import-title" ref={heading} tabIndex={-1}>
        Importar alunos do {modeLabel}
      </h1>
      <p className="document-intro">
        Confira as turmas e as diferenças antes de atualizar os cadastros.
      </p>
      <ol className={styles.steps} aria-label="Etapas da importação">
        {['Arquivo', 'Turmas', 'Conferência', 'Resultado'].map(
          (name, index) => (
            <li
              key={name}
              aria-current={step === index + 1 ? 'step' : undefined}
            >
              <span>{index + 1}</span>
              {name}
            </li>
          ),
        )}
      </ol>
      <div className={styles.feedback} aria-live="polite" role="status">
        {busy
          ? {
              inspect: 'Lendo o arquivo…',
              preview: 'Preparando a prévia…',
              confirm: 'Aplicando a importação…',
            }[busy]
          : ''}
      </div>
      {busy && busy !== 'confirm' && (
        <button
          className={secondary}
          type="button"
          onClick={() => request.current?.abort()}
        >
          Cancelar leitura
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error} {sessionExpired && <a href="/login">Entrar novamente</a>}
        </p>
      )}
      {validation.error && (
        <p id="import-form-error" className={styles.error} role="alert">
          {validation.error}
        </p>
      )}
      {!inspection && !result && (
        <form
          method="post"
          noValidate
          onSubmit={inspectFile}
          className={styles.upload}
        >
          <label htmlFor="import-file">Planilha de alunos do {modeLabel}</label>
          <p id="file-help">
            Selecione a planilha de alunos no formato .xls, com até 2 MB e 25
            abas. Arquivos .xlsx não são aceitos aqui.
          </p>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".xls"
            required
            ref={fileRef}
            disabled={!!busy}
            {...validation.field('file')}
          />
          <button className={button} disabled={!!busy}>
            Ler arquivo
          </button>
        </form>
      )}
      {inspection && !preview && (
        <form method="post" noValidate onSubmit={createPreview}>
          <p className={styles.fileName}>
            Arquivo: <strong>{file?.name}</strong>
          </p>
          <h2>Confira cada aba</h2>
          <p>
            {subsequent
              ? 'Escolha a turma e o semestre de ingresso cadastrados no calendário. Confira as datas, mesmo que os nomes sejam parecidos.'
              : 'Para atualizar alunos, escolha a turma já cadastrada. Cadastre uma nova turma somente se for outro grupo de alunos. Confira o curso e o ano de ingresso.'}
          </p>
          {subsequent && (
            <>
              <p>
                Ingresso é o semestre em que a turma começou o curso e não muda
                ao passar de módulo. Período letivo é o semestre do módulo desta
                aba. Ex.: uma turma que ingressou em 2026.2 pode cursar o
                segundo módulo em 2027.1. Use o calendário da escola para
                conferir as informações.
              </p>
              <p className={styles.notice}>
                Escolha uma turma com calendário cadastrado para cada aba. Se a
                turma ainda não aparecer,{' '}
                <a href="/secretaria/calendarios">cadastre o calendário</a> e
                leia o arquivo novamente.
              </p>
            </>
          )}
          <fieldset disabled={!!busy} className={styles.contexts}>
            <legend className={styles.srOnly}>Dados das turmas</legend>
            {contexts.map((context, index) => (
              <fieldset className={styles.context} key={context.sheetName}>
                <legend>
                  Aba {index + 1}: {context.sheetName}
                </legend>
                <p>
                  {context.courseLabel === 'ADM'
                    ? 'Administração'
                    : context.courseLabel === 'ENF'
                      ? 'Enfermagem'
                      : 'Desenvolvimento de Sistemas'}{' '}
                  · {context.stage}
                  {subsequent ? 'º módulo' : 'ª série'} ·{' '}
                  {inspection.sheets[index].rows} linhas
                </p>
                <div className={styles.fields}>
                  <div className={styles.wide}>
                    <label htmlFor={`scope-${index}`}>Turma e ingresso</label>
                    <select
                      id={`scope-${index}`}
                      name={`scope-${index}`}
                      required
                      value={context.scopeId}
                      {...validation.field(`scope-${index}`)}
                      onChange={(e) => {
                        const source = inspection.sources.find(
                          (s) => s.scopeId === e.target.value,
                        );
                        updateContext(index, {
                          scopeId:
                            e.target.value === 'new'
                              ? crypto.randomUUID()
                              : e.target.value,
                          className: source?.className || '',
                          periodLabel:
                            source?.calendar?.modules.find(
                              (m) => m.number === context.stage,
                            )?.periodLabel ||
                            source?.periodLabel ||
                            '',
                          bindings: {},
                        });
                      }}
                    >
                      <option value="">Selecione após conferir</option>
                      {context.scopeId &&
                        !inspection.sources.some(
                          (s) => s.scopeId === context.scopeId,
                        ) && (
                          <option value={context.scopeId}>Nova turma</option>
                        )}
                      {inspection.sources
                        .filter((s) => s.courseLabel === context.courseLabel)
                        .map((s) => (
                          <option key={s.scopeId} value={s.scopeId}>
                            {s.label}
                          </option>
                        ))}
                      {!subsequent && (
                        <option value="new">Cadastrar nova turma</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`class-${index}`}>Nome da turma</label>
                    <input
                      id={`class-${index}`}
                      name={`class-${index}`}
                      required
                      maxLength={100}
                      value={context.className}
                      {...validation.field(`class-${index}`)}
                      onChange={(e) =>
                        updateContext(index, { className: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor={`period-${index}`}>Período letivo</label>
                    <input
                      id={`period-${index}`}
                      name={`period-${index}`}
                      required
                      maxLength={60}
                      placeholder={subsequent ? 'Ex.: 2026.2' : 'Ex.: 2026'}
                      value={context.periodLabel}
                      {...validation.field(`period-${index}`)}
                      onChange={(e) =>
                        updateContext(index, { periodLabel: e.target.value })
                      }
                    />
                  </div>
                </div>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    name={`checked-${index}`}
                    required
                    checked={context.confirmed}
                    {...validation.field(`checked-${index}`)}
                    onChange={(e) =>
                      setContexts((previous) =>
                        previous.map((c, i) =>
                          i === index
                            ? { ...c, confirmed: e.target.checked }
                            : c,
                        ),
                      )
                    }
                  />
                  Conferi turma, ingresso, curso,{' '}
                  {subsequent ? 'módulo' : 'série'} e período desta aba.
                </label>
              </fieldset>
            ))}
          </fieldset>
          <p>
            Confira a prévia antes de confirmar. Importar a lista não libera o
            acesso ao portal nem autoriza a emissão de declarações. Quem não
            aparecer na planilha não será excluído.
          </p>
          <div className={styles.actions}>
            <button className={button} disabled={!!busy || sessionExpired}>
              Gerar prévia
            </button>
            <button
              className={secondary}
              type="button"
              disabled={!!busy}
              onClick={() => openDialog('discard')}
            >
              Trocar arquivo
            </button>
          </div>
        </form>
      )}
      {preview && (
        <ImportPreview
          mode={mode}
          preview={preview}
          contexts={contexts}
          disabled={!!busy || sessionExpired}
          onBack={() => {
            setPreview(null);
            setError('');
          }}
          onBindMany={(choices) => {
            setContexts((previous) =>
              previous.map((context, index) => {
                const selected = choices.filter(
                  (choice) => choice.index === index,
                );
                return selected.length
                  ? {
                      ...context,
                      confirmed: false,
                      bindings: {
                        ...context.bindings,
                        ...Object.fromEntries(
                          selected.map((choice) => [
                            choice.registration,
                            choice.enrollmentId,
                          ]),
                        ),
                      },
                    }
                  : context;
              }),
            );
            setPreview(null);
            setError(
              'Matrículas escolhidas. Confira as turmas e gere outra prévia.',
            );
          }}
          onConfirm={() => openDialog('confirm')}
        />
      )}
      {result && (
        <div role="status" className={styles.result}>
          <h2>Importação concluída</h2>
          <p>
            {result.createdStudents} alunos incluídos ·{' '}
            {result.createdEnrollments} matrículas incluídas ·{' '}
            {result.updatedStudents} alunos atualizados ·{' '}
            {result.updatedEnrollments} matrículas atualizadas ·{' '}
            {result.unchanged} sem alteração.
          </p>
          <p>
            {result.absent} matrículas que não aparecem na lista foram mantidas.
            Confira novamente as matrículas alteradas antes de emitir
            declarações.
          </p>
          <button type="button" className={button} onClick={reset}>
            Importar outro arquivo
          </button>
        </div>
      )}
      <p className={styles.note}>
        Ambiente de teste. As senhas e os acessos existentes são mantidos. A
        importação não cria contas nem autoriza a emissão oficial.
      </p>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="import-dialog-title"
        onCancel={(e) => {
          if (busyRef.current) e.preventDefault();
          else setAction(null);
        }}
      >
        <h2 id="import-dialog-title">
          {action === 'confirm'
            ? 'Aplicar esta importação?'
            : 'Descartar esta conferência?'}
        </h2>
        {action === 'confirm' ? (
          <>
            <p>
              As {preview?.entries.length} linhas da prévia serão aplicadas nas
              abas conferidas. Ausências não excluem alunos e os dados de acesso
              serão preservados.
            </p>
            {!!preview?.counts.identityChanges && (
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={identityAccepted}
                  disabled={!!busy}
                  onChange={(e) => setIdentityAccepted(e.target.checked)}
                />
                Conferi as alterações de nome, nascimento ou filiação de{' '}
                {preview.counts.identityChanges}{' '}
                {preview.counts.identityChanges === 1
                  ? 'aluno existente'
                  : 'alunos existentes'}
                . Confira novamente as matrículas desses alunos antes de emitir
                declarações.
              </label>
            )}
            {calendarDiffers && (
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={calendarAccepted}
                  disabled={!!busy}
                  onChange={(e) => setCalendarAccepted(e.target.checked)}
                />
                Conferi as diferenças de módulo e período nos registros
                escolares. As matrículas com diferenças ficarão sem mudança
                automática de módulo.
              </label>
            )}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <div className={styles.actions}>
              <button
                ref={cancelButton}
                className={secondary}
                type="button"
                disabled={!!busy}
                onClick={() => setAction(null)}
              >
                Continuar conferindo
              </button>
              <button
                className={button}
                type="button"
                disabled={
                  !!busy ||
                  sessionExpired ||
                  (!!preview?.counts.identityChanges && !identityAccepted) ||
                  (calendarDiffers && !calendarAccepted)
                }
                onClick={apply}
              >
                Confirmar importação
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              O arquivo e a prévia serão retirados desta tela. Isso não desfaz
              uma importação já confirmada.
            </p>
            <div className={styles.actions}>
              <button
                ref={cancelButton}
                className={secondary}
                type="button"
                onClick={() => setAction(null)}
              >
                Continuar conferindo
              </button>
              <button
                className={button}
                type="button"
                onClick={() => {
                  const destination =
                    typeof action === 'object' ? action?.href : null;
                  dirtyRef.current = false;
                  reset();
                  if (destination) window.location.assign(destination);
                }}
              >
                Descartar conferência
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
