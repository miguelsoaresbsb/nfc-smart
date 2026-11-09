import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { publicActionTarget } from "@/lib/action-target";
import { PublicInteractions } from "./PublicInteractions";
import { PixAction } from "./PixAction";
import { ContactActions } from "./ContactActions";
import { WifiAction } from "./WifiAction";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await createClient();
  const { data: c, error } = await sb.from("companies").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error("Não foi possível carregar a página. Tente novamente.");
  if (!c) notFound();
  const [profile, actions] = await Promise.all([
    sb.from("profiles").select("*").eq("company_id", c.id).maybeSingle(),
    sb.from("actions").select("*,qr_code:qr_codes!actions_pix_qr_code_id_fkey(image_url,name),wifi_qr_code:qr_codes!actions_wifi_qr_code_id_fkey(image_url,name)")
      .eq("company_id", c.id).eq("enabled", true).order("position").order("created_at"),
  ]);
  if (profile.error || actions.error) throw new Error("Não foi possível carregar os botões. Tente novamente.");
  const p = profile.data;
  const availableActions = (actions.data || []).map(x => ({ ...x, target: x.type === "pix" || x.type === "wifi" ? null : publicActionTarget(x.type, x.url) }));
  const hasContacts = (c.phone_enabled !== false && c.phone) || (c.whatsapp_enabled !== false && c.whatsapp);
  return <main className="bio" style={{ "--bg": c.background_color, "--ink": c.text_color, "--secondary": c.secondary_text_color, "--primary": c.primary_color, "--button-text": c.button_text_color } as CSSProperties}>
    <PublicInteractions companyId={c.id}/>
    <section className="bio-card">
      <div className="bio-cover" style={{ backgroundImage: c.cover_url ? "url(" + c.cover_url + ")" : undefined }}/>
      <div className="bio-avatar">{c.logo_url ? <img src={c.logo_url} alt={c.name}/> : c.name[0]}</div>
      <h1>{p?.display_name || c.name}</h1>
      <p>{p?.tagline || c.description || ""}</p>
      <div className="bio-grid">
        <ContactActions phone={c.phone} whatsapp={c.whatsapp} phoneEnabled={c.phone_enabled} whatsappEnabled={c.whatsapp_enabled}/>
        {availableActions.map(x => x.type === "pix" ? <PixAction key={x.id} action={x}/> : x.type === "wifi" ? <WifiAction key={x.id} action={x}/> : x.target ?
          <a className="bio-action" key={x.id} href={x.target} target="_blank" rel="noopener noreferrer" data-action-id={x.id}>
            <span>{x.icon === "wa" ? "◉" : x.icon === "ig" ? "◎" : x.icon === "star" ? "★" : x.icon === "tel" ? "☎" : x.icon === "map" ? "⌖" : "↗"}</span><b>{x.label}</b><small>↗</small>
          </a> : null)}
      </div>
      {!availableActions.some(x=>x.type==="pix"||x.type==="wifi"||x.target)&&!hasContacts&&<div className="empty">Sua página ainda está sendo montada.</div>}
      <footer>NFC SMART · toque, abra, conecte.</footer>
    </section>
  </main>;
}
