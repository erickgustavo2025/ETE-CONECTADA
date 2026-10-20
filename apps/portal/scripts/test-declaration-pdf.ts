import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { createDeclarationPdf } from '../src/lib/declaration-pdf';
import {
  validateDeclarationFields,
  DeclarationValidationError,
  type DeclarationStudent,
} from '../src/lib/declarations';
import { syntheticEnrollmentValidity } from './enrollment-fixture';
const name = (label: string, length: number) =>
  (label + ' Fictício de Teste ').repeat(20).slice(0, length);
const student: DeclarationStudent = {
  id: '00000000-0000-4000-8000-000000000001',
  fullName: name('Estudante', 180),
  birthDate: new Date('2008-01-01T00:00:00Z'),
  cpf: null,
  schoolRegistration: '0000001',
  details: null,
  enrollments: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      mode: 'INTEGRADO',
      className: 'Turma fictícia',
      grade: 2,
      courseLabel: 'DS',
      schoolYear: 2026,
      ...syntheticEnrollmentValidity(),
    },
  ],
};
const fields = validateDeclarationFields({
  enrollmentId: student.enrollments[0].id,
  naturality: 'Jaboatão dos Guararapes/PE',
  parentOne: name('Primeira filiação', 180),
  parentTwo: name('Segunda filiação', 180),
  socialName: name('Nome social', 180),
  courseName: 'Desenvolvimento de Sistemas',
  schoolPeriod: student.enrollments[0].periodLabel,
  schedule: 'de segunda-feira a sexta-feira, das 07h30 às 16h40',
  secretaryName: name('Secretaria', 180),
  directorName: name('Gestão', 180),
  reviewed: true,
});
test('PDF preserva nomes longos e nome social com duas assinaturas em A4', async () => {
  const bytes = await createDeclarationPdf(student, fields);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(Math.round(pdf.getPage(0).getWidth()), 595);
  assert.equal(Math.round(pdf.getPage(0).getHeight()), 842);
});
test('PDF recusa excesso de conteúdo em vez de truncar ou reduzir a fonte sem limite', async () => {
  await assert.rejects(
    createDeclarationPdf(
      { ...student, fullName: 'Nome fictício '.repeat(500) },
      fields,
    ),
    DeclarationValidationError,
  );
});
