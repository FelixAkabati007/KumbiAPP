/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  // The v0 preview embeds localhost while loading Next static assets cross-origin.
  // Allow the preview hosts so CSS and client chunks are served instead of raw HTML.
  allowedDevOrigins: ["*.vercel.run", "*.v0.build"],
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  // Keep output file tracing stable when multiple lockfiles exist
  outputFileTracingRoot: process.cwd(),
  // Standalone tracing is for production builds; enabling it in dev can leave
  // the preview serving HTML while client chunks are still being rebuilt.
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,
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
        {
          key: "Content-Security-Policy-Report-Only",
          value: "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https:; frame-ancestors 'self';",
        },
      ],
    });

    return headerConfigs;
  },
};

export default nextConfig;
