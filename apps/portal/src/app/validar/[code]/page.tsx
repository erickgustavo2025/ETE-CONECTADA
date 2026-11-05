import { validDocumentCode } from '@/lib/public-verification-input';
import { notFound } from 'next/navigation';
import PortalFrame from '@/components/portal-frame';
import PublicVerificationPage from '@/components/public-verification';
import { declarationRegistryPreviewEnabled } from '@/lib/declaration-documents';
export const metadata = {
  title: 'Verificar declaração | ETE CONECTADA',
  robots: { index: false, follow: false, nocache: true },
};
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  if (!declarationRegistryPreviewEnabled()) notFound();
  const { code } = await params;
  if (!validDocumentCode(code)) notFound();
  return (
    <PortalFrame>
      <PublicVerificationPage key={code} code={code} />
    </PortalFrame>
  );
}
