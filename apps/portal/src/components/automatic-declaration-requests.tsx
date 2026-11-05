'use client';
import { newRequestKey as newKey } from '@/lib/request-key';
import { useEffect, useRef, useState } from 'react';
import BirthplaceDialog, {
  type BirthplaceSummary,
  type DeclaredBirthplace,
} from './birthplace-dialog';
import { downloadDeclaration } from './declaration-download';
import {
  requestDate,
  requestStatusLabels,
  isRequestSummary,
  type RequestSummary,
} from '@/lib/declaration-request-types';

type Props = {
  enrollmentId: string | null;
  initialRequests: RequestSummary[];
  birthplace: BirthplaceSummary | null;
  issuanceBlocked?: boolean;
};

const failure = (value: { error?: unknown }, fallback: string) =>
  typeof value.error === 'string' ? value.error : fallback;

export default function AutomaticDeclarationRequests({
  enrollmentId,
  initialRequests,
  birthplace,
  issuanceBlocked = false,
}: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const lock = useRef(false);
  const pendingKey = useRef<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    },
    [],
  );

  async function perform(
    action: 'request' | 'refresh',
    birthplace?: DeclaredBirthplace,
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(action);
    setMessage('');
    setFailed(false);
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      if (action === 'request') pendingKey.current ??= newKey();
      const response = await fetch('/api/declaracao/solicitacoes', {
        method: action === 'request' ? 'POST' : 'GET',
        cache: 'no-store',
        signal: controller.signal,
        ...(action === 'request'
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                enrollmentId,
                requestKey: pendingKey.current,
                ...(birthplace ? { birthplace } : {}),
              }),
            }
          : {}),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          failure(result, 'Não foi possível concluir. Tente novamente.'),
        );
      if (action === 'request') {
        if (
          !isRequestSummary(result.request) ||
          result.request.status !== 'AVAILABLE'
        )
          throw new Error(
            'Não foi possível confirmar a emissão. Tente novamente.',
          );
        pendingKey.current = null;
        setRequests((previous) =>
          [
            result.request,
            ...previous
              .filter((row) => row.id !== result.request.id)
              .map((row) =>
                result.created === true &&
                result.request.document?.state === 'ISSUED' &&
                row.enrollmentId === result.request.enrollmentId &&
                row.document?.state === 'ISSUED'
                  ? {
                      ...row,
                      document: { ...row.document, state: 'SUPERSEDED' },
                    }
                  : row,
              ),
          ]
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
            .slice(0, 20),
        );
        setMessage(
          result.created
            ? 'Declaração disponível. Use Abrir ou Baixar no pedido abaixo.'
            : 'Esta tentativa já foi concluída. Confira a situação dos documentos abaixo.',
        );
      } else {
        if (
          !Array.isArray(result.requests) ||
          result.requests.length > 20 ||
          !result.requests.every(isRequestSummary)
        )
          throw new Error('Não foi possível atualizar. Tente novamente.');
        setRequests(result.requests);
        setMessage('Lista atualizada.');
      }
      return true;
    } catch (error) {
      if (activeRequest.current === controller) {
        setFailed(true);
        setMessage(
          error instanceof Error && error.name === 'Error'
            ? error.message
            : 'Não foi possível confirmar a resposta. Atualize a lista ou tente novamente; repetir a tentativa não duplica o pedido.',
        );
      }
      return false;
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        lock.current = false;
        setBusy('');
      }
    }
  }

  async function file(row: RequestSummary, download: boolean) {
    if (lock.current || !row.document) return;
    const popup = download ? null : window.open('', '_blank');
    if (!download && !popup) {
      setFailed(true);
      setMessage('Permita abrir uma nova aba no navegador ou use Baixar.');
      return;
    }
    if (popup) {
      popup.opener = null;
      popup.document.title = 'Abrindo declaração';
      popup.document.body.textContent = 'Carregando declaração…';
    }
    lock.current = true;
    setBusy((download ? 'download:' : 'open:') + row.id);
    setMessage('');
    setFailed(false);
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/declaracao/arquivo', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: row.document.id, download }),
      });
      if (!response.ok)
        throw new Error(
          failure(
            await response.json(),
            'Não foi possível abrir a declaração.',
          ),
        );
      if (response.headers.get('content-type') !== 'application/pdf')
        throw new Error(
          'Arquivo indisponível. Atualize a lista e tente novamente.',
        );
      if (download)
        await downloadDeclaration(response, 'declaracao-vinculo-teste.pdf');
      else {
        const url = URL.createObjectURL(await response.blob());
        if (!popup || popup.closed) {
          URL.revokeObjectURL(url);
          throw new Error('A aba foi fechada. Tente abrir novamente.');
        }
        popup.location.replace(url);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      setMessage(
        download ? 'Download iniciado.' : 'Declaração aberta em outra aba.',
      );
    } catch (error) {
      popup?.close();
      setFailed(true);
      setMessage(
        error instanceof Error && error.name === 'Error'
          ? error.message
          : 'Não foi possível abrir. Tente novamente.',
      );
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        lock.current = false;
        setBusy('');
      }
    }
  }

  return (
    <div className="student-requests">
      {issuanceBlocked && (
        <p className="document-notice">
          A emissão de novas declarações está bloqueada. Procure a secretaria.
          Você pode abrir e baixar os documentos anteriores.
        </p>
      )}
      <div className="request-callout">
        <div>
          <h2>Precisa de uma declaração?</h2>
          <p>
            Confira seu local de nascimento. O documento ficará disponível aqui,
            sem esperar atendimento.
          </p>
        </div>
        <button
          className="ete-button"
          type="button"
          disabled={!!busy || !enrollmentId || issuanceBlocked}
          aria-busy={busy === 'request'}
          onClick={() => {
            setFailed(false);
            setMessage('');
            setOpen(true);
          }}
        >
          Gerar declaração
        </button>
      </div>
      <p
        className={`declaration-feedback ${failed ? 'request-error' : ''}`}
        role={failed ? 'alert' : 'status'}
        aria-live="polite"
      >
        {open ? '' : message}
      </p>
      <section
        className="request-history"
        aria-labelledby="request-history-title"
      >
        <div className="request-section-heading">
          <div>
            <h2 id="request-history-title">Minhas declarações</h2>
            <p>
              Últimos 20 pedidos. Uma nova emissão substitui a anterior da mesma
              matrícula.
            </p>
          </div>
          <button
            className="ete-button ete-button--secondary ete-button--compact"
            disabled={!!busy}
            type="button"
            onClick={() => perform('refresh')}
          >
            {busy === 'refresh' ? 'Atualizando…' : 'Atualizar lista'}
          </button>
        </div>
        {!requests.length ? (
          <div className="request-empty">
            <strong>Nenhuma declaração ainda</strong>
            <p>Use Gerar declaração para começar.</p>
          </div>
        ) : (
          <ol className="request-list">
            {requests.map((row) => (
              <li className="request-row" key={row.id}>
                <div className="request-row-copy">
                  <span
                    className={`request-status request-status--${row.document?.state === 'CANCELLED' ? 'cancelled' : row.document?.state === 'SUPERSEDED' ? 'superseded' : row.status.toLowerCase()}`}
                  >
                    {row.document?.state === 'CANCELLED'
                      ? 'Cancelada'
                      : row.document?.state === 'SUPERSEDED'
                        ? 'Substituída'
                        : requestStatusLabels[row.status]}
                  </span>
                  <h3>Declaração de vínculo</h3>
                  <p>
                    {row.className} · solicitada em {requestDate(row.createdAt)}
                  </p>
                  {row.document ? (
                    <p>
                      {row.document.state === 'ISSUED'
                        ? 'Documento disponível para abrir ou baixar.'
                        : 'Este documento não é mais válido. O arquivo permanece no seu histórico.'}
                    </p>
                  ) : (
                    <p>
                      Pedido do atendimento anterior, preservado no histórico.
                    </p>
                  )}
                </div>
                {row.document && (
                  <div className="request-row-actions">
                    <button
                      className="ete-button ete-button--secondary ete-button--compact"
                      disabled={!!busy}
                      type="button"
                      onClick={() => file(row, false)}
                    >
                      {busy === 'open:' + row.id ? 'Abrindo…' : 'Abrir'}
                    </button>
                    <button
                      className="ete-button ete-button--compact"
                      disabled={!!busy}
                      type="button"
                      onClick={() => file(row, true)}
                    >
                      {busy === 'download:' + row.id ? 'Baixando…' : 'Baixar'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      <BirthplaceDialog
        automatic
        open={open}
        busy={busy === 'request'}
        error={failed ? message : ''}
        initial={birthplace}
        onClose={() => {
          if (!lock.current) setOpen(false);
        }}
        onConfirm={(place) => perform('request', place)}
      />
    </div>
  );
}
