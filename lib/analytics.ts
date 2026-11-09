export type AnalyticsEvent = {
  event_type: "page_view" | "action_click";
  action_id: string | null;
  created_at: string;
  session_id: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAnalyticsEvent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.companyId !== "string" || !UUID.test(body.companyId)) return null;
  if (body.eventType !== "page_view" && body.eventType !== "action_click") return null;
  if (body.actionId != null && (typeof body.actionId !== "string" || !UUID.test(body.actionId))) return null;
  if (body.eventType === "action_click" && !body.actionId) return null;
  if (body.eventType === "page_view" && body.actionId != null) return null;
  if (body.sessionId != null && (typeof body.sessionId !== "string" || body.sessionId.length > 120)) return null;
  return {
    company_id: body.companyId,
    event_type: body.eventType,
    action_id: body.actionId ?? null,
    session_id: body.sessionId || null,
  };
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});

export function analyticsDay(date: Date) {
  const parts = dayFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(x => x.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function analyticsWindow(now = new Date()) {
  // Noon UTC keeps date arithmetic within the same calendar day in Brasília.
  const last = new Date(`${analyticsDay(now)}T12:00:00Z`);
  const days: { key: string; label: string; views: number; clicks: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(last);
    date.setUTCDate(date.getUTCDate() - i);
    const key = date.toISOString().slice(0, 10);
    days.push({ key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, views: 0, clicks: 0 });
  }
  return { days, since: new Date(`${days[0].key}T00:00:00-03:00`).toISOString(), until: now.toISOString() };
}

export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  isActive: () => boolean = () => true,
): Promise<T[]> {
  const all: T[] = [];
  while (isActive()) {
    const { data, error } = await fetchPage(all.length, all.length + 499);
    if (error) throw new Error(error.message);
    if (!isActive()) return [];
    if (!data?.length) return all;
    // Continue even if a project has configured a row cap smaller than our page.
    all.push(...data);
  }
  return [];
}
