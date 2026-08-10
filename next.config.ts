import type { NextConfig } from "next";
import { version } from './package.json';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  // Force transpilation of packages that use modern JS syntax (?.  ??) — needed for iOS 12
  transpilePackages: ['react-onesignal', 'next-themes', 'next-auth', '@auth/core'],

  // @react-pdf/renderer uses Node.js internals — prevent Next.js from bundling it
  serverExternalPackages: ['@react-pdf/renderer'],

  experimental: {
    serverActions: {
      bodySizeLimit: '150mb',
    },
  },

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
