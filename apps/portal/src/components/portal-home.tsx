'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import LogoutButton from './logout-button';
import { useClientReady } from './use-client-ready';
import {
  StateIdentityBar,
  SchoolFooter,
  PortalNavigationLink,
} from './portal-frame';
import styles from './portal-home.module.css';
import PernambucoArt from '../../../../shared/brand/pernambuco-art';

type PortalHomeProps = {
  studentName: string | null;
  siteHref?: string;
  role?: 'student' | 'secretary';
  children?: ReactNode;
  internalPage?: boolean;
};

const services = [
  {
    title: 'Declaração de vínculo',
    detail:
      'Solicite sua declaração e acompanhe quando estiver pronta para retirada.',
    icon: 'statement',
  },
  {
    title: 'Histórico escolar',
    detail: 'O histórico escolar será disponibilizado em uma próxima etapa.',
    icon: 'history',
  },
  {
    title: 'Diploma',
    detail: 'O serviço de diploma será disponibilizado em uma próxima etapa.',
    icon: 'diploma',
  },
];

function ServiceIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    statement: (
      <>
        <path d="M6 3.5h8l4 4V21H6z" />
        <path d="M14 3.5V8h4M9 12h6M9 16h6" />
      </>
    ),
    history: (
      <>
        <path d="M4.5 4.5h12a3 3 0 0 1 3 3V20h-12a3 3 0 0 0-3 1z" />
        <path d="M4.5 4.5V21M8.5 9h7M8.5 13h7" />
      </>
    ),
    diploma: (
      <>
        <path d="M4 4.5h16v11H4zM8 8.5h8M8 11.5h6" />
        <path d="M12 15.5v6l2.5-2 2.5 2v-6" />
      </>
    ),
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export default function PortalHome({
  studentName,
  siteHref,
  role = 'student',
  children,
  internalPage = false,
}: PortalHomeProps) {
  const ready = useClientReady();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const menuRef = useRef<HTMLDialogElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = menuRef.current;
    if (!dialog) return;
    if (menuOpen && !dialog.open) {
      dialog.showModal();
      menuCloseRef.current?.focus();
    } else if (!menuOpen && dialog.open) {
      dialog.close();
      (menuReturnFocusRef.current ?? menuTriggerRef.current)?.focus();
    }
  }, [menuOpen]);

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <StateIdentityBar />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <button
            ref={menuTriggerRef}
            className={styles.menuTrigger}
            type="button"
            onClick={(event) => {
              menuReturnFocusRef.current = event.currentTarget;
              setMenuOpen(true);
            }}
            aria-label="Abrir menu de serviços"
            aria-expanded={menuOpen}
            aria-controls="portal-menu"
            disabled={!ready}
          >
            <Image
              src="/icons/menu.png"
              alt=""
              width={800}
              height={800}
              priority
            />
            <span className={styles.headerActionLabel}>Menu</span>
          </button>
          <div className={styles.headerBrand}>
            <Image
              src="/images/ete-conectada-light.svg"
              alt="ETE Conectada"
              width={330}
              height={152}
            />
          </div>
          <div className={styles.headerRight}>
            <PortalNavigationLink
              destination={internalPage ? 'home' : 'site'}
              siteHref={siteHref}
            />
          </div>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1} className={styles.main}>
        {children ?? (
          <>
            <section className={styles.welcome} aria-labelledby="welcome-title">
              <div className={styles.welcomeCopy}>
                <span className={styles.welcomeBadge}>
                  {role === 'secretary'
                    ? 'PORTAL DA SECRETARIA'
                    : 'SEU ESPAÇO NA ESCOLA'}
                </span>
                <h1 id="welcome-title">
                  Olá,
                  <br />
                  <span>{studentName || 'estudante'}</span>
                  <span className={styles.greetingDot}>.</span>
                </h1>
                <p>Bom ter você por aqui.</p>
                <p className={styles.help}>
                  {role === 'secretary'
                    ? 'Atenda os pedidos dos alunos e organize as turmas pelo menu de serviços.'
                    : 'Solicite documentos e acompanhe o atendimento da escola pelo menu de serviços.'}
                </p>
                <button
                  className={styles.welcomeAction}
                  type="button"
                  onClick={(event) => {
                    menuReturnFocusRef.current = event.currentTarget;
                    setMenuOpen(true);
                  }}
                  aria-expanded={menuOpen}
                  aria-controls="portal-menu"
                  disabled={!ready}
                >
                  Abrir serviços <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className={styles.brandPanel}>
                <PernambucoArt className={styles.welcomeArt} />
                <div className={styles.panelCaption}>
                  <span>Da nossa ETE. Para você.</span>
                  <Image
                    src="/images/ete-jose-david-gil-rodrigues-logo.png"
                    alt="Logo da escola"
                    width={657}
                    height={544}
                  />
                </div>
              </div>
            </section>
            <p className={styles.developmentNote}>
              <ServiceIcon name="statement" />
              <span>
                <strong>Declaração de vínculo</strong>
                <br />
                {role === 'secretary'
                  ? 'Abra o menu de serviços para conferir os pedidos e preparar as declarações dos alunos.'
                  : 'Peça pelo portal e acompanhe quando estiver pronta para buscar na escola.'}
              </span>
            </p>
          </>
        )}
      </main>

      <SchoolFooter />
      <dialog
        id="portal-menu"
        ref={menuRef}
        className={styles.menuDialog}
        aria-labelledby="menu-title"
        onCancel={() => setMenuOpen(false)}
        onClick={(event) => {
          if (event.target === menuRef.current) setMenuOpen(false);
        }}
      >
        <div className={styles.drawer}>
          <div className={styles.drawerTop}>
            <div>
              <span className={styles.eyebrow}>ETE CONECTADA</span>
              <h2 id="menu-title">Menu do portal</h2>
            </div>
            <button
              ref={menuCloseRef}
              className={styles.closeButton}
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Fechar menu"
            >
              ×
            </button>
          </div>
          <p className={styles.drawerIntro}>Serviços da escola</p>
          <div className={styles.menuServices}>
            {services.map((service, index) =>
              index === 0 ? (
                <Link
                  className={styles.menuService}
                  key={service.title}
                  href={
                    role === 'secretary'
                      ? '/secretaria/declaracoes'
                      : '/declaracao'
                  }
                  onClick={() => setMenuOpen(false)}
                >
                  <span className={styles.serviceIcon} aria-hidden="true">
                    <ServiceIcon name={service.icon} />
                  </span>
                  <span>{service.title}</span>
                </Link>
              ) : (
                <button
                  className={styles.menuService}
                  type="button"
                  key={service.title}
                  onClick={() =>
                    setSelectedService((current) =>
                      current === index ? null : index,
                    )
                  }
                  aria-expanded={selectedService === index}
                  aria-controls="service-details"
                  data-selected={selectedService === index}
                >
                  <span className={styles.serviceIcon} aria-hidden="true">
                    <ServiceIcon name={service.icon} />
                  </span>
                  <span>{service.title}</span>
                </button>
              ),
            )}
            {role === 'secretary' && (
              <Link
                className={styles.menuService}
                href="/secretaria/alunos"
                onClick={() => setMenuOpen(false)}
              >
                <span className={styles.serviceIcon} aria-hidden="true">
                  <ServiceIcon name="history" />
                </span>
                <span>Alunos e acesso</span>
              </Link>
            )}
            {role === 'secretary' && (
              <Link
                className={styles.menuService}
                href="/secretaria/calendarios"
                onClick={() => setMenuOpen(false)}
              >
                <span className={styles.serviceIcon} aria-hidden="true">
                  <ServiceIcon name="history" />
                </span>
                <span>Calendário do subsequente</span>
              </Link>
            )}
            {role === 'secretary' && (
              <Link
                className={styles.menuService}
                href="/secretaria/importacao/integrado"
                onClick={() => setMenuOpen(false)}
              >
                <span className={styles.serviceIcon} aria-hidden="true">
                  <ServiceIcon name="history" />
                </span>
                <span>Importar alunos do integrado</span>
              </Link>
            )}
            {role === 'secretary' && (
              <Link
                className={styles.menuService}
                href="/secretaria/importacao/subsequente"
                onClick={() => setMenuOpen(false)}
              >
                <span className={styles.serviceIcon} aria-hidden="true">
                  <ServiceIcon name="history" />
                </span>
                <span>Importar alunos do subsequente</span>
              </Link>
            )}
          </div>
          <div
            id="service-details"
            className={styles.menuNote}
            role="status"
            aria-live="polite"
          >
            {selectedService === null ? (
              'Selecione um serviço para saber mais.'
            ) : (
              <>
                <strong>{services[selectedService].title}</strong>
                <p>{services[selectedService].detail}</p>
              </>
            )}
          </div>
          <div className={styles.drawerFooter}>
            <LogoutButton />
          </div>
        </div>
      </dialog>
    </div>
  );
}
