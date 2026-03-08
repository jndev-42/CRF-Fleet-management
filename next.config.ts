import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force transpilation of packages that use modern JS syntax (?.  ??) — needed for iOS 12
  transpilePackages: ['react-onesignal', 'next-themes', 'next-auth', '@auth/core'],

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
