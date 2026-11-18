'use client';

import { useState, type FormEvent } from 'react';
import PasswordInput from './password-input';
import { useClientReady } from './use-client-ready';
import styles from './document-registry.module.css';

export function AccountEmailForm({ email }: { email: string }) {
  const ready = useClientReady();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [loginRequired, setLoginRequired] = useState(false);
  const [requested, setRequested] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;
    const form = event.currentTarget;
    const body = new FormData(form);
    setPending(true);
    setError('');
    setRequested(false);
    try {
      const response = await fetch('/api/conta/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(body)),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json();
      if (response.ok) {
        form.reset();
        setRequested(true);
      } else {
        setError(result.error ?? 'Não foi possível solicitar a troca.');
        setLoginRequired(response.status === 401);
      }
    } catch {
      setError(
        'Sem conexão. Confira se o link chegou antes de solicitar outro.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="change-email">
      <h2 id="change-email">Alterar e-mail</h2>
      <p className={styles.identity}>
        E-mail atual <strong>{email}</strong>
      </p>
      <p>Você continua usando o e-mail atual até confirmar o novo.</p>
      {error && (
        <div role="alert" className="document-notice">
          <p>{error}</p>
          {loginRequired && <a href="/login">Ir para o login</a>}
        </div>
      )}
      {requested && (
        <p role="status" className="document-notice">
          Se o endereço estiver disponível, enviaremos um link de confirmação.
          Confira também o spam.
        </p>
      )}
      <form method="post" onSubmit={submit}>
        <fieldset
          disabled={!ready || pending || loginRequired}
          className={styles.filters}
          style={{ border: 0, padding: 0, minWidth: 0 }}
        >
          <legend>Dados para a troca de e-mail</legend>
          <label className="declaration-field">
            Novo e-mail
            <input
              name="newEmail"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <div className="declaration-field">
            <label htmlFor="email-change-password">Senha atual</label>
            <PasswordInput
              id="email-change-password"
              name="currentPassword"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </div>
          <div className={styles.actions}>
            <button type="submit" className="ete-button">
              {pending ? 'Solicitando…' : 'Enviar link de confirmação'}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
