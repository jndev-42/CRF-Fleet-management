import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Include prisma.config.ts in serverless function bundles (Vercel)
  // PrismaClient reads this at query time to resolve the datasource URL
  outputFileTracingIncludes: {
    '/api/**': ['./prisma.config.ts', './prisma/schema.prisma'],
  },
};

export default nextConfig;
