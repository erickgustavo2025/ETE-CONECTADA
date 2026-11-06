'use client';
import { useRef, useState } from 'react';
import AutomaticDeclarationRequests from './automatic-declaration-requests';
import BirthplaceDialog, {
  type BirthplaceSummary,
  type DeclaredBirthplace,
} from './birthplace-dialog';
import {
  requestDate,
  requestStatusLabels,
  type RequestSummary,
} from '@/lib/declaration-request-types';

type Props = {
  enrollmentId: string | null;
  initialRequests: RequestSummary[];
  birthplace: BirthplaceSummary | null;
  automatic?: boolean;
  issuanceBlocked?: boolean;
};
export default function StudentDeclarationRequests(props: Props) {
  return props.automatic ? (
    <AutomaticDeclarationRequests {...props} />
  ) : (
    <LegacyDeclarationRequests {...props} />
  );
}
function LegacyDeclarationRequests({
  enrollmentId,
  initialRequests,
  birthplace,
  issuanceBlocked = false,
}: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState<'request' | 'refresh' | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const lock = useRef(false);
  const active = requests.find(
    (row) =>
      row.enrollmentId === enrollmentId &&
      ['REQUESTED', 'IN_PREPARATION'].includes(row.status),
  );
  async function perform(
    action: 'request' | 'refresh',
    location?: DeclaredBirthplace,
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(action);
    setMessage('');
    setFailed(false);
    try {
      if (action === 'request') {
        const response = await fetch('/api/declaracao/solicitacoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enrollmentId,
            ...(location ? { birthplace: location } : {}),
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || 'Não foi possível enviar a solicitação.',
          );
        setRequests((previous) =>
          [
            result.request,
            ...previous.filter((row) => row.id !== result.request.id),
          ].slice(0, 20),
        );
        setMessage(
          result.created
            ? 'Solicitação enviada. Acompanhe o atendimento abaixo.'
            : 'Você já tem uma solicitação em atendimento. Acompanhe o status abaixo.',
        );
      } else {
        const response = await fetch('/api/declaracao/solicitacoes', {
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || 'Não foi possível atualizar o atendimento.',
          );
        setRequests(result.requests);
        setMessage('Status atualizado.');
      }
      return true;
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir. Tente novamente.',
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  return (
    <div className="student-requests">
      {issuanceBlocked && (
        <p className="document-notice">
          A emissão de novas declarações está bloqueada. Procure a secretaria.
          Seus pedidos anteriores foram preservados.
        </p>
      )}
      <div className="request-callout">
        <div>
          <h2>Precisa de uma declaração?</h2>
          <p>
            {active
              ? 'Sua solicitação já está com a escola. Acompanhe o andamento abaixo.'
              : 'Envie o pedido. A escola prepara, imprime e avisa aqui quando você puder buscar.'}
          </p>
        </div>
        <button
          className="ete-button"
          type="button"
          disabled={!!busy || !!active || !enrollmentId || issuanceBlocked}
          aria-busy={busy === 'request'}
          onClick={() => {
            setMessage('');
            setFailed(false);
            setRequestOpen(true);
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h5" />
          </svg>
          {busy === 'request'
            ? 'Solicitação em envio'
            : active
              ? 'Solicitação em atendimento'
              : 'Solicitar declaração'}
        </button>
      </div>
      <p
        className={`declaration-feedback ${failed ? 'request-error' : ''}`}
        role={failed ? 'alert' : 'status'}
        aria-live="polite"
      >
        {requestOpen ? '' : message}
      </p>
      <section
        className="request-history"
        aria-labelledby="request-history-title"
      >
        <div className="request-section-heading">
          <div>
            <h2 id="request-history-title">Minhas solicitações</h2>
            <p>Últimos 20 pedidos · consulte aqui o aviso de retirada.</p>
          </div>
          <button
            className="ete-button ete-button--secondary ete-button--compact"
            type="button"
            disabled={!!busy}
            aria-busy={busy === 'refresh'}
            onClick={() => perform('refresh')}
          >
            {busy === 'refresh' ? 'Atualizando…' : 'Atualizar status'}
          </button>
        </div>
        {!requests.length ? (
          <div className="request-empty">
            <strong>Nenhuma solicitação ainda</strong>
            <p>Depois de enviar um pedido, o andamento aparece aqui.</p>
          </div>
        ) : (
          <ol className="request-list">
            {requests.map((row) => (
              <li key={row.id} className="request-row">
                <div className="request-row-copy">
                  <span
                    className={`request-status request-status--${row.status.toLowerCase()}`}
                  >
                    {row.status === 'AVAILABLE'
                      ? 'Documento gerado pelo portal'
                      : requestStatusLabels[row.status]}
                  </span>
                  <h3>Declaração de vínculo</h3>
                  <p>
                    {row.className} · solicitada em {requestDate(row.createdAt)}
                  </p>
                  {row.status === 'AVAILABLE' ? (
                    <p>
                      Emissão registrada no histórico. A disponibilidade do
                      arquivo depende do serviço de documentos da escola.
                    </p>
                  ) : row.status === 'READY_FOR_PICKUP' ? (
                    <p className="request-pickup">
                      <strong>
                        Você já pode buscar na secretaria da escola.
                      </strong>
                      {row.readyAt && (
                        <span> Liberada em {requestDate(row.readyAt)}.</span>
                      )}
                    </p>
                  ) : (
                    <p>
                      {row.status === 'IN_PREPARATION'
                        ? 'O documento está sendo preparado. Aguarde o aviso de retirada.'
                        : 'A escola recebeu seu pedido e ainda vai preparar o documento.'}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <BirthplaceDialog
        open={requestOpen}
        busy={busy === 'request'}
        error={failed ? message : ''}
        initial={birthplace}
        onClose={() => {
          if (!lock.current) setRequestOpen(false);
        }}
        onConfirm={(location) => perform('request', location)}
      />
    </div>
  );
}
