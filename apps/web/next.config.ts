import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@gira/shared"],
  poweredByHeader: false,
  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) throw new Error("Falta NEXT_PUBLIC_API_URL: la CSP necesita el origen de la API.");
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({ apiUrl, isProd: process.env.NODE_ENV === "production" }),
      },
    ];
  },
};

export default nextConfig;
