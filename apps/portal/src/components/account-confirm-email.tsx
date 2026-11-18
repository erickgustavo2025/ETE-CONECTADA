'use client';

import { useEffect, useRef, useState } from 'react';
import { validResetToken } from '@/lib/password-reset-input';

export function AccountConfirmEmail({ signedIn }: { signedIn: boolean }) {
  const seen = useRef(false);
  const linkVersion = useRef(0);
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loginRequired, setLoginRequired] = useState(false);

  useEffect(() => {
    function readLink() {
      const fragment = window.location.hash;
      if (!fragment && seen.current) return;
      seen.current = true;
      linkVersion.current++;
      setPending(false);
      setError('');
      const params = new URLSearchParams(
        fragment.length <= 100 ? fragment.slice(1) : '',
      );
      const value = params.get('token');
      setToken(params.size === 1 && validResetToken(value) ? value : '');
      window.history.replaceState(null, '', '/confirmar-novo-email');
    }
    readLink();
    window.addEventListener('hashchange', readLink);
    return () => window.removeEventListener('hashchange', readLink);
  }, []);

  async function confirm() {
    if (!token || pending || !signedIn) return;
    const version = linkVersion.current;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/conta/email/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json();
      if (version !== linkVersion.current) return;
      if (response.ok) {
        setToken('');
        setDone(true);
      } else {
        setError(result.error ?? 'Não foi possível confirmar o novo e-mail.');
        setLoginRequired(response.status === 401);
      }
    } catch {
      if (version !== linkVersion.current) return;
      setError(
        'Sem conexão. Se a troca foi concluída, entre com o e-mail novo.',
      );
    } finally {
      if (version === linkVersion.current) setPending(false);
    }
  }

  if (done)
    return (
      <div role="status" className="document-notice">
        <p>E-mail alterado. Entre novamente com o e-mail novo.</p>
        <a className="ete-button" href="/login">
          Ir para o login
        </a>
      </div>
    );
  if (token === null) return <p role="status">Conferindo link…</p>;
  if (!token)
    return (
      <p role="status">Este link é inválido. Solicite outro em Minha conta.</p>
    );
  if (!signedIn || loginRequired)
    return (
      <>
        <p>
          Entre com o e-mail atual da sua conta e depois abra novamente o link
          recebido.
        </p>
        <a className="ete-button" href="/login">
          Ir para o login
        </a>
      </>
    );

  return (
    <>
      <p>Ao confirmar, você precisará entrar de novo com o e-mail novo.</p>
      {error && (
        <p role="alert" className="document-notice">
          {error}
        </p>
      )}
      <button
        type="button"
        className="ete-button"
        disabled={pending}
        onClick={confirm}
      >
        {pending ? 'Confirmando…' : 'Confirmar novo e-mail'}
      </button>
    </>
  );
}
