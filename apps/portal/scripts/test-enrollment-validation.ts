import assert from 'node:assert/strict';
import {
  requireCurrentEnrollment,
  validateEnrollmentReview,
  EnrollmentValidityError,
} from '../src/lib/enrollment-validity';

const active = {
  status: 'ACTIVE',
  periodLabel: '2026.2',
  validFrom: '2026-07-01',
  validUntil: '2026-12-31',
};
const reviewed = validateEnrollmentReview(active);
assert.ok(reviewed.status === 'ACTIVE');
const row = { ...reviewed, reviewedAt: new Date('2026-07-01T12:00:00Z') };
requireCurrentEnrollment(row, '2026.2', new Date('2026-07-01T03:00:00Z'));
requireCurrentEnrollment(row, '2026.2', new Date('2027-01-01T02:59:59Z'));
for (const time of ['2026-07-01T02:59:59Z', '2027-01-01T03:00:00Z'])
  assert.throws(
    () => requireCurrentEnrollment(row, '2026.2', new Date(time)),
    /vigência/,
  );
for (const status of ['UNCONFIRMED', 'ENDED'])
  assert.throws(
    () => requireCurrentEnrollment({ ...row, status }),
    /conferência/,
  );
assert.throws(
  () => requireCurrentEnrollment(row, '2025', new Date('2026-10-13T12:00:00Z')),
  /período/,
);
assert.throws(
  () => requireCurrentEnrollment({ ...row, reviewedAt: null }),
  /conferência/,
);
for (const body of [
  null,
  {},
  { ...active, status: 'inventado' },
  { ...active, validFrom: '2026-02-29' },
  { ...active, validUntil: '2026-06-30' },
  { ...active, periodLabel: '' },
  { ...active, periodLabel: 'x'.repeat(61) },
  { ...active, reviewedById: 'forjado' },
  { status: 'ENDED', validUntil: '2026-10-13' },
]) {
  assert.throws(() => validateEnrollmentReview(body), EnrollmentValidityError);
}
assert.deepEqual(validateEnrollmentReview({ status: 'ENDED' }), {
  status: 'ENDED',
});
console.log(
  'OK: situação, período, vigência inclusiva no fuso Recife, dados inválidos e alteração de estado.',
);
