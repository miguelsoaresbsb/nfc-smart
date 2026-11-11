"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, ImagePlus, LoaderCircle, Palette, Save, Smartphone, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { applySegmentDraft, getSegmentTemplate, missingTemplateActions, segmentTemplates } from "@/lib/segment-templates";
import "../segment-templates.css";

type FormState = {
  name: string; description: string; bg: string; primary: string; text: string;
  secondary: string; buttonText: string; logo: string; cover: string;
  phone: string; whatsapp: string; phoneEnabled: boolean; whatsappEnabled: boolean;
};
type PreviewAction = { id: string; type: string; label: string; enabled: boolean };

const initial: FormState = {
  name: "", description: "", bg: "#f6f6f3", primary: "#111111", text: "#111111",
  secondary: "#777777", buttonText: "#ffffff", logo: "", cover: "",
  phone: "", whatsapp: "", phoneEnabled: true, whatsappEnabled: true,
};

export default function Editor() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [id, setId] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [f, setF] = useState<FormState>(initial);
  const [actions, setActions] = useState<PreviewAction[]>([]);
  const [actionsReady, setActionsReady] = useState(false);
  const [msg, setMsg] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [nameError, setNameError] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const [savedState, setSavedState] = useState("");
  const [selectedSegment, setSelectedSegment] = useState("");
  const [replaceDescription, setReplaceDescription] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | "">("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: member, error: memberError } = await sb
        .from("company_members").select("company_id,role").eq("user_id", user.id).limit(1).maybeSingle();
      if (memberError || !member) { router.push("/acesso-pendente"); return; }
      const companyId = member.company_id;
      const [companyResult, actionResult] = await Promise.all([
        sb.from("companies").select("*").eq("id", companyId).single(),
        sb.from("actions").select("id,type,label,enabled").eq("company_id", companyId).order("position"),
      ]);
      if (!alive) return;
      if (companyResult.error || !companyResult.data) {
        setMessageError(true); setMsg("Não foi possível carregar a empresa. Atualize a página para tentar novamente.");
        setLoading(false);
        return;
      }
      const c = companyResult.data;
      setId(companyId);
      setCanEdit(["owner", "admin", "editor"].includes(member.role));
      const loadedForm: FormState = {
        name: c.name || "", description: c.description || "",
        bg: c.background_color || "#f6f6f3", primary: c.primary_color || "#111111",
        text: c.text_color || "#111111", secondary: c.secondary_text_color || "#777777",
        buttonText: c.button_text_color || "#ffffff", logo: c.logo_url || "",
        cover: c.cover_url || "", phone: c.phone || "", whatsapp: c.whatsapp || "",
        phoneEnabled: c.phone_enabled !== false, whatsappEnabled: c.whatsapp_enabled !== false,
      };
      setF(loadedForm);
      const matchingTemplate = segmentTemplates.find(template => Object.entries(template.colors)
        .every(([key, value]) => loadedForm[key as keyof FormState].toString().toLowerCase() === value.toLowerCase()));
      setSelectedSegment(matchingTemplate?.id || "");
      setSavedState(JSON.stringify(loadedForm));
      setActions((actionResult.data || []) as PreviewAction[]);
      setActionsReady(!actionResult.error);
      if (actionResult.error) { setMessageError(true); setMsg("Seu perfil foi carregado, mas a lista de botões está indisponível. Atualize a página antes de configurar os botões."); }
      setLoading(false);
    })().catch(() => {
      if (alive) { setMessageError(true); setMsg("Não foi possível carregar seu perfil. Atualize a página para tentar novamente."); setLoading(false); }
    });
    return () => { alive = false; };
  }, [router, sb]);

  async function upload(file: File | undefined, key: "logo" | "cover") {
    if (!file || !id || uploading || saving || !canEdit) return;
    setMsg(""); setMessageError(false);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessageError(true); setMsg("Formato inválido. Escolha uma imagem PNG, JPG ou WEBP."); return;
    }
    if (!file.size || file.size > 6 * 1024 * 1024) { setMessageError(true); setMsg("Escolha uma imagem válida de até 6 MB."); return; }
    setUploading(key);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
      const path = id + "/" + key + "-" + crypto.randomUUID() + "-" + safeName;
      const result = await sb.storage.from("company-assets").upload(path, file, {
        upsert: false, contentType: file.type, cacheControl: "3600",
      });
      if (result.error) throw new Error("Não foi possível enviar a imagem. Verifique sua conexão e tente novamente.");
      const url = sb.storage.from("company-assets").getPublicUrl(path).data.publicUrl;
      setF(current => ({ ...current, [key]: url }));
      setMsg("Imagem enviada. Salve as alterações para publicar.");
    } catch (error) {
      setMessageError(true); setMsg(error instanceof Error ? error.message : "Não foi possível enviar a imagem. Tente novamente.");
    } finally { setUploading(""); }
  }

  async function save() {
    if (!id || saving || uploading || !canEdit) return;
    if (!f.name.trim()) { setNameError(true); setMessageError(true); setMsg("Informe o nome da empresa antes de salvar."); nameInput.current?.focus(); return; }
    setNameError(false); setSaving(true); setMsg(""); setMessageError(false);
    const draft = { ...f };
    try {
      const company = await sb.from("companies").update({
        name: draft.name.trim(), description: draft.description.trim(),
        background_color: draft.bg, primary_color: draft.primary, text_color: draft.text,
        secondary_text_color: draft.secondary, button_text_color: draft.buttonText,
        logo_url: draft.logo || null, cover_url: draft.cover || null,
        phone: draft.phone.trim() || null, whatsapp: draft.whatsapp.trim() || null,
        phone_enabled: draft.phoneEnabled, whatsapp_enabled: draft.whatsappEnabled,
        updated_at: new Date().toISOString(),
      }).eq("id", id).select("id").single();
      if (company.error) throw new Error("Não foi possível salvar a página. Suas alterações continuam na prévia para tentar novamente.");
      const profile = await sb.from("profiles").upsert({
        company_id: id, display_name: draft.name.trim(), tagline: draft.description.trim() || null,
        avatar_url: draft.logo || null, secondary_image_url: draft.cover || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id" });
      if (profile.error) throw new Error("Os dados da empresa foram salvos, mas a publicação do perfil não foi concluída. Clique em Salvar alterações para tentar novamente.");
      setSavedState(JSON.stringify(draft));
      setMsg("Alterações salvas. Sua página pública está atualizada.");
    } catch (error) {
      setMessageError(true); setMsg(error instanceof Error ? error.message : "Não foi possível salvar. Suas alterações continuam na prévia para tentar novamente.");
    } finally { setSaving(false); }
  }

  const selectedTemplate = getSegmentTemplate(selectedSegment);
  const suggestedActions = selectedTemplate && actionsReady ? missingTemplateActions(selectedTemplate, actions, f) : [];
  const dirty = Boolean(savedState && savedState !== JSON.stringify(f));
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const confirmInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, window.location.href);
      // Scrolling to the preview and opening another tab keep the current draft.
      // Full navigations outside the app are covered by beforeunload below.
      if (destination.origin !== window.location.origin || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      if (!window.confirm("Suas alterações ainda não foram salvas. Sair sem salvar?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    document.addEventListener("click", confirmInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      document.removeEventListener("click", confirmInternalNavigation, true);
    };
  }, [dirty]);
  useEffect(() => { if (msg && messageError && !nameError) feedback.current?.focus(); }, [msg, messageError, nameError]);

  function applyTemplate() {
    if (!selectedTemplate || saving || uploading || !canEdit) return;
    setF(current => applySegmentDraft(current, selectedTemplate, replaceDescription));
    setMessageError(false);
    setReplaceDescription(false);
    setMsg("Modelo " + selectedTemplate.name + " aplicado à prévia. Revise e salve para publicar. Seus contatos, imagens e botões foram preservados.");
  }

  const set = (key: keyof FormState, value: string | boolean) =>
    setF((current) => ({ ...current, [key]: value }));

  return (
    <main className="premium-shell editor-premium">


      <section className="subpage editor-subpage">
        <div className="section-kicker"><span className="live-dot"/> PERSONALIZAÇÃO</div>
        <div className="hub-title"><div><h1>Minha página</h1><p>Escolha um modelo, ajuste sua identidade e acompanhe a prévia antes de publicar.</p></div></div>
        <div className="page-toolbar editor-toolbar">
          <span className={"editor-save-state" + (dirty ? " is-unsaved" : "")} role="status" aria-live="polite">{loading ? "Carregando sua página…" : !id ? "Dados indisponíveis" : saving ? "Salvando sua página…" : uploading ? "Enviando imagem…" : dirty ? "Alterações não salvas" : "Tudo salvo"}</span>
          <a className="premium-btn" href="#editor-preview"><Smartphone size={15}/> Ver prévia</a>
          <button className="premium-btn premium-btn-dark" onClick={save} disabled={saving || loading || !!uploading || !id || !dirty || !canEdit}>
            {saving ? <LoaderCircle size={15} className="spin"/> : <Save size={15}/>} {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
        {!loading && id && !canEdit && <p className="notice">Seu acesso permite consultar esta página. Peça a um administrador da empresa para editar.</p>}
        {msg && <div id="editor-feedback" ref={feedback} tabIndex={-1} className={"editor-message" + (messageError ? " is-error" : "")} role={messageError ? "alert" : "status"}>{msg}</div>}
        {loading ? <div className="editor-loading" role="status"><LoaderCircle className="spin" aria-hidden="true"/> Carregando seu perfil…</div> : !id ? <div className="workspace-state"><h2>Vamos tentar carregar sua página novamente.</h2><p>Seu conteúdo permanece salvo. Atualize a tela para continuar a edição.</p><button type="button" className="premium-btn" onClick={() => window.location.reload()}>Tentar novamente</button></div> : (
          <div className="editor-premium-layout">
            <fieldset className="editor-controls" disabled={!canEdit || saving || !!uploading}>
              <section className="editor-section segment-section" id="modelos">
                <div className="editor-section-heading"><span><Sparkles size={17}/></span><div><b>Comece com um modelo</b><small>Uma base de cores e apresentação para o seu segmento.</small></div></div>
                <label className="premium-field">Modelo por segmento
                  <select value={selectedSegment} onChange={event => { setSelectedSegment(event.target.value); setReplaceDescription(false); }} disabled={saving || !!uploading}>
                    <option value="">Personalizado · manter minha página</option>
                    {segmentTemplates.map(template => <option value={template.id} key={template.id}>{template.name}</option>)}
                  </select>
                </label>
                {selectedTemplate ? <div className="segment-template-preview">
                  <div className="segment-template-sample" style={{background:selectedTemplate.colors.bg,color:selectedTemplate.colors.text}}>
                    <span className="segment-sample-avatar" style={{background:selectedTemplate.colors.primary,color:selectedTemplate.colors.buttonText}}>{f.name.slice(0,1).toUpperCase() || "N"}</span>
                    <strong>{f.name || "Sua empresa"}</strong>
                    <p>{selectedTemplate.description}</p>
                    <span className="segment-sample-button" style={{background:selectedTemplate.colors.primary,color:selectedTemplate.colors.buttonText}}>{selectedTemplate.suggestedActions[0].label}</span>
                    <span className="segment-sample-caption">Exemplo do modelo · nenhum botão é criado automaticamente</span>
                  </div>
                  <p className="segment-summary">{selectedTemplate.summary} Você poderá personalizar todas as cores abaixo.</p>
                  {f.description.trim() && <label className="segment-replace"><input type="checkbox" checked={replaceDescription} onChange={event=>setReplaceDescription(event.target.checked)}/><span>Substituir minha descrição pelo texto sugerido</span></label>}
                  <button type="button" className="premium-btn" onClick={applyTemplate} disabled={saving || !!uploading}>Usar este modelo na prévia</button>
                  <div className="segment-action-guide">
                    <b>Botões sugeridos</b>
                    <div className="segment-suggestion-tags">{selectedTemplate.suggestedActions.map(suggestion=><span key={suggestion.type}>{suggestion.label}</span>)}</div>
                    <p>{!actionsReady ? "Não foi possível conferir os botões existentes. Atualize a página antes de configurar novas sugestões." : suggestedActions.length ? "Configure os destinos reais em Botões. Os tipos que você já utiliza não serão sugeridos novamente." : "Você já utiliza todos os tipos de botão deste modelo. Edite-os em Botões quando precisar."}</p>
                    <Link href={actionsReady ? "/dashboard/actions?template=" + selectedTemplate.id : "/dashboard/actions"} className="segment-actions-link">{actionsReady && suggestedActions.length ? "Configurar botões sugeridos" : "Gerenciar meus botões"} <ExternalLink size={14}/></Link>
                  </div>
                </div> : <p className="segment-intro">Restaurante, salão, oficina, loja ou profissional autônomo: escolha uma base pronta ou continue personalizando sua página. Seus dados atuais são preservados.</p>}
              </section>

              <section className="editor-section">
                <div className="editor-section-heading"><span>01</span><div><b>Informações da empresa</b><small>Apresente sua marca com clareza.</small></div></div>
                <label className="premium-field" htmlFor="company-name">Nome da empresa<input id="company-name" ref={nameInput} value={f.name} maxLength={80} autoComplete="organization" aria-invalid={nameError || undefined} aria-describedby={nameError ? "editor-feedback" : undefined} onChange={e=>{ if (nameError) { setNameError(false); setMessageError(false); setMsg(""); } set("name",e.target.value); }} placeholder="Ex.: Lux Tintas"/></label>
                <div className="premium-field"><label htmlFor="company-description">Descrição</label><textarea id="company-description" value={f.description} maxLength={240} aria-describedby="company-description-count" onChange={e=>set("description",e.target.value)} placeholder="Conte em poucas palavras o que sua empresa oferece."/></div>
                <div id="company-description-count" className="editor-char-count">{f.description.length}/240 caracteres · uma apresentação curta ajuda seu cliente a decidir</div>
              </section>

              <section className="editor-section">
                <div className="editor-section-heading"><span>02</span><div><b>Fotografia e identidade</b><small>Imagens nítidas deixam a página mais confiável.</small></div></div>
                <div className="editor-upload-grid">
                  <UploadField title="Foto de perfil" hint="PNG, JPG ou WEBP · até 6 MB" image={f.logo} round onChange={file=>upload(file,"logo")} uploading={uploading==="logo"}/>
                  <UploadField title="Imagem de capa" hint="PNG, JPG ou WEBP · até 6 MB" image={f.cover} onChange={file=>upload(file,"cover")} uploading={uploading==="cover"}/>
                </div>
              </section>

              <section className="editor-section">
                <div className="editor-section-heading"><span>03</span><div><b>Ajustar cores</b><small>Personalize a paleta do modelo ou crie sua própria combinação.</small></div></div>
                <div className="premium-color-grid">
                  <ColorField title="Fundo" value={f.bg} onChange={v=>set("bg",v)}/>
                  <ColorField title="Texto principal" value={f.text} onChange={v=>set("text",v)}/>
                  <ColorField title="Texto secundário" value={f.secondary} onChange={v=>set("secondary",v)}/>
                  <ColorField title="Botões" value={f.primary} onChange={v=>set("primary",v)}/>
                  <ColorField title="Texto dos botões" value={f.buttonText} onChange={v=>set("buttonText",v)}/>
                </div>
              </section>

              <section className="editor-section" id="contatos">
                <div className="editor-section-heading"><span>04</span><div><b>Formas de contato</b><small>Escolha quais contatos aparecem no perfil.</small></div></div>
                <label className="premium-field">Telefone<input type="tel" inputMode="tel" autoComplete="tel" maxLength={32} value={f.phone} onChange={e=>set("phone",e.target.value)} placeholder="(61) 99999-9999"/></label>
                <Toggle checked={f.phoneEnabled} onChange={v=>set("phoneEnabled",v)} title="Exibir opção de ligação"/>
                <label className="premium-field">WhatsApp<input type="tel" inputMode="tel" maxLength={32} value={f.whatsapp} onChange={e=>set("whatsapp",e.target.value)} placeholder="5561999999999" aria-describedby="whatsapp-number-help"/></label>
                <p id="whatsapp-number-help" className="workspace-field-help">Inclua o DDD. Para números de fora do Brasil, informe também o código do país.</p>
                <Toggle checked={f.whatsappEnabled} onChange={v=>set("whatsappEnabled",v)} title="Exibir botão do WhatsApp"/>
              </section>

            </fieldset>

            <aside className="editor-preview-column" id="editor-preview" tabIndex={-1}>
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
  return <label className="editor-upload-field"><span className={"editor-upload-preview "+(round?"round":"")}>{image?<img src={image} alt={title}/>:<ImagePlus size={22}/>}</span><b>{title}</b><small>{hint}</small><span className="premium-btn">{uploading?<LoaderCircle size={14} className="spin"/>:<ImagePlus size={14}/>} {uploading?"Enviando…":"Escolher imagem"}</span><input className="workspace-file-input" type="file" aria-label={"Escolher " + title.toLocaleLowerCase("pt-BR")} accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(e:ChangeEvent<HTMLInputElement>)=>{onChange(e.target.files?.[0]);e.currentTarget.value="";}}/></label>;
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
