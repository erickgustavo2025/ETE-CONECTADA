import { synchronizeOwnAcademicState } from '@/lib/school-academic';
import { redirect } from 'next/navigation';
import PortalHome from '@/components/portal-home';
import StudentDeclarationRequests from '@/components/student-declaration-requests';
import { currentSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { declarationStudent } from '@/lib/declarations';
import { studentRequests } from '@/lib/declaration-requests';
import { declarationPortalEnabled } from '@/lib/declaration-documents';
export const metadata = { title: 'Solicitar declaração | ETE CONECTADA' };
export default async function DeclarationPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  if (session.role === 'student' && declarationPortalEnabled())
    await synchronizeOwnAcademicState(session.accountId);
  const [student, requests, access] = await Promise.all([
    declarationStudent(getDb(), session.studentId),
    studentRequests(session.studentId),
    getDb().student.findUnique({
      where: { id: session.studentId },
      select: {
        issuanceBlocked: true,
        enrollments: {
          where: {
            status: { not: 'ENDED' },
            repetitionPending: true,
            repetitionOverride: false,
          },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);
  const enrollment =
    student?.enrollments.find((e) => e.status === 'ACTIVE') ??
    student?.enrollments.find((e) => e.status !== 'ENDED') ??
    student?.enrollments[0];
  const automatic = declarationPortalEnabled() && session.role === 'student';
  return (
    <PortalHome studentName={session.fullName} role={session.role} internalPage>
      <section
        className="document-page student-document-page"
        aria-labelledby="declaration-title"
      >
        <div className="document-heading">
          <span className="eyebrow">SECRETARIA ESCOLAR</span>
          <h1 id="declaration-title">Declaração de vínculo</h1>
          <p className="document-intro">
            {automatic
              ? 'Gere sua declaração e abra ou baixe o PDF pelo portal.'
              : 'Peça pelo portal. Retire na escola quando estiver pronta.'}
          </p>
        </div>
        <dl className="student-summary">
          <div>
            <dt>Estudante</dt>
            <dd>{student?.fullName || 'Nome pendente'}</dd>
          </div>
          <div>
            <dt>Matrícula</dt>
            <dd>{student?.schoolRegistration || 'Não informada'}</dd>
          </div>
          <div>
            <dt>Turma</dt>
            <dd>{enrollment?.className || 'Ainda não vinculada'}</dd>
          </div>
          <div>
            <dt>Modalidade</dt>
            <dd>
              {enrollment
                ? enrollment.mode === 'INTEGRADO'
                  ? 'Ensino Médio Integrado'
                  : 'Subsequente'
                : 'Ainda não informada'}
            </dd>
          </div>
        </dl>
        {!enrollment && (
          <p className="document-empty">
            Procure a secretaria para completar sua matrícula antes de
            solicitar.
          </p>
        )}
        {enrollment?.status === 'ENDED' && (
          <p className="document-notice">
            <strong>Seus vínculos estão encerrados.</strong> Você pode consultar
            e baixar os documentos anteriores. Uma nova declaração de vínculo
            exige matrícula ativa.
          </p>
        )}
        <StudentDeclarationRequests
          automatic={automatic}
          issuanceBlocked={
            (access?.issuanceBlocked ?? true) ||
            Boolean(access?.enrollments.length)
          }
          enrollmentId={
            enrollment?.status === 'ENDED' ? null : (enrollment?.id ?? null)
          }
          initialRequests={requests}
          birthplace={
            student?.details?.birthCity &&
            student.details.birthCountry &&
            student.details.birthplaceSource
              ? {
                  city: student.details.birthCity,
                  state: student.details.birthState,
                  country: student.details.birthCountry,
                  source: student.details.birthplaceSource,
                }
              : null
          }
        />
        <p className="document-footnote">
          {automatic
            ? 'Ambiente de teste. Os documentos gerados ainda não têm validade oficial.'
            : 'Fluxo em desenvolvimento. O modelo de impressão ainda precisa ser validado pela escola.'}
        </p>
      </section>
    </PortalHome>
  );
}
