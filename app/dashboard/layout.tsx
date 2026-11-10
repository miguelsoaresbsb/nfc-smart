import { getAuthorizedAccess } from "@/lib/auth-guard";
import DashboardShell from "@/app/components/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const access = await getAuthorizedAccess();
  return <DashboardShell isAdmin={access.isAdmin} company={access.company ? { name: access.company.name, slug: access.company.slug } : null}>{children}</DashboardShell>;
}
