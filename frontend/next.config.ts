import type { NextConfig } from "next";

const internalApiUrl = (process.env.INTERNAL_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep the dev badge clear of the sidebar account menu (bottom-left).
  devIndicators: { position: "bottom-right" },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${internalApiUrl}/:path*` }];
  },
};
export default nextConfig;
