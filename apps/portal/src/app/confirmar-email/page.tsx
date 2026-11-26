'use client';

import Link from 'next/link';
import PortalFrame from '@/components/portal-frame';
import UiIcon from '@/components/ui-icon';
import { useClientReady } from '@/components/use-client-ready';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function Confirmation() {
  const ready = useClientReady();
  const token = useSearchParams().get('token');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  async function confirm() {
    if (!token) {
      setMessage('Link inválido.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/registration/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Não foi possível confirmar o e-mail.');
      setDone(true);
      setMessage('E-mail confirmado. Sua conta está ativa.');
      window.history.replaceState(null, '', '/confirmar-email');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível confirmar o e-mail.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalFrame>
      <main id="conteudo" tabIndex={-1} className="confirmation-page">
        <section className="confirmation-card">
          <span className="confirmation-symbol">
            <UiIcon />
          </span>
          <span className="eyebrow">ETE CONECTADA</span>
          <h1>Confirme seu e-mail</h1>
          <p>Confirme o endereço para concluir a criação da conta no portal.</p>
          {!done && (
            <button
              className="ete-button"
              type="button"
              onClick={confirm}
              disabled={!ready || busy || !token}
            >
              {busy ? 'Confirmando…' : 'Confirmar e-mail'}
            </button>
          )}
          {message && (
            <p role="status" className="registration-result">
              {message}
            </p>
          )}
          <Link href="/login">Ir para login</Link>
        </section>
      </main>
    </PortalFrame>
  );
}

export default function ConfirmarEmailPage() {
  return (
    <Suspense
      fallback={
        <main id="conteudo" tabIndex={-1} className="confirmation-page">
          Carregando…
        </main>
      }
    >
      <Confirmation />
    </Suspense>
  );
}
