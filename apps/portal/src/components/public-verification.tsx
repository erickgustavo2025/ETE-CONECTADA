'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import {
  isPublicVerification,
  type PublicVerification,
} from '@/lib/public-verification-types';
import { useFormValidation } from './use-form-validation';
import styles from './public-verification.module.css';

type Phase = 'loading' | 'ready' | 'not-found' | 'unavailable' | 'limited';
const labels = {
  VALID: 'Declaração válida',
  CANCELLED: 'Declaração cancelada',
  SUPERSEDED: 'Declaração substituída',
};
const date = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Recife',
  }).format(new Date(value));

export default function PublicVerificationPage({ code }: { code: string }) {
  const [data, setData] = useState<PublicVerification | null>(null),
    [phase, setPhase] = useState<Phase>('loading');
  const [fullName, setFullName] = useState(''),
    [fileMessage, setFileMessage] = useState(''),
    [hashing, setHashing] = useState(false);
  const controller = useRef<AbortController | null>(null),
    fileSequence = useRef(0),
    mounted = useRef(true),
    fileInput = useRef<HTMLInputElement>(null),
    nameInput = useRef<HTMLInputElement>(null);
  const validation = useFormValidation('verification-name-error');
  const load = useCallback(
    async (name?: string) => {
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      fileSequence.current++;
      setFileMessage('');
      setHashing(false);
      if (fileInput.current) fileInput.current.value = '';
      setPhase('loading');
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        request.abort();
      }, 15000);
      try {
        const response = await fetch('/api/documentos/verificacao', {
          method: 'POST',
          cache: 'no-store',
          signal: request.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            ...(name !== undefined ? { fullName: name } : {}),
          }),
        });
        if (controller.current !== request) return;
        if (response.status === 404) {
          setData(null);
          setPhase('not-found');
          return;
        }
        if (response.status === 429) {
          setPhase('limited');
          return;
        }
        if (!response.ok) throw new Error('Consulta indisponível.');
        const result: unknown = await response.json();
        if (controller.current !== request) return;
        if (!isPublicVerification(result) || result.code !== code)
          throw new Error('Resposta de consulta incompleta.');
        setData(
          name !== undefined && nameInput.current?.value !== name
            ? { ...result, nameMatches: null }
            : result,
        );
        setPhase('ready');
      } catch {
        if (
          controller.current === request &&
          (!request.signal.aborted || timedOut)
        )
          setPhase('unavailable');
      } finally {
        clearTimeout(timer);
        if (controller.current === request) controller.current = null;
      }
    },
    [code],
  );
  useEffect(() => {
    mounted.current = true;
    void load();
    const visible = () => {
      if (document.visibilityState === 'visible' && !controller.current)
        void load();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) void load();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', restored);
    return () => {
      controller.current?.abort();
      controller.current = null;
      mounted.current = false;
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', restored);
    };
  }, [load]);
  function confirmName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !validation.ready ||
      phase === 'loading' ||
      !validation.validate(event.currentTarget)
    )
      return;
    const name = String(
      new FormData(event.currentTarget).get('fullName') ?? '',
    );
    if (
      name.trim().length < 2 ||
      name.length > 180 ||
      Array.from(name).some(
        (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
      )
    ) {
      validation.reject(
        'fullName',
        'Informe o nome completo como aparece na declaração.',
        event.currentTarget,
      );
      return;
    }
    void load(name);
  }
  async function compareFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0],
      current = data,
      sequence = ++fileSequence.current;
    setFileMessage('');
    setHashing(false);
    if (!file || !current || phase !== 'ready') return;
    if (!file.size || file.size > 16 * 1024 * 1024) {
      setFileMessage('Selecione um PDF de até 16 MB.');
      return;
    }
    if (!globalThis.crypto?.subtle) {
      setFileMessage(
        'A comparação não está disponível neste endereço. Use o endereço oficial da escola ou procure a secretaria.',
      );
      return;
    }
    setHashing(true);
    try {
      if (
        new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !==
        '%PDF-'
      )
        throw new Error('Formato inválido.');
      const bytes = await file.arrayBuffer();
      if (!mounted.current || sequence !== fileSequence.current) return;
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      if (!mounted.current || sequence !== fileSequence.current) return;
      const hash = Array.from(new Uint8Array(digest), (v) =>
        v.toString(16).padStart(2, '0'),
      ).join('');
      setFileMessage(
        hash === current.pdfSha256
          ? 'O arquivo é igual ao PDF original deste registro.'
          : 'O arquivo é diferente do PDF original deste registro.',
      );
    } catch {
      if (mounted.current && sequence === fileSequence.current)
        setFileMessage(
          'Não foi possível comparar. Selecione um arquivo PDF válido.',
        );
    } finally {
      if (mounted.current && sequence === fileSequence.current)
        setHashing(false);
    }
  }
  const ready = phase === 'ready' && data;
  return (
    <main id="conteudo" tabIndex={-1} className={styles.page}>
      <section className={styles.panel} aria-busy={phase === 'loading'}>
        <h1>Verificar declaração</h1>
        <p className={styles.lead}>
          Confira se o documento consta no registro da escola e qual é a
          situação atual.
        </p>
        {data?.testOnly && (
          <aside className={styles.notice}>
            <strong>Arquivo de demonstração</strong>
            <p>
              Este arquivo foi gerado antes do uso escolar e não é uma
              declaração escolar válida.
            </p>
          </aside>
        )}
        <div
          className={styles.status}
          aria-live="polite"
          data-state={ready ? data.state : phase}
        >
          {phase === 'loading' ? (
            <h2>Consultando o registro…</h2>
          ) : ready ? (
            <>
              <h2>
                {data.testOnly && data.state === 'VALID'
                  ? 'Arquivo de demonstração registrado'
                  : labels[data.state]}
              </h2>
              <p>
                {data.state === 'VALID'
                  ? 'Nenhum cancelamento ou substituição registrado.'
                  : data.state === 'CANCELLED'
                    ? 'O registro foi cancelado. Não use esta declaração como vigente.'
                    : 'Uma nova emissão substituiu esta declaração. Não use a versão anterior como vigente.'}
              </p>
              <p>Consultado em {date(data.checkedAt)} (horário de Recife).</p>
            </>
          ) : phase === 'not-found' ? (
            <>
              <h2>Código não encontrado</h2>
              <p>Confira o endereço e o código impresso no documento.</p>
            </>
          ) : (
            <>
              <h2>
                {phase === 'limited'
                  ? 'Muitas consultas neste momento'
                  : 'Consulta indisponível'}
              </h2>
              <p>
                {phase === 'limited'
                  ? 'Aguarde alguns minutos e tente novamente.'
                  : 'Não foi possível consultar agora. Isso não significa que a declaração é inválida.'}
              </p>
            </>
          )}
        </div>
        <button
          className="ete-button ete-button--secondary"
          disabled={!validation.ready || phase === 'loading'}
          onClick={() => void load()}
        >
          {phase === 'loading' ? 'Consultando…' : 'Atualizar consulta'}
        </button>
        {data && phase !== 'not-found' && (
          <>
            <section className={styles.section} aria-label="Dados do registro">
              <h2>Dados do registro</h2>
              <dl className={styles.details}>
                {Object.entries({
                  'Nome parcialmente oculto': data.document.nameMasked,
                  'Escola emissora': data.document.issuer,
                  Documento: data.document.type,
                  'Emitido em': date(data.document.issuedAt),
                  Curso: data.document.course,
                  Modalidade: data.document.mode,
                  'Série ou módulo': data.document.level,
                  'Período letivo': data.document.period,
                }).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Código do documento:{' '}
                <span className={styles.code}>{data.code}</span>
              </p>
            </section>
            <section className={styles.section}>
              <h2>Conferir o nome</h2>
              <p>
                Digite o nome completo como aparece na declaração. A consulta
                informa somente se ele corresponde ao registro.
              </p>
              <form
                className="auth-form"
                method="post"
                noValidate
                onSubmit={confirmName}
              >
                <label htmlFor="verification-name">
                  Nome completo na declaração
                </label>
                <input
                  ref={nameInput}
                  id="verification-name"
                  name="fullName"
                  required
                  minLength={2}
                  maxLength={180}
                  autoComplete="off"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (data.nameMatches !== null)
                      setData({ ...data, nameMatches: null });
                  }}
                  {...validation.field('fullName')}
                />
                <p role="alert" id="verification-name-error">
                  {validation.error}
                </p>
                <button
                  className="ete-button ete-button--primary"
                  type="submit"
                  disabled={!validation.ready || phase === 'loading'}
                >
                  Conferir nome
                </button>
                <p role="status">
                  {phase === 'loading'
                    ? 'Consultando o registro…'
                    : phase === 'unavailable'
                      ? 'Não foi possível conferir agora. Tente novamente.'
                      : phase === 'limited'
                        ? 'Aguarde alguns minutos antes de conferir novamente.'
                        : ready && data.nameMatches !== null
                          ? data.nameMatches
                            ? 'O nome confere com o registro.'
                            : 'O nome não confere. Confira como está escrito no documento.'
                          : ' '}
                </p>
              </form>
            </section>
            <section className={styles.section}>
              <h2>Conferir o arquivo PDF</h2>
              <p>
                Copiar um QR não comprova todo o conteúdo. Compare o PDF com o
                original guardado pela escola. Seu arquivo fica neste aparelho e
                não é enviado.
              </p>
              <div className="auth-form">
                <label htmlFor="verification-file">
                  Selecione o PDF para comparar (opcional)
                </label>
                <input
                  ref={fileInput}
                  id="verification-file"
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={!validation.ready || phase !== 'ready' || hashing}
                  onChange={compareFile}
                />
              </div>
              <p role="status" aria-live="polite">
                {hashing ? 'Comparando o arquivo neste aparelho…' : fileMessage}
              </p>
              {ready && data.state !== 'VALID' && (
                <p>
                  Mesmo que o arquivo seja o original, a situação acima continua
                  valendo.
                </p>
              )}
            </section>
          </>
        )}
        <p className={styles.note}>
          A consulta confirma o registro e sua situação. Para uma versão
          impressa, confira também os dados apresentados no documento. Ela não
          confere uma assinatura.
        </p>
        <noscript>
          Ative o JavaScript para consultar o registro ou procure a secretaria
          da escola.
        </noscript>
      </section>
    </main>
  );
}
