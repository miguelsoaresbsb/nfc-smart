"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ExternalLink, ImagePlus, LoaderCircle, Palette, Save, Smartphone, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

type FormState = {
  name: string; description: string; bg: string; primary: string; text: string;
  secondary: string; buttonText: string; logo: string; cover: string;
  phone: string; whatsapp: string; phoneEnabled: boolean; whatsappEnabled: boolean;
};
type PreviewAction = { id: string; label: string; enabled: boolean };

const initial: FormState = {
  name: "", description: "", bg: "#f6f6f3", primary: "#111111", text: "#111111",
  secondary: "#777777", buttonText: "#ffffff", logo: "", cover: "",
  phone: "", whatsapp: "", phoneEnabled: true, whatsappEnabled: true,
};

const pageTemplates = [
  { id: "clean", name: "Minimalista", note: "Claro e sofisticado", colors: { bg: "#F7F7F4", primary: "#171717", text: "#171717", secondary: "#737373", buttonText: "#FFFFFF" } },
  { id: "dark", name: "Elegante", note: "Escuro e premium", colors: { bg: "#111318", primary: "#D6B77A", text: "#F7F4ED", secondary: "#B5B1A8", buttonText: "#171717" } },
  { id: "nature", name: "Natural", note: "Leve e acolhedor", colors: { bg: "#F1F4EC", primary: "#49634D", text: "#26382A", secondary: "#718071", buttonText: "#FFFFFF" } },
  { id: "warm", name: "Vibrante", note: "Destaque sua marca", colors: { bg: "#FFF7F0", primary: "#E66B3D", text: "#29201D", secondary: "#806D65", buttonText: "#FFFFFF" } },
];

