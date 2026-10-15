// Exclusivo das fixtures sintéticas: não usar estes valores para alunos reais.
export function syntheticEnrollmentValidity() {
  return {
    status: 'ACTIVE' as const,
    periodLabel: '2026',
    validFrom: new Date('2000-01-01T00:00:00Z'),
    validUntil: new Date('2099-12-31T00:00:00Z'),
    reviewedAt: new Date('2000-01-01T12:00:00Z'),
  };
}
