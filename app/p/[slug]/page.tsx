import { cache, type CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase-public";
import { uniquePublicActions } from "@/lib/action-duplicates";
import { publicActionTarget } from "@/lib/action-target";
import { getPublicPageUrl } from "@/lib/public-url";
import { PublicInteractions } from "./PublicInteractions";
import { PixAction } from "./PixAction";
import { ContactActions } from "./ContactActions";
import { WifiAction } from "./WifiAction";
import "./public-profile.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

// React cache deduplicates metadata/page reads within this request only. Every
// read uses anonymous RLS, so a signed-in owner's cookies never expose an unpaid page.
const loadPublicCompany = cache(async (slug: string) => {
  const { data, error } = await createPublicClient().from("companies").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error("Não foi possível carregar a página. Tente novamente.");
  return data;
});

const loadPublicProfile = cache(async (companyId: string) => {
  const { data, error } = await createPublicClient().from("profiles").select("*").eq("company_id", companyId).maybeSingle();
  if (error) throw new Error("Não foi possível carregar a página. Tente novamente.");
  return data;
});

function publicLogo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const image = new URL(value);
    return image.protocol === "https:" && !image.username && !image.password ? image.href : null;
  } catch { return null; }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const company = await loadPublicCompany(slug);
  if (!company) return {
    title: { absolute: "Página indisponível" },
    description: "Confira o endereço desta página.",
    robots: { index: false, follow: false },
    openGraph: { title: "Página indisponível", description: "Confira o endereço desta página.", images: [] },
    twitter: { card: "summary", title: "Página indisponível", description: "Confira o endereço desta página.", images: [] },
  };
  const profile = await loadPublicProfile(company.id);
  const title = String(profile?.display_name || company.name).trim();
  const description = String(profile?.tagline || company.description || `Contatos e serviços de ${title}, em um só lugar.`).trim().slice(0, 240);
  const image = publicLogo(company.logo_url);
  const images = image ? [{ url: image, alt: title }] : [];
  const url = getPublicPageUrl(company.slug);
  return {
    title: { absolute: title }, description, alternates: { canonical: url },
    openGraph: { title, description, url, siteName: title, locale: "pt_BR", type: "website", images },
    twitter: { card: "summary", title, description, images },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const c = await loadPublicCompany(slug);
  if (!c) notFound();
  const [p, actions] = await Promise.all([
    loadPublicProfile(c.id),
    createPublicClient().from("actions").select("*,qr_code:qr_codes!actions_pix_qr_code_id_fkey(image_url,name),wifi_qr_code:qr_codes!actions_wifi_qr_code_id_fkey(image_url,name)")
      .eq("company_id", c.id).eq("enabled", true).order("position").order("created_at"),
  ]);
  if (actions.error) throw new Error("Não foi possível carregar os botões. Tente novamente.");
  const availableActions = uniquePublicActions(actions.data || [], { phone: c.phone, whatsapp: c.whatsapp, phoneEnabled: c.phone_enabled, whatsappEnabled: c.whatsapp_enabled })
    .map(x => ({ ...x, target: x.type === "pix" || x.type === "wifi" ? null : publicActionTarget(x.type, x.url) }));
  const hasContacts = Boolean(
    (c.phone_enabled !== false && publicActionTarget("phone", c.phone || "")) ||
    (c.whatsapp_enabled !== false && publicActionTarget("whatsapp", c.whatsapp || "")),
  );
  return <main className="bio" style={{ "--bg": c.background_color, "--ink": c.text_color, "--secondary": c.secondary_text_color, "--primary": c.primary_color, "--button-text": c.button_text_color } as CSSProperties}>
    <PublicInteractions companyId={c.id}/>
    <section className="bio-card" aria-label={p?.display_name || c.name}>
      <div className="bio-cover" aria-hidden="true" style={{ backgroundImage: c.cover_url ? "url(" + c.cover_url + ")" : undefined }}/>
      <div className="bio-avatar">{c.logo_url ? <img src={c.logo_url} alt={c.name} width={112} height={112}/> : <span aria-hidden="true">{c.name[0]}</span>}</div>
      <h1>{p?.display_name || c.name}</h1>
      <p>{p?.tagline || c.description || ""}</p>
      <div className="bio-grid" aria-label="Contatos e serviços">
        <ContactActions phone={c.phone} whatsapp={c.whatsapp} phoneEnabled={c.phone_enabled} whatsappEnabled={c.whatsapp_enabled}/>
        {availableActions.map(x => x.type === "pix" ? <PixAction key={x.id} action={x}/> : x.type === "wifi" ? <WifiAction key={x.id} action={x}/> : x.target ?
          <a className="bio-action" key={x.id} href={x.target} target="_blank" rel="noopener noreferrer" data-action-id={x.id}>
            <span aria-hidden="true">{x.icon === "wa" ? "◉" : x.icon === "ig" ? "◎" : x.icon === "star" ? "★" : x.icon === "tel" ? "☎" : x.icon === "map" ? "⌖" : "↗"}</span><b>{x.label}</b><small aria-hidden="true">↗</small>
          </a> : null)}
      </div>
      {!availableActions.some(x=>x.type==="pix"||x.type==="wifi"||x.target)&&!hasContacts&&<div className="empty">Sua página ainda está sendo montada.</div>}
      <footer>NFC SMART · toque, abra, conecte.</footer>
    </section>
  </main>;
}
