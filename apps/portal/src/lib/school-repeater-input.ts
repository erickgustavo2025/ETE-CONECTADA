import {
  digest,
  SheetImportError,
  uuid,
  type SheetInput,
} from './sheet-import-input';
export type RepeaterSelection = {
  enrollmentId: string;
  sheetName: string;
  version: string;
};
export function withRepeaterSelections(
  input: SheetInput,
  value: unknown,
): SheetInput {
  if (value === undefined) return input;
  const fail = () =>
    new SheetImportError(
      'Confira os repetentes e a turma escolhida. Leia os dados novamente.',
      400,
    );
  if (!Array.isArray(value) || value.length > 100) throw fail();
  const seen = new Set<string>();
  const repeaters: RepeaterSelection[] = value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw fail();
      const v = item as Record<string, unknown>;
      if (
        Object.keys(v).some(
          (k) => !['enrollmentId', 'sheetName', 'version'].includes(k),
        ) ||
        typeof v.enrollmentId !== 'string' ||
        !uuid.test(v.enrollmentId) ||
        typeof v.version !== 'string' ||
        !/^[a-f0-9]{64}$/.test(v.version) ||
        typeof v.sheetName !== 'string' ||
        !input.contexts.some((c) => c.sheetName === v.sheetName && c.header)
      )
        throw fail();
      const enrollmentId = v.enrollmentId.toLowerCase();
      if (seen.has(enrollmentId)) throw fail();
      seen.add(enrollmentId);
      return { enrollmentId, sheetName: v.sheetName, version: v.version };
    })
    .sort((a, b) => a.enrollmentId.localeCompare(b.enrollmentId));
  return repeaters.length
    ? {
        ...input,
        repeaters,
        inputHash: digest({ base: input.inputHash, repeaters }),
      }
    : input;
}
