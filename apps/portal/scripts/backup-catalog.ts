// pg_dump/restore pode distribuir o cast do array entre seus literais.
// Aceita apenas literais ASCII sem escapes e os dois tipos nativos exatos;
// preserva valores, ordem, operadores e todo o restante da constraint.
export function canonicalCheckDefinition(definition: string) {
  return definition.replace(
    /\(ARRAY\[((?:'[A-Z_]+'::character varying)(?:, '[A-Z_]+'::character varying)*)\]\)::text\[\]/g,
    (_match, items: string) =>
      `ARRAY[${items
        .split(', ')
        .map((item) => `(${item})::text`)
        .join(', ')}]`,
  );
}
