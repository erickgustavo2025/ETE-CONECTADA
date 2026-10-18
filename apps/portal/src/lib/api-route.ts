import { apiSecurityHeaders } from '../../../../shared/security-headers';

type ApiHandler = (request: Request) => Response | Promise<Response>;

// Normaliza o endereço antes do corpo, sem o buffer que o Proxy cria para uploads.
export function withApiCanonicalPath(handler: ApiHandler): ApiHandler {
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/')) {
      const path = '/' + url.pathname.replace(/\/+$/, '').replace(/^\/+/, '');
      return new Response(null, {
        status: 308,
        headers: { ...apiSecurityHeaders, Location: path + url.search },
      });
    }
    return handler(request);
  };
}
