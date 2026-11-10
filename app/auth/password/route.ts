import { NextRequest } from "next/server";
import { createAuthRouteClient } from "@/lib/auth-route-client";
import { RECOVERY_COOKIE, finishPasswordRecovery, isSameAuthOrigin } from "@/lib/auth-recovery";
import { readLimitedBody } from "@/supabase/functions/_shared/request-body";

export async function POST(request: NextRequest) {
  const { supabase, json } = createAuthRouteClient(request);
  if (!isSameAuthOrigin(request.headers.get("origin"), request.headers.get("host") || request.nextUrl.host, request.nextUrl.protocol)) return json({ error: "Solicitação inválida. Atualize a página." }, 403);
  let body: { password?: unknown; confirmation?: unknown };
  const read = await readLimitedBody(request, 2048);
  if (read.error) return json({ error: "Solicitação inválida." }, read.status);
  try {
    body = JSON.parse(read.body!);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Solicitação inválida." }, 400);
  } catch { return json({ error: "Solicitação inválida." }, 400); }
  try {
    const result = await finishPasswordRecovery(supabase.auth, request.cookies.get(RECOVERY_COOKIE)?.value, body.password, body.confirmation);
    const response = json(result.body, result.status);
    if (result.clearIntent) response.cookies.delete(RECOVERY_COOKIE);
    return response;
  } catch { return json({ error: "Não foi possível atualizar sua senha. Verifique a conexão e tente novamente." }, 503); }
}
