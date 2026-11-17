import { hasPaidSubscription, type AccessSubscription } from "./subscription-access.ts";

export type PrintKitAccessFacts = {
  user: { id: string; email_confirmed_at?: string | null } | null;
  approvedCompanyIds: readonly string[];
  membership: { user_id: string; company_id: string; company: { id: string } | null } | null;
  subscription: AccessSubscription | null;
};

/** The print endpoint never accepts a tenant ID or grants an admin bypass. */
export function decidePrintKitAccess(facts: PrintKitAccessFacts, now = Date.now()): "allowed" | "unauthenticated" | "unconfirmed" | "not_approved" | "no_membership" | "subscription_required" {
  if (!facts.user) return "unauthenticated";
  if (!facts.user.email_confirmed_at) return "unconfirmed";
  if (!facts.approvedCompanyIds.length) return "not_approved";
  const member = facts.membership;
  if (!member || member.user_id !== facts.user.id || !member.company || member.company.id !== member.company_id || !facts.approvedCompanyIds.includes(member.company_id)) return "no_membership";
  return hasPaidSubscription(facts.subscription, now) ? "allowed" : "subscription_required";
}
