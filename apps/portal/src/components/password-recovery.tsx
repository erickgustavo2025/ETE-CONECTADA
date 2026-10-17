'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import PortalFrame from './portal-frame';
import AuthSide from './auth-side';
import PasswordInput from './password-input';
import { useFormValidation } from './use-form-validation';
import { validResetToken } from '@/lib/password-reset-input';

export default function PasswordRecovery({
  mode,
}: {
  mode: 'request' | 'reset';
}) {
  const reset = mode === 'reset';
  const validation = useFormValidation('recovery-error');
  const [loaded, setLoaded] = useState(!reset);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  const readFragment = useRef(false);
  const linkVersion = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resetValidation = validation.reset;

  useEffect(() => {
    if (!reset) return;
    function readLink() {
      const fragment = window.location.hash;
      // StrictMode repete o efeito; não descartar o token já retirado da URL.
      if (!fragment && readFragment.current) return;
      readFragment.current = true;
      linkVersion.current++;
      setBusy(false);
      const values = new URLSearchParams(
        fragment.length <= 100 ? fragment.slice(1) : '',
      );
      const value = values.get('token');
      setToken(values.size === 1 && validResetToken(value) ? value : '');
      setDone(false);
      setMessage('');
      resetValidation();
      formRef.current?.reset();
      // O fragmento não chega ao servidor; remove também do histórico antes do envio.
      window.history.replaceState(null, '', '/redefinir-senha');
      setLoaded(true);
    }
    readLink();
    window.addEventListener('hashchange', readLink);
    return () => window.removeEventListener('hashchange', readLink);
  }, [reset, resetValidation]);

  useEffect(() => {
    if (done) heading.current?.focus();
  }, [done]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !validation.ready ||
      busy ||
      !validation.validate(event.currentTarget) ||
      (reset && !token)
    )
      return;
    const form = event.currentTarget,
      data = new FormData(form);
    const version = linkVersion.current;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/password-reset/${reset ? 'confirm' : 'request'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            reset
              ? {
                  token,
                  password: data.get('newPassword'),
                  confirmPassword: data.get('confirmPassword'),
                }
              : { email: data.get('email') },
          ),
          signal: AbortSignal.timeout(20_000),
        },
      );
      const result = await response.json();
      if (version !== linkVersion.current) return;
      if (!response.ok) {
        if (
          typeof result.field === 'string' &&
          typeof result.error === 'string'
        )
          validation.reject(result.field, result.error, form);
        else
          setMessage(
            typeof result.error === 'string'
              ? result.error
              : 'Não foi possível concluir. Tente novamente.',
          );
        return;
      }
      if (reset) {
        form.reset();
        setToken('');
        setDone(true);
      } else setMessage(result.message);
    } catch {
      if (version !== linkVersion.current) return;
      setMessage(
        reset
          ? 'Não foi possível confirmar a alteração. Tente entrar com a nova senha; se não funcionar, solicite outro link.'
          : 'Não foi possível enviar a solicitação agora. Confira a conexão e tente novamente.',
      );
    } finally {
      if (version === linkVersion.current) setBusy(false);
    }
  }

  return (
    <PortalFrame showHomeLink={false}>
      <main className="auth-shell" id="conteudo" tabIndex={-1}>
        <AuthSide mode="login" />
        <div className="auth-main">
          <div className="auth-content">
            <div className="auth-card-head">
              <span className="eyebrow">ACESSO AO PORTAL</span>
              <h1 ref={heading} tabIndex={-1}>
                {done
                  ? 'Senha atualizada'
                  : reset
                    ? 'Crie uma nova senha'
                    : 'Recuperar acesso'}
              </h1>
              <p>
                {done
                  ? 'Entre novamente com sua nova senha. As sessões anteriores foram encerradas.'
                  : reset
                    ? 'Use uma senha de 8 a 128 caracteres.'
                    : 'Receba um link no e-mail confirmado da sua conta.'}
              </p>
            </div>
            <div className="auth-card-body">
              {!loaded ? (
                <p role="status">Carregando…</p>
              ) : reset && !token && !done ? (
                <p role="status" className="registration-result">
                  Este link é inválido. Solicite outro link para redefinir a
                  senha.
                </p>
              ) : (
                !done && (
                  <form
                    ref={formRef}
                    method="post"
                    noValidate
                    className="auth-form"
                    onSubmit={submit}
                  >
                    {reset ? (
                      <>
                        <label htmlFor="recovery-password">Nova senha</label>
                        <PasswordInput
                          {...validation.field('newPassword')}
                          id="recovery-password"
                          name="newPassword"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          disabled={busy}
                        />
                        <label htmlFor="recovery-confirmation">
                          Confirme a senha
                        </label>
                        <PasswordInput
                          {...validation.field('confirmPassword')}
                          id="recovery-confirmation"
                          name="confirmPassword"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          required
                          disabled={busy}
                        />
                      </>
                    ) : (
                      <>
                        <label htmlFor="recovery-email">E-mail da conta</label>
                        <input
                          {...validation.field('email')}
                          id="recovery-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          maxLength={254}
                          required
                          disabled={busy}
                        />
                      </>
                    )}
                    {validation.error && (
                      <p
                        id="recovery-error"
                        role="alert"
                        className="field-error"
                      >
                        {validation.error}
                      </p>
                    )}
                    <button
                      className="ete-button"
                      type="submit"
                      disabled={busy || !validation.ready}
                      aria-busy={busy || !validation.ready}
                    >
                      {!validation.ready
                        ? 'Carregando…'
                        : busy
                          ? reset
                            ? 'Alterando…'
                            : 'Enviando…'
                          : reset
                            ? 'Salvar nova senha'
                            : 'Enviar link'}
                    </button>
                  </form>
                )
              )}
              <noscript>
                <p className="form-note">
                  Para usar este formulário, ative o JavaScript do navegador ou
                  procure a secretaria.
                </p>
              </noscript>
              {message && (
                <p role="status" className="registration-result">
                  {message}
                </p>
              )}
              {!reset && (
                <p className="form-note">
                  Perdeu acesso ao e-mail? Procure a secretaria para conferir
                  seus dados e receber orientação.
                </p>
              )}
              {reset && !done && (
                <p className="form-note">
                  <Link href="/recuperar-acesso">Solicitar outro link</Link>
                </p>
              )}
              <p className="auth-switch">
                <Link href="/login">Voltar ao login</Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </PortalFrame>
  );
}
