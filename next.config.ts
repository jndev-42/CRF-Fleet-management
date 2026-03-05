import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add an empty turbopack config to silence the webpack/turbopack mismatch warning
  // next-pwa is removed since it doesn't support Turbopack (Next.js 16 default)
  turbopack: {},
  // Include prisma.config.ts in serverless function bundles (Vercel)
  // PrismaClient reads this at query time to resolve the datasource URL
  outputFileTracingIncludes: {
    '/api/**': ['./prisma.config.ts', './prisma/schema.prisma'],
  },
};

export default nextConfig;
