/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  // Keep output file tracing stable when multiple lockfiles exist
  outputFileTracingRoot: process.cwd(),
  output: "standalone",
  // Performance optimizations
  experimental: {
    webpackMemoryOptimizations: true,
  },
  images: {
    domains: ["scontent.facc5-2.fna.fbcdn.net", "images.unsplash.com"],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  },
  async headers() {
    const corsOrigin = process.env.CORS_ORIGIN;
    
    const headerConfigs = [];
    
    if (corsOrigin) {
      headerConfigs.push({
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: corsOrigin,
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      });
    }
    
    headerConfigs.push({
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ],
    });

    return headerConfigs;
  },
};

export default nextConfig;
