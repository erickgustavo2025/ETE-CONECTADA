'use client';

import Link from 'next/link';
import Image from 'next/image';
import PasswordInput from '@/components/password-input';
import { useFormValidation } from '@/components/use-form-validation';
import AuthSide from '@/components/auth-side';
import PortalFrame from '@/components/portal-frame';
import { FormEvent, useState } from 'react';

export default function LoginForm() {
  const validation = useFormValidation('login-error');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !validation.validate(event.currentTarget)) return;
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: data.get('identifier'),
          password: data.get('password'),
        }),
      });
      const result = await response.json();
      if (response.ok && result.ok) {
        window.location.assign('/');
        return;
      }
      setMessage(
        result.error ||
          'Não foi possível entrar. Confira os dados e tente novamente.',
      );
    } catch {
      setMessage('Não foi possível concluir o acesso agora. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalFrame showHomeLink={false}>
      <main className="auth-shell" id="conteudo" tabIndex={-1}>
        <AuthSide mode="login" />
        <div className="auth-main">
          <div className="auth-content">
            <div className="auth-card-head">
              <span className="auth-symbol" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 4h5v16h-5M3 12h12m-4-4 4 4-4 4" />
                </svg>
              </span>
              <span className="eyebrow">BEM-VINDO À ETE CONECTADA</span>
              <h1>Acesso ao portal</h1>
              <p>Entre com seu CPF ou e-mail e senha.</p>
            </div>
            <div className="auth-card-body">
              <form
                method="post"
                noValidate
                className="auth-form"
                onSubmit={handleSubmit}
              >
                <label htmlFor="identifier">CPF ou e-mail</label>
                <input
                  {...validation.field('identifier')}
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="Digite seu CPF ou e-mail"
                  required
                />
                <label htmlFor="password">Senha</label>
                <PasswordInput
                  {...validation.field('password')}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  required
                />
                {validation.error && (
                  <p id="login-error" className="field-error" role="alert">
                    {validation.error}
                  </p>
                )}
                <button className="ete-button" type="submit" disabled={busy}>
                  <Image
                    className="auth-action-icon"
                    src="/icons/login.png"
                    alt=""
                    width={800}
                    height={800}
                  />
                  {busy ? 'Verificando…' : 'Entrar no portal'}
                </button>
                {message && (
                  <p className="form-note" role="alert">
                    {message}
                  </p>
                )}
              </form>
              <p className="form-note" role="note">
                Ambiente de desenvolvimento. O acesso em produção ainda não está
                disponível.
              </p>
              <p className="auth-switch">
                Este é seu primeiro acesso?{' '}
                <Link href="/cadastro">Crie sua conta</Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </PortalFrame>
  );
}
