import catalog from '../assets/data/municipios-ibge.json';
import type { MunicipalityOption } from './brazil-states';

export function municipalities(state: string): MunicipalityOption[] {
  if (!Object.hasOwn(catalog, state)) return [];
  return catalog[state as keyof typeof catalog].cities;
}

export class BirthplaceError extends Error {}

export function validateDeclaredBirthplace(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BirthplaceError(
      'Escolha o estado e o município onde você nasceu.',
    );
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['state', 'municipalityId'].includes(key),
    ) ||
    typeof input.state !== 'string' ||
    typeof input.municipalityId !== 'string'
  )
    throw new BirthplaceError(
      'Confira o estado e selecione um município da lista.',
    );
  const found = municipalities(input.state).find(
    (city) => city.id === input.municipalityId,
  );
  if (!found)
    throw new BirthplaceError('Escolha um município do estado informado.');
  return {
    birthCity: found.name,
    birthState: input.state,
    birthCountry: 'BR',
    birthplaceSource: 'STUDENT_DECLARATION' as const,
  };
}
