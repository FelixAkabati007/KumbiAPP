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
    isrMemoryCacheSize: 52 * 1024 * 1024,
    webpackMemoryOptimizations: true,
    optimizePackageImports: ["@/components/ui", "@/lib"],
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
    
    return headerConfigs;
  },
};

export default nextConfig;
