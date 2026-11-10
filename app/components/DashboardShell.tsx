"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, CreditCard, ExternalLink, LayoutDashboard, Link2, LogOut, Menu, Palette, Send, ShieldCheck, Wifi, X } from "lucide-react";
import { getPublicPageUrl } from "@/lib/public-url";
import "./workspace.css";

const customerLinks = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/dashboard/editor", label: "Minha página", icon: Palette },
  { href: "/dashboard/actions", label: "Botões", icon: Link2 },
  { href: "/dashboard/analytics", label: "Resultados", icon: BarChart3 },
  { href: "/dashboard/nfc", label: "Compartilhar", icon: Send },
];

export default function DashboardShell({ children, isAdmin, company }: {
  children: React.ReactNode; isAdmin: boolean; company: { name: string; slug: string } | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  const links = isAdmin ? [{ href: "/admin", label: "Administração", icon: ShieldCheck }] : customerLinks;
  const current = [...links, { href: "/dashboard/subscription", label: "Assinatura" }].find(link => link.href === pathname)?.label || "Painel";

  return <div className="workspace-shell">
    <a href="#workspace-content" className="workspace-skip">Pular para o conteúdo</a>
    <aside className={"workspace-sidebar" + (open ? " is-open" : "")}>
      <Link href={isAdmin ? "/admin" : "/dashboard"} className="brand workspace-brand" onClick={() => setOpen(false)}><span className="brand-mark"><Wifi size={18}/></span><span>NFC<span>SMART</span></span></Link>
      <div className="workspace-account"><span>{isAdmin ? "ADMINISTRADOR" : "ESPAÇO DA EMPRESA"}</span><strong>{isAdmin ? "Central de controle" : company?.name || "Seu negócio"}</strong></div>
      <nav className="workspace-nav" id="workspace-navigation" aria-label="Menu do painel">
        {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "is-active" : ""} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)}><Icon size={18}/>{label}</Link>)}
        {!isAdmin && <Link href="/dashboard/subscription" className={"workspace-billing" + (pathname === "/dashboard/subscription" ? " is-active" : "")} aria-current={pathname === "/dashboard/subscription" ? "page" : undefined} onClick={() => setOpen(false)}><CreditCard size={18}/>Assinatura</Link>}
      </nav>
      <div className="workspace-sidebar-footer"><span>Um toque. Mais conexões.</span><form action="/auth/signout" method="post"><button type="submit"><LogOut size={16}/> Sair da conta</button></form></div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-topbar">
        <button ref={menuButton} type="button" className="workspace-menu" aria-expanded={open} aria-controls="workspace-navigation" aria-label={open ? "Fechar menu" : "Abrir menu"} onClick={() => setOpen(value => !value)}>{open ? <X size={21}/> : <Menu size={21}/>}</button>
        <div><span className="workspace-eyebrow">{isAdmin ? "NFC SMART · MASTER" : "SEU PAINEL"}</span><strong>{current}</strong></div>
        {company && <a className="premium-btn workspace-public-link" href={getPublicPageUrl(company.slug)} target="_blank" rel="noopener noreferrer" aria-label="Ver página pública"><ExternalLink size={15}/><span>Ver página pública</span></a>}
        {isAdmin && <Link href="/" className="premium-btn workspace-public-link"><ExternalLink size={15}/>Ver site</Link>}
      </header>
      <div id="workspace-content" tabIndex={-1}>{children}</div>
    </div>
  </div>;
}
