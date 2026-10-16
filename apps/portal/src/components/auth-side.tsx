import Image from 'next/image';
import PernambucoArt from '../../../../shared/brand/pernambuco-art';
export default function AuthSide({ mode }: { mode: 'login' | 'cadastro' }) {
  return (
    <aside className="auth-side" aria-label="ETE Conectada">
      <div>
        <p className="auth-side-label">DA NOSSA ETE. PARA VOCÊ.</p>
        <h2>
          {mode === 'login' ? (
            <>
              Sua escola,
              <br />
              <em>mais perto.</em>
            </>
          ) : (
            <>
              Seu primeiro passo.
              <br />
              <em>Sua ETE conectada.</em>
            </>
          )}
        </h2>
        <p className="side-description">
          {mode === 'login'
            ? 'Os serviços da escola, em um só lugar.'
            : 'Use os dados da sua matrícula para começar. Depois, crie seus dados de acesso.'}
        </p>
      </div>
      <PernambucoArt className="auth-art" />
      <div className="side-caption">
        <Image
          src="/images/ete-jose-david-gil-rodrigues-logo.png"
          alt=""
          width={657}
          height={544}
        />
        <span>
          Escola Técnica Estadual
          <br />
          Advogado José David Gil Rodrigues
        </span>
      </div>
    </aside>
  );
}
