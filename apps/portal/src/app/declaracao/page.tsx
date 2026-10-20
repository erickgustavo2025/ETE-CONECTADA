import { redirect } from 'next/navigation';
import PortalHome from '@/components/portal-home';
import StudentDeclarationRequests from '@/components/student-declaration-requests';
import { currentSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { declarationStudent } from '@/lib/declarations';
import { studentRequests } from '@/lib/declaration-requests';
export const metadata = { title: 'Solicitar declaração | ETE CONECTADA' };
export default async function DeclarationPage() {
  const session = await currentSession();
  if (!session) redirect('/login');
  const [student, requests] = await Promise.all([
    declarationStudent(getDb(), session.studentId),
    studentRequests(session.studentId),
  ]);
  const enrollment = student?.enrollments[0];
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
            Peça pelo portal. Retire na escola quando estiver pronta.
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
        {enrollment?.mode !== 'INTEGRADO' && (
          <p className="document-empty">
            {enrollment?.mode === 'SUBSEQUENTE'
              ? 'O modelo do subsequente aguarda a confirmação da escola.'
              : 'Procure a secretaria para completar sua matrícula antes de solicitar.'}
          </p>
        )}
        <StudentDeclarationRequests
          enrollmentId={enrollment?.mode === 'INTEGRADO' ? enrollment.id : null}
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
          Fluxo em desenvolvimento. O modelo de impressão ainda precisa ser
          validado pela escola.
        </p>
      </section>
    </PortalHome>
  );
}
