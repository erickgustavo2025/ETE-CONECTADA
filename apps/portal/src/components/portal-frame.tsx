import Image from 'next/image';
import type { ReactNode } from 'react';
import CrossAppLink from '../../../../shared/navigation/cross-app-link';

export function StateMarks() {
  return (
    <div className="state-marks">
      <span className="government-mark">
        <Image
          src="/images/governo.png"
          alt="Governo de Pernambuco"
          width={500}
          height={500}
        />
      </span>
      <span className="state-divider" />
      <Image
        className="state-flag"
        src="/images/bandeira.png"
        alt="Bandeira de Pernambuco"
        width={500}
        height={333}
      />
    </div>
  );
}

export function StateIdentityBar() {
  return (
    <>
      <div className="school-stripe" aria-hidden="true" />
      <div className="school-identity">
        <div className="school-container">
          <span>Educação em Pernambuco</span>
          <Image
            className="state-flag"
            src="/images/bandeira.png"
            alt="Bandeira de Pernambuco"
            width={500}
            height={333}
          />
        </div>
      </div>
    </>
  );
}

export function SchoolFooter() {
  return (
    <footer className="school-footer">
      <div className="school-container school-footer-inner">
        <StateMarks />
        <p>
          ETE ADVOGADO JOSÉ DAVID GIL RODRIGUES
          <small>ETE Conectada · Portal da comunidade escolar</small>
        </p>
      </div>
      <div className="school-stripe" aria-hidden="true" />
    </footer>
  );
}

export function PortalNavigationLink({
  destination = 'home',
  siteHref,
  siteDevelopmentPort,
}: {
  destination?: 'home' | 'site';
  siteHref?: string;
  siteDevelopmentPort?: number;
}) {
  const isSite = destination === 'site';
  if (isSite && !siteHref) return null;
  const label = isSite ? 'Site da escola' : 'Página inicial';
  const content = (
    <>
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isSite ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c4 5 4 13 0 18-4-5-4-13 0-18Z" />
          </>
        ) : (
          <>
            <path d="m3 10 9-7 9 7M5 9v12h14V9" />
            <path d="M9 21v-8h6v8" />
          </>
        )}
      </svg>
      <span>{label}</span>
    </>
  );
  return isSite && siteHref ? (
    <CrossAppLink
      className="portal-navigation-link ete-button ete-button--header"
      href={siteHref}
      developmentPort={siteDevelopmentPort}
      aria-label={label}
      title={label}
    >
      {content}
    </CrossAppLink>
  ) : (
    <a
      className="portal-navigation-link ete-button ete-button--header"
      href="/"
      aria-label={label}
      title={label}
    >
      {content}
    </a>
  );
}

export default function PortalFrame({
  children,
  showHomeLink = true,
}: {
  children: ReactNode;
  showHomeLink?: boolean;
}) {
  return (
    <div className="school-page">
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <StateIdentityBar />
      <header className="school-header">
        <div className="school-container school-header-inner">
          <div className="school-brand">
            <Image
              className="connected-wordmark"
              src="/images/ete-conectada-light.svg"
              width={330}
              height={152}
              alt="ETE Conectada"
              priority
            />
          </div>
          {showHomeLink ? (
            <PortalNavigationLink />
          ) : (
            <span className="auth-header-label">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <rect x="5" y="10" width="14" height="11" rx="3" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              Portal da escola
            </span>
          )}
        </div>
      </header>
      {children}
      <SchoolFooter />
    </div>
  );
}
