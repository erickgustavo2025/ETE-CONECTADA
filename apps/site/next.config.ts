import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: process.env.NEXT_PUBLIC_LAN_HOST
    ? [process.env.NEXT_PUBLIC_LAN_HOST]
    : [],
};

export default nextConfig;
