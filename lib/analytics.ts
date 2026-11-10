export type ContactType = "phone" | "whatsapp" | "phone_copy";
export type AnalyticsEvent = {
  event_type: "page_view" | "action_click";
  action_id: string | null;
  contact_type?: ContactType | null;
  created_at: string;
  session_id: string | null;
};
export type AnalyticsPeriod = 7 | 30 | 90;
export type AnalyticsStats = { views: number; clicks: number; unique: number };
export type AnalyticsPoint = { key: string; label: string; views: number; clicks: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const contacts = new Set(["phone", "whatsapp", "phone_copy"]);
export const contactLabels: Record<ContactType, string> = {
  phone: "Ligar", whatsapp: "WhatsApp (contato)", phone_copy: "Copiar telefone",
};

export function parseAnalyticsEvent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.companyId !== "string" || !UUID.test(body.companyId)) return null;
  if (body.eventType !== "page_view" && body.eventType !== "action_click") return null;
  if (body.actionId != null && (typeof body.actionId !== "string" || !UUID.test(body.actionId))) return null;
  if (body.contactType != null && (typeof body.contactType !== "string" || !contacts.has(body.contactType))) return null;
  if (body.eventType === "action_click" && Boolean(body.actionId) === Boolean(body.contactType)) return null;
  if (body.eventType === "page_view" && (body.actionId != null || body.contactType != null)) return null;
  if (body.sessionId != null && (typeof body.sessionId !== "string" || body.sessionId.length > 120)) return null;
  return {
    company_id: body.companyId,
    event_type: body.eventType,
    action_id: body.actionId ?? null,
    session_id: body.sessionId || null,
    ...(body.contactType ? { contact_type: body.contactType as ContactType } : {}),
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

export function analyticsWindow(now = new Date(), period: AnalyticsPeriod = 30) {
  const last = new Date(`${analyticsDay(now)}T12:00:00Z`);
  const days: AnalyticsPoint[] = [];
  for (let i = period - 1; i >= 0; i--) {
    const date = new Date(last);
    date.setUTCDate(date.getUTCDate() - i);
    const key = date.toISOString().slice(0, 10);
    days.push({ key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, views: 0, clicks: 0 });
  }
  const since = new Date(`${days[0].key}T00:00:00-03:00`);
  const offset = period * 86400000;
  return {
    days, since: since.toISOString(), until: now.toISOString(),
    previousSince: new Date(since.getTime() - offset).toISOString(),
    previousUntil: new Date(now.getTime() - offset).toISOString(),
  };
}

export function summarizeAnalytics(events: AnalyticsEvent[], since: string, until: string): AnalyticsStats {
  const start = new Date(since).getTime(), end = new Date(until).getTime();
  const inRange = (event: AnalyticsEvent) => { const time = new Date(event.created_at).getTime(); return time >= start && time <= end; };
  const views = events.filter(event => event.event_type === "page_view" && inRange(event));
  const clicks = events.filter(event => event.event_type === "action_click" && inRange(event));
  return { views: views.length, clicks: clicks.length, unique: new Set(views.map(event => event.session_id).filter(Boolean)).size };
}

export function analyticsChange(current: number, previous: number): string {
  if (!previous) return current ? "Primeiros registros neste período" : "Sem atividade nos dois períodos";
  const percent = ((current - previous) / previous) * 100;
  if (!percent) return "Mesmo resultado do período anterior";
  return `${Math.abs(percent).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ${percent > 0 ? "a mais" : "a menos"} que no período anterior`;
}

export function analyticsMonthly(days: AnalyticsPoint[]): AnalyticsPoint[] {
  const result = new Map<string, AnalyticsPoint>();
  for (const day of days) {
    const key = day.key.slice(0, 7);
    const existing = result.get(key) || { key, label: `${key.slice(5, 7)}/${key.slice(2, 4)}`, views: 0, clicks: 0 };
    existing.views += day.views; existing.clicks += day.clicks;
    result.set(key, existing);
  }
  return Array.from(result.values());
}

export function analyticsInsight(stats: AnalyticsStats, topLabel?: string): string {
  if (!stats.views && !stats.clicks) return "Compartilhe o link da sua página ou aproxime um celular da plaquinha para começar a acompanhar os resultados.";
  if (stats.views && !stats.clicks) return "Sua página já recebe visitas. Revise os nomes e a ordem dos botões para deixar o próximo passo claro para o cliente.";
  if (!stats.views) return "Há cliques registrados, mas nenhuma abertura neste intervalo. Bloqueadores e páginas já abertas podem afetar a contagem.";
  return topLabel ? `${topLabel} foi o botão mais utilizado neste período. Mantenha esse acesso fácil de encontrar na sua página.`
    : "Acompanhe os botões mais utilizados para decidir quais conexões merecem destaque na página.";
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
    all.push(...data);
  }
  return [];
}
