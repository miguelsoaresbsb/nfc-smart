import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async headers() {
    return ["/auth/:path*", "/api/auth/:path*", "/redefinir-senha", "/recuperar-senha"].map(source => ({
      source,
      headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "Referrer-Policy", value: "no-referrer" }],
    }));
  },
};
export default nextConfig;
