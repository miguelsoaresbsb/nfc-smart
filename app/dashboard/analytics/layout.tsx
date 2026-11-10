import { requirePaidAccess } from "@/lib/auth-guard";

export default async function PaidFeatureLayout({ children }: { children: React.ReactNode }) {
  await requirePaidAccess();
  return <>{children}</>;
}
