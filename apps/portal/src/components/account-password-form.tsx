'use client';

import { useState, type FormEvent } from 'react';
import PasswordInput from './password-input';
import { useClientReady } from './use-client-ready';
import styles from './document-registry.module.css';

export function AccountPasswordForm() {
  const ready = useClientReady();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [loginRequired, setLoginRequired] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !ready) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/conta/senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const body = await response.json();
      if (response.ok) setDone(true);
      else {
        setError(body.error ?? 'Não foi possível alterar a senha.');
        setLoginRequired(response.status === 401);
      }
    } catch {
      setError(
        'Sem conexão. Se a senha já mudou, tente entrar com a senha nova.',
      );
    } finally {
      setPending(false);
    }
  }

  if (done)
    return (
      <div className="document-notice" role="status">
        <p>Senha alterada. Entre novamente com a senha nova.</p>
        <a className="ete-button" href="/login">
          Ir para o login
        </a>
      </div>
    );

  return (
    <section aria-labelledby="change-password">
      <h2 id="change-password">Alterar senha</h2>
      <p>
        Ao salvar a nova senha, você precisará entrar de novo em todos os
        dispositivos.
      </p>
      {error && (
        <div role="alert" className="document-notice">
          <p>{error}</p>
          {loginRequired && <a href="/login">Ir para o login</a>}
        </div>
      )}
      <form method="post" onSubmit={submit}>
        <fieldset
          disabled={!ready || pending || loginRequired}
          className={styles.filters}
          style={{ border: 0, padding: 0, minWidth: 0 }}
        >
          <legend>Dados da senha</legend>
          <div className={`declaration-field ${styles.wide}`}>
            <label htmlFor="account-currentPassword">Senha atual</label>
            <PasswordInput
              name="currentPassword"
              id="account-currentPassword"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </div>
          <div className="declaration-field">
            <label htmlFor="account-newPassword">Nova senha</label>
            <PasswordInput
              name="newPassword"
              id="account-newPassword"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
          </div>
          <div className="declaration-field">
            <label htmlFor="account-confirmPassword">Repita a nova senha</label>
            <PasswordInput
              name="confirmPassword"
              id="account-confirmPassword"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
          </div>
          <div className={styles.actions}>
            <button type="submit" className="ete-button">
              {pending ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
