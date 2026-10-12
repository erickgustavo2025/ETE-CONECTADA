import Image from 'next/image';
import { headers } from 'next/headers';
import CrossAppLink from '../../../shared/navigation/cross-app-link';
import PernambucoArt from '../../../shared/brand/pernambuco-art';

const lanHost = process.env.NEXT_PUBLIC_LAN_HOST;
const configuredLoginUrl =
  process.env.NODE_ENV === 'development'
    ? lanHost
      ? `http://${lanHost}:3001/login`
      : process.env.NEXT_PUBLIC_PORTAL_LOGIN_URL ||
        'http://localhost:3001/login'
    : process.env.NEXT_PUBLIC_PORTAL_LOGIN_URL ||
      'https://portal.eteconectada.com/login';
const portalUrl = new URL('/', configuredLoginUrl).toString();

function StateMarks() {
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
export default async function Home() {
  // O link já chega com o host certo no HTML, antes da hidratação do navegador.
  const requestHost =
    process.env.NODE_ENV === 'development'
      ? (await headers()).get('host')
      : null;
  let entryUrl = portalUrl;
  if (requestHost) {
    try {
      const url = new URL(`http://${requestHost}`);
      url.port = '3001';
      url.pathname = '/';
      entryUrl = url.toString();
    } catch {
      /* Usa a configuração inicial quando o Host não é válido. */
    }
  }
  const firstAccessUrl = new URL('/cadastro', entryUrl).toString();
  return (
    <div className="site-page">
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <div className="pe-stripe" aria-hidden="true" />
      <div className="identity-bar">
        <div className="container">
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
      <header className="site-header">
        <div className="container header-inner">
          <a
            className="brand"
            href="/"
            aria-label="ETE Conectada, página inicial"
          >
            <Image
              src="/images/ete-conectada-light.svg"
              width={330}
              height={152}
              alt="ETE Conectada"
              priority
            />
          </a>
          <nav aria-label="Navegação principal">
            <a className="about-link" href="#sobre">
              Sobre a escola
            </a>
            <CrossAppLink
              className="header-button ete-button ete-button--header"
              href={entryUrl}
              developmentPort={3001}
            >
              <Image
                className="entry-icon"
                src="/icons/login.png"
                width={800}
                height={800}
                alt=""
              />
              Acessar portal
            </CrossAppLink>
          </nav>
        </div>
      </header>
      <main id="conteudo" tabIndex={-1}>
        <div className="hero-background">
          <section className="hero container" aria-labelledby="intro-title">
            <div className="hero-copy">
              <p className="school-label">
                ETE ADVOGADO JOSÉ DAVID GIL RODRIGUES
              </p>
              <h1 id="intro-title">
                Nossa escola.
                <br />
                Sua história.
                <br />
                <em>Mais conectadas.</em>
              </h1>
              <p className="hero-description">
                O espaço digital da nossa ETE. Um caminho mais simples para
                acessar os serviços da escola.
              </p>
              <div className="hero-actions">
                <CrossAppLink
                  className="primary-button ete-button"
                  href={entryUrl}
                  developmentPort={3001}
                >
                  Acessar meu portal <span aria-hidden="true">→</span>
                </CrossAppLink>
                <CrossAppLink
                  className="text-link"
                  href={firstAccessUrl}
                  developmentPort={3001}
                >
                  Primeiro acesso <span aria-hidden="true">↗</span>
                </CrossAppLink>
              </div>
            </div>
            <div className="brand-stage">
              <PernambucoArt className="stage-art" />
              <div className="stage-school">
                <Image
                  src="/images/ete-jose-david-gil-rodrigues-logo.png"
                  alt="Logo da escola"
                  width={657}
                  height={544}
                />
                <p>
                  Da nossa ETE.
                  <br />
                  Para a nossa comunidade.
                </p>
              </div>
            </div>
          </section>
        </div>
        <section id="sobre" className="school-section container">
          <div>
            <span className="small-label">PERNAMBUCO. EDUCAÇÃO. CONEXÃO.</span>
            <h2>
              ETE Advogado José
              <br />
              David Gil Rodrigues.
            </h2>
          </div>
          <div className="school-copy">
            <p>
              Uma Escola Técnica Estadual de Pernambuco. Este é o ponto de
              encontro digital da nossa comunidade escolar.
            </p>
            <p className="muted">
              O portal está em desenvolvimento. Já é possível criar seu acesso,
              solicitar sua declaração de vínculo e acompanhar o atendimento
              pela secretaria.
            </p>
          </div>
        </section>
        <section
          className="school-access container"
          aria-label="Primeiro acesso ao portal"
        >
          <div>
            <h3>É sua primeira vez por aqui?</h3>
            <p>Tenha sua matrícula e data de nascimento em mãos.</p>
          </div>
          <CrossAppLink
            className="ete-button ete-button--secondary"
            href={firstAccessUrl}
            developmentPort={3001}
          >
            Criar meu acesso <span aria-hidden="true">→</span>
          </CrossAppLink>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <StateMarks />
          <p>
            ETE ADVOGADO JOSÉ DAVID GIL RODRIGUES
            <small>ETE Conectada · Comunidade escolar</small>
          </p>
        </div>
        <div className="pe-stripe" aria-hidden="true" />
      </footer>
    </div>
  );
}
