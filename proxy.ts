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
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const isProtected = request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/admin");

  if (!isProtected) return response;
  if (!data?.claims?.sub) return NextResponse.redirect(new URL("/login", request.url));

  const { data: admin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", data.claims.sub)
    .maybeSingle();

  if (admin) return response;

  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  const { data: access } = await supabase
    .from("access_requests")
    .select("status")
    .eq("email", email.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (access?.status !== "approved") {
    return NextResponse.redirect(new URL("/acesso-pendente", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
