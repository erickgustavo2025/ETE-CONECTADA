// O adapter pg interpreta timestamptz como UTC. A sessão SQL precisa usar o mesmo
// fuso para preservar o instante na leitura e na escrita, independentemente do host.
export function utcPostgresUrl(
  value: string,
  inheritedOptions?: string,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Configuração PostgreSQL inválida.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    url.hash ||
    url.searchParams.getAll('options').length > 1
  )
    throw new Error('Configuração PostgreSQL inválida.');

  // pg dá precedência às opções da URI sobre PGOPTIONS. UTC vem por último,
  // mantendo opções de TLS, limites e demais parâmetros definidos pela operação.
  const options = url.searchParams.get('options') ?? inheritedOptions ?? '';
  url.searchParams.set('options', `${options} -c TimeZone=UTC`.trim());
  return url.toString();
}
