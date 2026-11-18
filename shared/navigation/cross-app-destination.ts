import { developmentOrigin } from '../request-origin';

type Options = {
  development: boolean;
  port: number;
  requestHost?: string | null;
  lanHost?: string;
};

export function crossAppDestination(
  configured: string | undefined,
  options: Options,
) {
  if (configured?.trim()) {
    try {
      const url = new URL(configured.trim());
      const safeOrigin =
        url.protocol === 'https:' ||
        (options.development &&
          url.protocol === 'http:' &&
          developmentOrigin(url.origin, options.lanHost));
      if (
        safeOrigin &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      )
        return {
          href: new URL('/', url.origin).toString(),
          developmentPort: undefined,
        };
    } catch {
      // Uma configuração incompleta não vira um endereço público.
    }
  }

  if (!options.development) return null;
  const safeLocalOrigin =
    (options.lanHost &&
      developmentOrigin('http://' + options.lanHost, options.lanHost)) ||
    (options.requestHost &&
      developmentOrigin('http://' + options.requestHost, options.lanHost)) ||
    'http://localhost';
  const destination = new URL(safeLocalOrigin);
  destination.port = String(options.port);
  return { href: destination.toString(), developmentPort: options.port };
}
