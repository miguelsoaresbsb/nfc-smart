export const tagStatuses = ["personalization", "production", "delivery", "activated"] as const;
export type TagStatus = typeof tagStatuses[number];
export const tagStatusLabels: Record<TagStatus, string> = {
  personalization: "Personalização", production: "Em produção", delivery: "Em entrega", activated: "Ativada",
};
export type PhysicalTag = {
  id: string; serial: string; company_id: string | null; status: TagStatus;
  production_at: string | null; delivery_at: string | null; activated_at: string | null;
  archived_at: string | null; created_at: string; updated_at: string;
};
export type AdminPhysicalTag = PhysicalTag & { company_name: string | null; notes: string; total_count: number | string };
export type TagCompany = { id: string; name: string };
export function tagStatusOptions(current?: TagStatus): TagStatus[] {
  if (!current) return ["personalization"];
  const index = tagStatuses.indexOf(current);
  return tagStatuses.slice(index, index + 2);
}
export function tagDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
}
