// Somente cancelamento especulativo das duas entradas públicas do portal.
// Requisição de navegação, imagem, script ou outro erro continua sendo falha.
export function cancelledEntryPrefetch(request, portalOrigin) {
  const url = new URL(request.url);
  return (
    request.error === 'net::ERR_ABORTED' &&
    request.type === 'fetch' &&
    request.method === 'GET' &&
    request.headers['next-router-prefetch'] === '1' &&
    request.headers.rsc === '1' &&
    url.origin === portalOrigin &&
    ['/cadastro', '/recuperar-acesso'].includes(url.pathname)
  );
}
