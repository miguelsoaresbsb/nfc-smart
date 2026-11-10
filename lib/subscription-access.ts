export type AccessSubscription = { status: string; expires_at: string | null };

/** Unknown, malformed and elapsed billing state never grants a paid feature. */
export function hasPaidSubscription(subscription: AccessSubscription | null | undefined, now = Date.now()): boolean {
  if (!subscription || subscription.status !== "active") return false;
  if (!subscription.expires_at) return false;
  const expiry = Date.parse(subscription.expires_at);
  return Number.isFinite(expiry) && expiry > now;
}

export const paidDashboardPaths = [
  "/dashboard/editor", "/dashboard/actions", "/dashboard/analytics", "/dashboard/nfc", "/dashboard/qr-codes",
] as const;

export function isPaidDashboardPath(pathname: string): boolean {
  return paidDashboardPaths.some(path => pathname === path || pathname.startsWith(path + "/"));
}
