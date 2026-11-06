import {
  declarationDefaults,
  declarationBody,
  studentView,
  validateDeclarationFields,
  DeclarationValidationError,
  type DeclarationStudent,
} from './declarations';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readIssuanceInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DeclarationValidationError('Confira a solicitação.');
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !['enrollmentId', 'requestKey'].includes(key),
    ) ||
    typeof body.enrollmentId !== 'string' ||
    !uuid.test(body.enrollmentId) ||
    typeof body.requestKey !== 'string' ||
    !uuid.test(body.requestKey)
  )
    throw new DeclarationValidationError(
      'Confira a matrícula e tente novamente.',
    );
  return {
    enrollmentId: body.enrollmentId.toLowerCase(),
    requestKey: body.requestKey.toLowerCase(),
  };
}

// O cliente não fornece nome, filiação, curso, módulo ou uma aprovação da secretaria.
export function testIssuanceContent(
  student: DeclarationStudent,
  enrollmentId: string,
) {
  const enrollment = student.enrollments.find((e) => e.id === enrollmentId);
  if (!enrollment)
    throw new DeclarationValidationError(
      'Matrícula não encontrada na sua conta.',
    );
  const details = student.details;
  if (
    !details?.birthCity ||
    !details.birthCountry ||
    (details.birthCountry === 'BR' && !details.birthState)
  )
    throw new DeclarationValidationError(
      'Informe o município e o estado onde você nasceu.',
    );
  const selected = { ...student, enrollments: [enrollment] };
  const fields = validateDeclarationFields({
    ...declarationDefaults(studentView(selected)),
    // Satisfaz o contrato atual do gerador a partir de dados escolares validados;
    // não significa conferência humana nem aprovação da secretaria.
    reviewed: true,
  });
  const snapshot = {
    type: 'DECLARACAO_VINCULO',
    testOnly: true,
    subjectName: student.fullName ?? '',
    socialName: fields.socialName,
    mode: enrollment.mode,
    className: enrollment.className,
    periodLabel: fields.schoolPeriod,
    courseLabel: enrollment.courseLabel,
    courseName: fields.courseName,
    grade: enrollment.grade,
    moduleNumber: enrollment.moduleNumber,
    body: declarationBody(selected, fields),
    secretaryName: fields.secretaryName,
    secretaryRegistration: fields.secretaryRegistration,
    directorName: fields.directorName,
    directorRegistration: fields.directorRegistration,
  };
  return {
    student: selected,
    fields,
    snapshot,
    fingerprint: JSON.stringify(selected),
  };
}
