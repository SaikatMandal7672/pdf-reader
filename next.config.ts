import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable x-powered-by header
  poweredByHeader: false,

  // Turbopack config (Next.js 16 default bundler)
  turbopack: {},

  // Fixes Google Fonts fetch failing in some build environments (Vercel)
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },

  // Configure headers for security
  async headers() {
    return [
      {
        source: "/api/files/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Disposition", value: "inline" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
