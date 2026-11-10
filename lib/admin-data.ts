export type AccessRequest = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company_name: string;
  status: "pending" | "approved" | "rejected";
  user_id: string | null;
  company_id: string | null;
  created_at: string;
};

export type AdminCompany = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type AdminSubscription = {
  company_id: string;
  status: "pending" | "active" | "expired" | "canceled";
  plan: string;
  started_at: string | null;
  expires_at: string | null;
};

export type CompanyStatus = AdminSubscription["status"];
export type CompanyAccount = AdminCompany & {
  account: AccessRequest | null;
  subscription: AdminSubscription | null;
  status: CompanyStatus;
};

export function subscriptionStatus(subscription: AdminSubscription | null, now = Date.now()): CompanyStatus {
  if (!subscription) return "pending";
  if (subscription.status !== "active" || !subscription.expires_at) return subscription.status;
  const expires = new Date(subscription.expires_at).getTime();
  return !Number.isFinite(expires) || expires <= now ? "expired" : "active";
}

export function companyAccounts(
  companies: AdminCompany[], subscriptions: AdminSubscription[], requests: AccessRequest[], now = Date.now(),
): CompanyAccount[] {
  const byCompany = new Map(subscriptions.map(subscription => [subscription.company_id, subscription]));
  const accounts = new Map<string, AccessRequest>();
  for (const request of requests) {
    if (request.status !== "approved" || !request.company_id) continue;
    const prior = accounts.get(request.company_id);
    if (!prior || request.created_at > prior.created_at) accounts.set(request.company_id, request);
  }
  return companies.map(company => {
    const subscription = byCompany.get(company.id) || null;
    return { ...company, account: accounts.get(company.id) || null, subscription, status: subscriptionStatus(subscription, now) };
  });
}

function searchable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function matchesAdminSearch(query: string, values: (string | null | undefined)[]) {
  const terms = searchable(query.trim()).split(/\s+/).filter(Boolean);
  const text = searchable(values.filter(Boolean).join(" "));
  return terms.every(term => text.includes(term));
}

export function adminDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Data indisponível";
}
