import { redirect } from "next/navigation";
import { getAuthorizedAccess } from "@/lib/auth-guard";
import DashboardShell from "@/app/components/DashboardShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAuthorizedAccess();
  if (!access.isAdmin) redirect("/dashboard");
  return <DashboardShell isAdmin company={null}>{children}</DashboardShell>;
}
