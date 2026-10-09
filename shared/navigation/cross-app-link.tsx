'use client';

import { useEffect, useState, type AnchorHTMLAttributes } from 'react';

// As duas aplicações locais usam o mesmo host e portas diferentes. Preservar
// o host evita perder o cookie ao alternar entre localhost e o IP da rede.
export function developmentAppUrl(configuredHref: string, port: number, origin: string): string {
  const destination = new URL(configuredHref);
  const current = new URL(origin);
  current.port = String(port);
  current.pathname = destination.pathname;
  current.search = destination.search;
  current.hash = destination.hash;
  return current.toString();
}

export default function CrossAppLink({ href, developmentPort, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; developmentPort: number }) {
  const [resolvedHref, setResolvedHref] = useState(href);
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      setResolvedHref(developmentAppUrl(href, developmentPort, window.location.origin));
    }
  }, [href, developmentPort]);
  return <a {...props} href={resolvedHref} />;
}
