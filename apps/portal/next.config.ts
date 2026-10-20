import type { NextConfig } from 'next';
import {
  baseSecurityHeaders,
  apiSecurityHeaders,
} from '../../shared/security-headers';

const nextConfig: NextConfig = {
  devIndicators: false,
  skipTrailingSlashRedirect: true,
  skipProxyUrlNormalize: true,
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: Object.entries(apiSecurityHeaders).map(([key, value]) => ({
          key,
          value,
        })),
      },
      {
        source: '/:path*',
        headers: Object.entries(baseSecurityHeaders).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ];
  },
  serverExternalPackages: ['xlsx'],
  outputFileTracingIncludes: {
    '/api/secretaria/importacao': ['../../node_modules/xlsx/**/*'],
    '/api/secretaria/declaracao': [
      './src/assets/fonts/*',
      './public/images/governo.png',
    ],
    '/api/secretaria/declaracoes': [
      './src/assets/fonts/*',
      './public/images/governo.png',
    ],
  },
  // Informe NEXT_PUBLIC_LAN_HOST no .env.local para permitir acesso na rede local.
  allowedDevOrigins: process.env.NEXT_PUBLIC_LAN_HOST
    ? [process.env.NEXT_PUBLIC_LAN_HOST]
    : [],
};

export default nextConfig;
