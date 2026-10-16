'use client';

import Link from 'next/link';
import PasswordInput from '@/components/password-input';
import { useFormValidation } from '@/components/use-form-validation';
import AuthSide from '@/components/auth-side';
import PortalFrame from '@/components/portal-frame';
import { normalizeCpf, normalizeParentName } from '@/lib/registration';
import { FormEvent, useEffect, useRef, useState } from 'react';

type Identity = {
  schoolRegistration: string;
  birthDate: string;
  parentName: string;
};

export default function CadastroPage() {
  const identityValidation = useFormValidation('identity-error');
  const accountValidation = useFormValidation('account-error');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [message, setMessage] = useState('');
  const [loginHint, setLoginHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalNotice, setModalNotice] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cpfRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const verificationLinkRef = useRef<HTMLAnchorElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (modalOpen && !dialog.open) {
      dialog.showModal();
      cpfRef.current?.focus();
    } else if (!modalOpen && dialog.open) {
      dialog.close();
      triggerRef.current?.focus();
    }
  }, [modalOpen]);

  useEffect(() => {
    if (modalOpen && !identity)
      (verificationLinkRef.current ?? closeButtonRef.current)?.focus();
  }, [identity, modalOpen, verificationUrl]);

  async function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !identityValidation.validate(event.currentTarget)) return;
    const data = new FormData(event.currentTarget);
    const current = {
      schoolRegistration: String(data.get('schoolRegistration') || ''),
      birthDate: String(data.get('birthDate') || ''),
      parentName: String(data.get('parentName') || ''),
    };
    if (!normalizeParentName(current.parentName)) {
      identityValidation.reject(
        'parentName',
        'Informe o nome completo do pai ou da mãe, como consta na matrícula.',
        event.currentTarget,
      );
      return;
    }
    setMessage('');
    setLoginHint(false);
    setBusy(true);
    try {
      const response = await fetch('/api/registration/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || 'Não foi possível consultar o cadastro.',
        );
      if (result.result === 'created') {
        setMessage('Esta conta já está ativa. Acesse a página de login.');
        setLoginHint(true);
      } else if (result.result === 'eligible' || result.result === 'pending') {
        setIdentity(current);
        setVerificationUrl('');
        setModalNotice(
          result.result === 'pending'
            ? 'Seu cadastro ainda não foi confirmado. Use o mesmo CPF, e-mail e senha para gerar um novo link. Se o link anterior expirou, você pode escolher novos dados de acesso; mantenha o CPF informado.'
            : '',
        );
        setModalOpen(true);
      } else
        setMessage(
          'Não foi possível confirmar os dados. Confira as informações ou procure a escola.',
        );
    } catch (error) {
      setMessage(
        error instanceof Error &&
          !(error instanceof TypeError) &&
          !(error instanceof SyntaxError) &&
          error.name !== 'TimeoutError'
          ? error.message
          : 'Não foi possível consultar o cadastro agora. Confira a conexão e tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identity || busy || !accountValidation.validate(event.currentTarget))
      return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const cpf = normalizeCpf(data.get('cpf'));
    if (!cpf) {
      accountValidation.reject(
        'cpf',
        'Informe um CPF válido. Confira os 11 dígitos.',
        form,
      );
      return;
    }
    const password = String(data.get('newPassword') || '');
    setBusy(true);
    setModalNotice('');
    try {
      const response = await fetch('/api/registration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...identity,
          cpf,
          email: data.get('email'),
          password,
          confirmPassword: data.get('confirmPassword'),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (typeof result.field === 'string') {
          accountValidation.reject(result.field, result.error, form);
          return;
        }
        throw new Error(result.error || 'Não foi possível iniciar o cadastro.');
      }
      form.reset();
      setIdentity(null);
      if (result.result === 'email_sent')
        setModalNotice(
          'Enviamos um link para seu e-mail. Abra a mensagem e confirme a conta em até 30 minutos. Se precisar, volte ao cadastro para enviar um novo link.',
        );
      else {
        setVerificationUrl(result.verificationUrl);
        setModalNotice(
          'Seus dados foram salvos. Como o envio de e-mail ainda não foi configurado, use o link de teste abaixo para confirmar. Se fechar esta tela, volte ao cadastro para gerar outro link.',
        );
      }
    } catch (error) {
      setModalNotice(
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar o cadastro.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalFrame showHomeLink={false}>
      <main className="auth-shell" id="conteudo" tabIndex={-1}>
        <AuthSide mode="cadastro" />
        <div className="auth-main">
          <div className="auth-content registration-content">
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
                  <circle cx="9" cy="8" r="4" />
                  <path d="M2 21v-3a7 7 0 0 1 14 0v3M19 7v6m-3-3h6" />
                </svg>
              </span>
              <span className="eyebrow">SEU ESPAÇO NA ESCOLA</span>
              <h1>Primeiro acesso</h1>
              <p>Informe seus dados como constam na matrícula.</p>
            </div>
            <div className="auth-card-body">
              <form
                method="post"
                noValidate
                className="auth-form registration-form"
                onSubmit={validate}
              >
                <label htmlFor="school-registration">Matrícula</label>
                <input
                  {...identityValidation.field('schoolRegistration')}
                  id="school-registration"
                  name="schoolRegistration"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  minLength={7}
                  maxLength={8}
                  pattern="[0-9]{7,8}"
                  placeholder="Sua matrícula na escola"
                  required
                  disabled={busy}
                />
                <label htmlFor="birth-date">Data de nascimento</label>
                <input
                  {...identityValidation.field('birthDate')}
                  id="birth-date"
                  name="birthDate"
                  type="date"
                  autoComplete="off"
                  required
                  disabled={busy}
                />
                <label htmlFor="parent-name">
                  Nome completo do pai ou da mãe
                </label>
                <input
                  {...identityValidation.field('parentName')}
                  id="parent-name"
                  name="parentName"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="words"
                  spellCheck={false}
                  maxLength={180}
                  aria-describedby={`${identityValidation.field('parentName')['aria-describedby'] ?? ''} parentage-help`.trim()}
                  required
                  disabled={busy}
                />
                <p id="parentage-help" className="form-note">
                  Informe apenas um dos nomes completos registrados. Se não
                  conseguir conferir os dados, procure a secretaria.
                </p>
                {identityValidation.error && (
                  <p id="identity-error" className="field-error" role="alert">
                    {identityValidation.error}
                  </p>
                )}
                <button
                  className="ete-button"
                  type="submit"
                  ref={triggerRef}
                  disabled={busy}
                >
                  {busy ? 'Consultando…' : 'Conferir cadastro'}{' '}
                  <span aria-hidden="true">↗</span>
                </button>
              </form>
              {message && (
                <div
                  className="registration-result"
                  role="status"
                  aria-live="polite"
                >
                  {message}
                  {loginHint && (
                    <>
                      {' '}
                      <Link href="/login">Ir para login</Link>
                    </>
                  )}
                </div>
              )}
              <p className="auth-switch">
                Já tem uma conta? <Link href="/login">Ir para login</Link>
              </p>
            </div>
          </div>
        </div>
        <dialog
          className="registration-dialog"
          ref={dialogRef}
          aria-labelledby="dialog-title"
          aria-describedby="dialog-description"
          onCancel={() => setModalOpen(false)}
          onClick={(event) => {
            if (event.target === dialogRef.current) setModalOpen(false);
          }}
        >
          <div className="dialog-inner">
            <span className="eyebrow">Próxima etapa</span>
            <h2 id="dialog-title">
              {identity
                ? 'Escolha seus dados de acesso'
                : 'Confirme seu e-mail'}
            </h2>
            <p id="dialog-description">
              {identity
                ? 'Informe seu CPF, um e-mail e crie uma senha. Depois, confirme o e-mail pelo link recebido para ativar a conta.'
                : 'A conta será ativada depois que você confirmar o e-mail.'}
            </p>
            <form
              method="post"
              noValidate
              className="auth-form"
              onSubmit={createAccount}
            >
              {identity && (
                <>
                  <label htmlFor="registration-cpf">CPF</label>
                  <input
                    {...accountValidation.field('cpf')}
                    ref={cpfRef}
                    id="registration-cpf"
                    name="cpf"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={14}
                    placeholder="000.000.000-00"
                    required
                  />
                  <label htmlFor="registration-email">E-mail</label>
                  <input
                    {...accountValidation.field('email')}
                    id="registration-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="voce@exemplo.com"
                    required
                  />
                  <label htmlFor="new-password">Nova senha</label>
                  <PasswordInput
                    {...accountValidation.field('newPassword')}
                    id="new-password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    placeholder="Mínimo de 8 caracteres"
                    required
                  />
                  <label htmlFor="confirm-password">Confirme a senha</label>
                  <PasswordInput
                    {...accountValidation.field('confirmPassword')}
                    id="confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    placeholder="Digite a senha novamente"
                    required
                  />
                  {accountValidation.error && (
                    <p id="account-error" className="field-error" role="alert">
                      {accountValidation.error}
                    </p>
                  )}
                  <button
                    className="ete-button"
                    type="submit"
                    disabled={busy || !identity}
                  >
                    {busy ? 'Salvando…' : 'Confirmar dados e enviar link'}{' '}
                    <span aria-hidden="true">↗</span>
                  </button>
                </>
              )}
              {modalNotice && (
                <p
                  role="status"
                  aria-live="polite"
                  className="form-note prototype-notice"
                >
                  {modalNotice}
                </p>
              )}
              {verificationUrl && (
                <a ref={verificationLinkRef} href={verificationUrl}>
                  Confirmar conta de teste
                </a>
              )}
              <button
                ref={closeButtonRef}
                type="button"
                className="button-secondary ete-button ete-button--secondary"
                onClick={() => setModalOpen(false)}
              >
                Fechar
              </button>
            </form>
          </div>
        </dialog>
      </main>
    </PortalFrame>
  );
}
