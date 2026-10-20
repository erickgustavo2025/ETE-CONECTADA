import type { NextConfig } from 'next';
import path from 'node:path';
import {
  baseSecurityHeaders,
  apiSecurityHeaders,
} from '../../shared/security-headers';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
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
  allowedDevOrigins: process.env.NEXT_PUBLIC_LAN_HOST
    ? [process.env.NEXT_PUBLIC_LAN_HOST]
    : [],
};

export default nextConfig;
