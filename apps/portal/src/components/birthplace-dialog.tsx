'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { brazilStates, type MunicipalityOption } from '@/lib/brazil-states';
import { useFormValidation } from './use-form-validation';

export type BirthplaceSummary = {
  city: string;
  state: string | null;
  country: string;
  source: string;
};
export type DeclaredBirthplace = { state: string; municipalityId: string };
type Props = {
  open: boolean;
  busy: boolean;
  error: string;
  initial: BirthplaceSummary | null;
  onClose: () => void;
  onConfirm: (place?: DeclaredBirthplace) => Promise<boolean>;
  automatic?: boolean;
};
const searchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');

export default function BirthplaceDialog({
  open,
  busy,
  error,
  initial,
  onClose,
  onConfirm,
  automatic = false,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLSelectElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const cache = useRef(new Map<string, MunicipalityOption[]>());
  const fixed =
    !!initial &&
    (initial.source !== 'STUDENT_DECLARATION' || initial.country !== 'BR');
  const [state, setState] = useState(initial?.state ?? '');
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const [cities, setCities] = useState<MunicipalityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const validation = useFormValidation('birthplace-error');
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      previousFocus.current = document.activeElement as HTMLElement;
      element.showModal();
      first.current?.focus();
    } else if (!open && element.open) {
      element.close();
      previousFocus.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (!open || fixed || !state) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    setCities([]);
    const timeout = setTimeout(() => {
      if (!controller.signal.aborted) {
        setLoadError('O carregamento demorou. Tente novamente.');
        setLoading(false);
        controller.abort();
      }
    }, 10_000);
    async function load() {
      try {
        let rows = cache.current.get(state);
        if (!rows) {
          const response = await fetch(
            `/api/localidades?uf=${encodeURIComponent(state)}`,
            { signal: controller.signal, cache: 'no-store' },
          );
          const result = await response.json();
          if (!response.ok)
            throw new Error(
              result.error || 'Não foi possível carregar os municípios.',
            );
          rows = result.cities;
          if (!Array.isArray(rows))
            throw new Error('Tente carregar os municípios novamente.');
          cache.current.set(state, rows);
        }
        if (!controller.signal.aborted) {
          setCities(rows);
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setLoadError(
            reason instanceof Error
              ? reason.message
              : 'Tente carregar os municípios novamente.',
          );
      } finally {
        clearTimeout(timeout);
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [open, state, fixed, revision]);
  const options = useMemo(
    () =>
      cities.filter((row) => searchText(row.name).includes(searchText(query))),
    [cities, query],
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || !validation.validate(event.currentTarget)) return;
    if (await onConfirm(fixed ? undefined : { state, municipalityId: city }))
      onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="registration-dialog birthplace-dialog"
      aria-labelledby="birthplace-title"
      aria-describedby="birthplace-help"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-inner">
        <h2 id="birthplace-title">Onde você nasceu?</h2>
        <p id="birthplace-help">
          Confira o local de nascimento para preencher sua declaração. É o local
          onde você nasceu, mesmo que more em outra cidade.
        </p>
        {automatic && (
          <p>
            Uma nova declaração substitui a anterior desta matrícula. Você
            poderá abrir ou baixar o PDF aqui.
          </p>
        )}
        <form noValidate onSubmit={submit}>
          <fieldset disabled={busy}>
            {fixed ? (
              <p>
                O cadastro da escola informa{' '}
                <strong>
                  {initial.city}
                  {initial.state
                    ? `/${initial.state}`
                    : ` (${initial.country})`}
                </strong>
                . Para corrigir essa informação, procure a secretaria.
              </p>
            ) : (
              <>
                <label htmlFor="birth-state">Estado de nascimento (UF)</label>
                <select
                  ref={first}
                  id="birth-state"
                  name="state"
                  value={state}
                  required
                  {...validation.field('state')}
                  onChange={(event) => {
                    setState(event.target.value);
                    setCity('');
                    setQuery('');
                    setCities([]);
                    validation.reset();
                  }}
                >
                  <option value="">Selecione o estado</option>
                  {brazilStates.map((row) => (
                    <option key={row.code} value={row.code}>
                      {row.name} ({row.code})
                    </option>
                  ))}
                </select>
                <label htmlFor="birth-city-search">Pesquisar município</label>
                <div className="birthplace-search">
                  <input
                    ref={search}
                    id="birth-city-search"
                    type="search"
                    maxLength={120}
                    value={query}
                    disabled={!state || loading}
                    placeholder="Ex.: Recife"
                    autoComplete="off"
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setCity('');
                    }}
                  />
                  {query && (
                    <button
                      type="button"
                      className="ete-button ete-button--quiet ete-button--compact"
                      onClick={() => {
                        setQuery('');
                        search.current?.focus();
                      }}
                      aria-label="Limpar pesquisa de município"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <label htmlFor="birth-city">Município de nascimento</label>
                <select
                  id="birth-city"
                  name="municipalityId"
                  size={5}
                  required
                  value={city}
                  disabled={!state || loading || !!loadError}
                  {...validation.field('municipalityId')}
                  onChange={(event) => setCity(event.target.value)}
                >
                  <option value="">
                    {!state
                      ? 'Escolha o estado primeiro'
                      : loading
                        ? 'Carregando municípios…'
                        : 'Selecione o município'}
                  </option>
                  {options.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                {!loading && state && !loadError && options.length === 0 && (
                  <p role="status">
                    Nenhum município encontrado. Confira o nome ou limpe a
                    pesquisa.
                  </p>
                )}
                {loading && <p role="status">Carregando municípios…</p>}
                {loadError && (
                  <div role="alert">
                    <p>{loadError}</p>
                    <button
                      type="button"
                      className="ete-button ete-button--secondary ete-button--compact"
                      onClick={() => setRevision((value) => value + 1)}
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}
                <p>
                  Nasceu fora do Brasil ou não encontrou seu município? Peça à
                  secretaria para conferir seu cadastro.
                </p>
              </>
            )}
            <label className="declaration-reviewed">
              <input
                name="confirmed"
                type="checkbox"
                required
                {...validation.field('confirmed')}
              />{' '}
              Confirmo que este é meu local de nascimento.
            </label>
          </fieldset>
          <p
            id="birthplace-error"
            role="alert"
            className="declaration-feedback request-error"
          >
            {validation.error || error}
          </p>
          <div className="declaration-actions">
            <button
              type="button"
              className="ete-button ete-button--secondary"
              disabled={busy}
              onClick={onClose}
            >
              Voltar
            </button>
            <button
              type="submit"
              className="ete-button"
              disabled={
                busy ||
                loading ||
                (!fixed && (!state || !city || !!loadError)) ||
                !validation.ready
              }
              aria-busy={busy}
            >
              {busy
                ? automatic
                  ? 'Gerando declaração…'
                  : 'Enviando solicitação…'
                : automatic
                  ? 'Gerar declaração'
                  : 'Enviar solicitação'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
