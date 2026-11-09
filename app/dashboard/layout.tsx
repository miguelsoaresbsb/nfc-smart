import { getAuthorizedAccess } from "@/lib/auth-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await getAuthorizedAccess();
  return <>{children}</>;
}
