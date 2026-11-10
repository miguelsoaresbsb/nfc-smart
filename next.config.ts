import type { NextConfig } from "next";

const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://txqqmfvhdczppibaertz.supabase.co");
const development = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${supabaseUrl.origin} wss://${supabaseUrl.host}${development ? " ws: wss:" : ""}`,
  ...(development ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: "https", hostname: supabaseUrl.hostname, pathname: "/storage/v1/object/**" }] },
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), clipboard-read=(self), clipboard-write=(self)" },
        { key: "Content-Security-Policy", value: csp },
      ] },
      ...["/auth/:path*", "/api/auth/:path*", "/redefinir-senha", "/recuperar-senha"].map(source => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "Referrer-Policy", value: "no-referrer" }],
      })),
    ];
  },
};
export default nextConfig;
