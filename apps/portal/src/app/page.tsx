import { redirect } from "next/navigation";
import { headers } from "next/headers";
import PortalHome from "@/components/portal-home";
import { currentSession } from "@/lib/session";

export default async function HomePage() {
  const session = await currentSession();
  if (!session) redirect("/login");
  let siteHref: string | undefined;
  if (process.env.NODE_ENV === "development") {
    const requestHost = (await headers()).get("host");
    if (requestHost) {
      try {
        const url = new URL(`http://${requestHost}`);
        url.port = "3000";
        url.pathname = "/";
        siteHref = url.toString();
      } catch {
        /* A navegação do cliente usa o endereço configurado. */
      }
    }
  }
  return (
    <PortalHome
      studentName={session.fullName}
      siteHref={siteHref}
      role={session.role}
    />
  );
}
