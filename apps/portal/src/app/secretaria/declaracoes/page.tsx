import { redirect } from "next/navigation";
import PortalHome from "@/components/portal-home";
import SecretaryDeclarations from "@/components/secretary-declarations";
import { canManageDeclarations } from "@/lib/declaration-access";
import { currentSession } from "@/lib/session";

export const metadata = { title: "Secretaria — Declarações | ETE CONECTADA" };
export default async function SecretaryDeclarationsPage() {
  const session = await currentSession();
  if (!session) redirect("/login");
  return (
    <PortalHome studentName={session.fullName} role={session.role} internalPage>
      {canManageDeclarations(session.role) ? (
        <SecretaryDeclarations />
      ) : (
        <section className="document-page">
          <h1>Acesso restrito ao atendimento escolar</h1>
          <p>
            Sua conta pode solicitar a declaração e acompanhar quando estiver
            pronta para retirada.
          </p>
          <a href="/declaracao" className="ete-button">
            Minha declaração de vínculo
          </a>
        </section>
      )}
    </PortalHome>
  );
}
