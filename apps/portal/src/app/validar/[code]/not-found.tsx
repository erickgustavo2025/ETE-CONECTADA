import PortalFrame from '@/components/portal-frame';
import styles from '@/components/public-verification.module.css';
export default function NotFound() {
  return (
    <PortalFrame>
      <main className={styles.page} id="conteudo">
        <section className={styles.panel}>
          <h1>Página de consulta não encontrada</h1>
          <p>Confira o endereço da página ou procure a secretaria.</p>
        </section>
      </main>
    </PortalFrame>
  );
}