export default function Editor() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [id, setId] = useState("");
  const [f, setF] = useState<FormState>(initial);
  const [actions, setActions] = useState<PreviewAction[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | "">("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: member, error: memberError } = await sb
        .from("company_members").select("company_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (memberError || !member) { router.push("/acesso-pendente"); return; }
      const companyId = member.company_id;
      const [companyResult, actionResult] = await Promise.all([
        sb.from("companies").select("*").eq("id", companyId).single(),
        sb.from("actions").select("id,label,enabled").eq("company_id", companyId).order("position"),
      ]);
      if (!alive) return;
      if (companyResult.error || !companyResult.data) {
        setMsg(companyResult.error?.message || "Não foi possível carregar a empresa.");
        setLoading(false);
        return;
      }
      const c = companyResult.data;
      setId(companyId);
      setF({
        name: c.name || "", description: c.description || "",
        bg: c.background_color || "#f6f6f3", primary: c.primary_color || "#111111",
        text: c.text_color || "#111111", secondary: c.secondary_text_color || "#777777",
        buttonText: c.button_text_color || "#ffffff", logo: c.logo_url || "",
        cover: c.cover_url || "", phone: c.phone || "", whatsapp: c.whatsapp || "",
        phoneEnabled: c.phone_enabled !== false, whatsappEnabled: c.whatsapp_enabled !== false,
      });
      setActions((actionResult.data || []) as PreviewAction[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [router, sb]);

  async function upload(file: File | undefined, key: "logo" | "cover") {
    if (!file || !id) return;
    setMsg("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMsg("Formato inválido. Use PNG, JPG ou WEBP."); return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setMsg("A imagem deve ter no máximo 6 MB."); return;
    }
    setUploading(key);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
    const path = id + "/" + key + "-" + crypto.randomUUID() + "-" + safeName;
    const result = await sb.storage.from("company-assets").upload(path, file, {
      upsert: false, contentType: file.type, cacheControl: "3600",
    });
    if (result.error) setMsg(result.error.message);
    else {
      const url = sb.storage.from("company-assets").getPublicUrl(path).data.publicUrl;
      setF((current) => ({ ...current, [key]: url }));
      setMsg("Imagem enviada. Salve as alterações para publicar.");
    }
    setUploading("");
  }

  async function save() {
    if (!id || saving) return;
    if (!f.name.trim()) { setMsg("Informe o nome da empresa."); return; }
    setSaving(true); setMsg("");
    const company = await sb.from("companies").update({
      name: f.name.trim(), description: f.description.trim(),
      background_color: f.bg, primary_color: f.primary, text_color: f.text,
      secondary_text_color: f.secondary, button_text_color: f.buttonText,
      logo_url: f.logo || null, cover_url: f.cover || null,
      phone: f.phone.trim() || null, whatsapp: f.whatsapp.trim() || null,
      phone_enabled: f.phoneEnabled, whatsapp_enabled: f.whatsappEnabled,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (company.error) { setMsg(company.error.message); setSaving(false); return; }
    const profile = await sb.from("profiles").upsert({
      company_id: id, display_name: f.name.trim(), avatar_url: f.logo || null,
      secondary_image_url: f.cover || null, updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" });
    setMsg(profile.error ? profile.error.message : "Alterações salvas com sucesso.");
    setSaving(false);
  }

  const set = (key: keyof FormState, value: string | boolean) =>
    setF((current) => ({ ...current, [key]: value }));

  return (
    <main className="premium-shell editor-premium">
      <header className="premium-nav">
        <Link href="/dashboard" className="brand"><span className="brand-mark"><Wifi size={17}/></span><span>NFC<span>SMART</span></span></Link>
        <div className="editor-nav-actions">
          <Link href="/dashboard" className="premium-btn"><ArrowLeft size={15}/> Painel</Link>
          <button className="premium-btn premium-btn-dark" onClick={save} disabled={saving || loading || !id}>
            {saving ? <LoaderCircle size={15} className="spin"/> : <Save size={15}/>} {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </header>

      <section className="subpage editor-subpage">
        <div className="section-kicker"><span className="live-dot"/> PERSONALIZAÇÃO</div>
        <div className="hub-title"><div><h1>Sua marca. <span>Seu primeiro impacto.</span></h1><p>Configure como sua empresa será apresentada quando alguém aproximar o celular da sua TAG ou ler seu QR Code.</p></div></div>
        {msg && <div className="editor-message" role="status">{msg}</div>}
        {loading ? <div className="editor-loading"><LoaderCircle className="spin"/> Carregando seu perfil...</div> : (
          <div className="editor-premium-layout">
            <div className="editor-controls">
              <section className="editor-section">
                <div className="editor-section-heading"><span>00</span><div><b>Modelos de página</b><small>Escolha uma base visual. Você pode ajustar cada cor depois.</small></div></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10}}>
                  {pageTemplates.map((template) => (
                    <button key={template.id} type="button" onClick={() => setF(current => ({...current,...template.colors}))}
                      style={{textAlign:"left",padding:12,border:"1px solid #e7e7e2",borderRadius:14,background:"#fff",display:"grid",gap:9}}>
                      <span style={{height:54,borderRadius:9,background:template.colors.bg,border:"1px solid #e7e7e2",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                        <i style={{width:25,height:7,borderRadius:8,background:template.colors.primary}}/>
                        <i style={{width:35,height:7,borderRadius:8,background:template.colors.text,opacity:.75}}/>
                        <i style={{width:19,height:19,borderRadius:6,background:template.colors.primary}}/>
                      </span>
                      <span style={{display:"grid",gap:2}}><b style={{fontSize:13,color:"#171717"}}>{template.name}</b><small style={{fontSize:11,color:"#777"}}>{template.note}</small></span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="editor-section">
                <div className="editor-section-heading"><span>01</span><div><b>Informações da empresa</b><small>Apresente sua marca com clareza.</small></div></div>
                <label className="premium-field">Nome da empresa<input value={f.name} maxLength={80} onChange={e=>set("name",e.target.value)} placeholder="Ex.: Lux Tintas"/></label>
                <label className="premium-field">Descrição<textarea value={f.description} maxLength={240} onChange={e=>set("description",e.target.value)} placeholder="Conte em poucas palavras o que sua empresa oferece."/></label>
                <div className="editor-char-count">{f.description.length}/240 caracteres</div>
              </section>

              <section className="editor-section">
                <div className="editor-section-heading"><span>02</span><div><b>Fotografia e identidade</b><small>Imagens nítidas deixam a página mais confiável.</small></div></div>
                <div className="editor-upload-grid">
                  <UploadField title="Foto de perfil" hint="PNG, JPG ou WEBP · até 6 MB" image={f.logo} round onChange={file=>upload(file,"logo")} uploading={uploading==="logo"}/>
                  <UploadField title="Imagem de capa" hint="PNG, JPG ou WEBP · até 6 MB" image={f.cover} onChange={file=>upload(file,"cover")} uploading={uploading==="cover"}/>
                </div>
              </section>

              <section className="editor-section">
                <div className="editor-section-heading"><span>03</span><div><b>Paleta de cores</b><small>Use cores com contraste e consistência.</small></div></div>
                <div className="premium-color-grid">
                  <ColorField title="Fundo" value={f.bg} onChange={v=>set("bg",v)}/>
                  <ColorField title="Texto principal" value={f.text} onChange={v=>set("text",v)}/>
                  <ColorField title="Texto secundário" value={f.secondary} onChange={v=>set("secondary",v)}/>
                  <ColorField title="Botões" value={f.primary} onChange={v=>set("primary",v)}/>
                  <ColorField title="Texto dos botões" value={f.buttonText} onChange={v=>set("buttonText",v)}/>
                </div>
              </section>

              <section className="editor-section">
                <div className="editor-section-heading"><span>04</span><div><b>Formas de contato</b><small>Escolha quais contatos aparecem no perfil.</small></div></div>
                <label className="premium-field">Telefone<input value={f.phone} onChange={e=>set("phone",e.target.value)} placeholder="(61) 99999-9999"/></label>
                <Toggle checked={f.phoneEnabled} onChange={v=>set("phoneEnabled",v)} title="Exibir opção de ligação"/>
                <label className="premium-field">WhatsApp<input value={f.whatsapp} onChange={e=>set("whatsapp",e.target.value)} placeholder="5561999999999"/></label>
                <Toggle checked={f.whatsappEnabled} onChange={v=>set("whatsappEnabled",v)} title="Exibir botão do WhatsApp"/>
              </section>
              <button className="premium-btn premium-btn-dark editor-save-bottom" onClick={save} disabled={saving || !id}>
                {saving ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>} {saving ? "Salvando..." : "Salvar e atualizar página"}
              </button>
            </div>

            <aside className="editor-preview-column">
              <div className="editor-preview-heading"><span><Smartphone size={15}/> PRÉ-VISUALIZAÇÃO</span><small>Atualiza enquanto você edita</small></div>
              <div className="editor-device">
                <div className="editor-device-top"><i/><i/><i/></div>
                <div className="editor-live-preview" style={{background:f.bg,color:f.text}}>
                  <div className="editor-preview-cover" style={f.cover?{backgroundImage:"url("+f.cover+")"}:{}}/>
                  <div className="editor-preview-avatar" style={{borderColor:f.bg}}>{f.logo?<img src={f.logo} alt="Foto da empresa"/>:f.name.slice(0,1).toUpperCase()||"N"}</div>
                  <h3>{f.name||"Nome da empresa"}</h3>
                  <p>{f.description||"A descrição da sua empresa aparecerá aqui."}</p>
                  <div className="editor-preview-actions">
                    {f.phoneEnabled&&f.phone&&<PreviewButton label="Ligar" bg={f.primary} color={f.buttonText}/>}
                    {f.whatsappEnabled&&f.whatsapp&&<PreviewButton label="WhatsApp" bg={f.primary} color={f.buttonText}/>}
                    {actions.filter(a=>a.enabled).map(a=><PreviewButton key={a.id} label={a.label} bg={f.primary} color={f.buttonText}/>)}
                    {!f.phone&&!f.whatsapp&&!actions.some(a=>a.enabled)&&<span className="editor-preview-empty">Suas ações aparecerão aqui após configuradas.</span>}
                  </div>
                  <small className="editor-preview-footer">NFC SMART · toque, abra, conecte.</small>
                </div>
              </div>
              <Link href="/dashboard/actions" className="editor-manage-actions">Gerenciar botões e ações <ExternalLink size={14}/></Link>
              <p className="editor-preview-tip"><Palette size={15}/> Dica: mantenha contraste suficiente entre o fundo, os textos e os botões para facilitar a leitura.</p>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function UploadField({title,hint,image,round,onChange,uploading}:{title:string;hint:string;image:string;round?:boolean;onChange:(file:File|undefined)=>void;uploading:boolean}) {
  return <label className="editor-upload-field"><span className={"editor-upload-preview "+(round?"round":"")}>{image?<img src={image} alt={title}/>:<ImagePlus size={22}/>}</span><b>{title}</b><small>{hint}</small><span className="premium-btn">{uploading?<LoaderCircle size={14} className="spin"/>:<ImagePlus size={14}/>} {uploading?"Enviando...":"Escolher imagem"}</span><input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={uploading} onChange={(e:ChangeEvent<HTMLInputElement>)=>{onChange(e.target.files?.[0]);e.currentTarget.value="";}}/></label>;
}
function ColorField({title,value,onChange}:{title:string;value:string;onChange:(value:string)=>void}) {
  return <label className="premium-color-field"><span>{title}</span><input type="color" value={value} onChange={e=>onChange(e.target.value)}/><code>{value.toUpperCase()}</code></label>;
}
function Toggle({checked,onChange,title}:{checked:boolean;onChange:(value:boolean)=>void;title:string}) {
  return <label className="editor-toggle"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span className="editor-toggle-track"/><b>{title}</b></label>;
}
function PreviewButton({label,bg,color}:{label:string;bg:string;color:string}) {
  return <span className="editor-preview-button" style={{background:bg,color}}>{label}</span>;
}
