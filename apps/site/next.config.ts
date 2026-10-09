import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    allowedDevOrigins: process.env.NEXT_PUBLIC_LAN_HOST ? [process.env.NEXT_PUBLIC_LAN_HOST] : [],
};

export default nextConfig;
