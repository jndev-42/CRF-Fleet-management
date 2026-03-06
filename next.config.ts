import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add an empty turbopack config to silence the webpack/turbopack mismatch warning
  // next-pwa is removed since it doesn't support Turbopack (Next.js 16 default)
  turbopack: {},

  async headers() {
    return [
      {
        // Apply security headers only to HTML pages — exclude service workers,
        // static assets, API routes, and manifest to avoid breaking OneSignal/PWA.
        source: '/((?!_next|api|.*\\.js|.*\\.json|.*\\.css|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico|.*\\.webp|.*\\.woff2?|.*\\.ttf|.*\\.vcf).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
