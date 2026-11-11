"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { BarChart3, CreditCard, ExternalLink, LayoutDashboard, Link2, LockKeyhole, LogOut, Menu, Palette, Send, ShieldCheck, Wifi } from "lucide-react";
import { getPublicPageUrl } from "@/lib/public-url";
import { isPaidDashboardPath } from "@/lib/subscription-access";
import "./workspace.css";

const customerLinks = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/dashboard/editor", label: "Minha página", icon: Palette },
  { href: "/dashboard/actions", label: "Botões", icon: Link2 },
  { href: "/dashboard/analytics", label: "Resultados", icon: BarChart3 },
  { href: "/dashboard/nfc", label: "Compartilhar", icon: Send },
];

export default function DashboardShell({ children, isAdmin, company, hasPaidAccess = false }: {
  children: React.ReactNode; isAdmin: boolean; company: { name: string; slug: string } | null; hasPaidAccess?: boolean;
}) {
  const pathname = usePathname();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (accountMenu.current) accountMenu.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && accountMenu.current?.open) {
        accountMenu.current.open = false;
        accountMenu.current.querySelector("summary")?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (accountMenu.current?.open && event.target instanceof Node && !accountMenu.current.contains(event.target)) accountMenu.current.open = false;
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => { document.removeEventListener("keydown", closeOnEscape); document.removeEventListener("pointerdown", closeOutside); };
  }, []);
  const links = isAdmin ? [{ href: "/admin", label: "Administração", icon: ShieldCheck }] : customerLinks;
  const mobileLinks = !isAdmin && !hasPaidAccess ? [customerLinks[0], { href: "/dashboard/subscription", label: "Assinatura", icon: CreditCard }] : links;
  const current = [...links, { href: "/dashboard/subscription", label: "Assinatura" }].find(link => link.href === pathname)?.label || "Painel";

  return <div className="workspace-shell">
    <a href="#main-content" className="site-skip-link workspace-skip">Pular para o conteúdo</a>
    <aside className="workspace-sidebar">
      <Link href={isAdmin ? "/admin" : "/dashboard"} className="brand workspace-brand"><span className="brand-mark"><Wifi size={18}/></span><span>NFC<span>SMART</span></span></Link>
      <div className="workspace-account"><span>{isAdmin ? "ADMINISTRADOR" : "ESPAÇO DA EMPRESA"}</span><strong>{isAdmin ? "Central de controle" : company?.name || "Seu negócio"}</strong></div>
      <nav className="workspace-nav" id="workspace-navigation" aria-label="Menu do painel">
        {links.map(({ href, label, icon: Icon }) => {
          const locked = !isAdmin && !hasPaidAccess && isPaidDashboardPath(href);
          return <Link key={href} href={locked ? "/dashboard/subscription?required=1" : href} className={pathname === href ? "is-active" : ""} aria-current={pathname === href ? "page" : undefined} aria-label={locked ? label + " — assinatura necessária" : undefined}><Icon size={18} aria-hidden="true"/>{label}{locked && <LockKeyhole size={13} aria-hidden="true"/>}</Link>;
        })}
        {!isAdmin && <Link href="/dashboard/subscription" className={"workspace-billing" + (pathname === "/dashboard/subscription" ? " is-active" : "")} aria-current={pathname === "/dashboard/subscription" ? "page" : undefined}><CreditCard size={18} aria-hidden="true"/>Assinatura</Link>}
      </nav>
      <div className="workspace-sidebar-footer"><span>Um toque. Mais conexões.</span><form action="/auth/signout" method="post"><button type="submit"><LogOut size={16}/> Sair da conta</button></form></div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-topbar">
        <details className="workspace-account-menu" ref={accountMenu}>
          <summary aria-label="Opções da conta"><Menu size={21} aria-hidden="true"/><span>Conta</span></summary>
          <div className="workspace-account-popover">
            <p><small>{isAdmin ? "ADMINISTRADOR" : "SUA EMPRESA"}</small><strong>{isAdmin ? "Central de controle" : company?.name || "NFC SMART"}</strong></p>
            {!isAdmin && hasPaidAccess && <Link href="/dashboard/subscription"><CreditCard size={18} aria-hidden="true"/>Assinatura</Link>}
            <form action="/auth/signout" method="post"><button type="submit"><LogOut size={18} aria-hidden="true"/>Sair da conta</button></form>
          </div>
        </details>
        <div><span className="workspace-eyebrow">{isAdmin ? "NFC SMART · MASTER" : "SEU PAINEL"}</span><strong>{current}</strong></div>
        {company && hasPaidAccess && <a className="premium-btn workspace-public-link" href={getPublicPageUrl(company.slug)} target="_blank" rel="noopener noreferrer" aria-label="Ver página pública"><ExternalLink size={15}/><span>Ver página pública</span></a>}
        {isAdmin && <Link href="/" className="premium-btn workspace-public-link"><ExternalLink size={15}/>Ver site</Link>}
      </header>
      <div id="main-content" tabIndex={-1}>{children}</div>
    </div>
    <nav className="workspace-mobile-nav" aria-label="Menu do painel no celular" style={{ gridTemplateColumns: `repeat(${mobileLinks.length}, minmax(0, 1fr))` }}>
      {mobileLinks.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={pathname === href ? "is-active" : undefined}><Icon size={21} aria-hidden="true"/><span>{label}</span></Link>)}
    </nav>
  </div>;
}
