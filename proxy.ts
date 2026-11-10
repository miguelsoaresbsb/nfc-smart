import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies, headers) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          const previousCookies = response.cookies.getAll();
          const previousHeaders = new Headers(response.headers);
          response = NextResponse.next({ request });
          previousCookies.forEach((cookie) => response.cookies.set(cookie));
          for (const header of ["cache-control", "expires", "pragma"]) {
            const value = previousHeaders.get(header);
            if (value) response.headers.set(header, value);
          }
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Refresh the session here; authorization is also enforced by the server layouts.
  const { data } = await supabase.auth.getClaims();
  const protectedRoute = request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/admin");
  if (!data?.claims?.sub && protectedRoute) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) redirect.headers.set(header, value);
    }
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/acesso-pendente", "/redefinir-senha"],
};
