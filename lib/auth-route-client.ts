import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/** Route handlers must forward both refreshed cookies and the SSR cache headers. */
export function createAuthRouteClient(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
  function redirect(path: string, status: 303 | 307 = 303) {
    const result = NextResponse.redirect(new URL(path, request.url), status);
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) result.headers.set(header, value);
    }
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  }
  return { supabase, redirect };
}
