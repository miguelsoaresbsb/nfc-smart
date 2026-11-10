import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { authRequestOrigin } from "@/lib/auth-recovery";

/** Route handlers must forward both refreshed cookies and the SSR cache headers. */
export function createAuthRouteClient(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { secure: request.nextUrl.protocol === "https:", sameSite: "lax" },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies, headers) => {
          cookies.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );
  function forward(result: NextResponse) {
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) result.headers.set(header, value);
    }
    result.headers.set("Cache-Control", "private, no-store");
    result.headers.set("Referrer-Policy", "no-referrer");
    return result;
  }
  function redirect(path: string, status: 303 | 307 = 303) {
    const origin = authRequestOrigin(request.headers.get("host"), request.nextUrl.protocol, request.nextUrl.origin);
    return forward(NextResponse.redirect(new URL(path, origin), status));
  }
  function json(body: Record<string, unknown>, status = 200) {
    return forward(NextResponse.json(body, { status }));
  }
  return { supabase, redirect, json };
}
