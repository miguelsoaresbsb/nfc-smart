"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowUpRight,Check,ChevronDown,Copy,ExternalLink,ImagePlus,Camera,MapPin,MessageCircle,Palette,Phone,Plus,QrCode,Save,Settings2,Share2,Star,Trash2,Upload,Wifi,Globe,Menu,WalletCards} from "lucide-react";
import {createClient} from "@/lib/supabase-browser";

type Company={id:string;name:string;slug:string;logo_url:string|null;description:string|null;phone:string|null;whatsapp:string|null;instagram:string|null;website:string|null;google_review_url:string|null;pix_key:string|null;address:string|null;primary_color:string;secondary_color:string;background_color:string};
type QR={id:string;name:string;image_url:string;storage_path:string;description:string|null;position:number;enabled:boolean};
type Action={id:string;type:string;label:string;url:string|null;position:number;enabled:boolean};

const actionTypes:any[]=[["whatsapp","WhatsApp",MessageCircle],["instagram","Instagram",Camera],["google","Google avaliações",Star],["maps","Localização",MapPin],["website","Site",Globe],["phone","Telefone",Phone],["menu","Cardápio",Menu],["pix","PIX",WalletCards],["custom","Personalizado",ArrowUpRight]];

export default function Editor(){
 const s=createClient(); const [company,setCompany]=useState<Company|null>(null); const [actions,setActions]=useState<Action[]>([]); const [qrs,setQrs]=useState<QR[]>([]);
 const [tab,setTab]=useState("visual"); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [msg,setMsg]=useState(""); const [form,setForm]=useState<any>({});
 async function load(){
  setLoading(true); const {data:user}=await s.auth.getUser(); if(!user.user){location.href="/login";return}
  const {data:admin}=await s.from("platform_admins").select("user_id").eq("user_id",user.user.id).maybeSingle();
  let companyId:string|null=null;
  if(admin){const {data:c}=await s.from("companies").select("*").order("name").limit(1).maybeSingle();companyId=c?.id||null}
  else {const {data:m}=await s.from("company_members").select("company_id").eq("user_id",user.user.id).limit(1).maybeSingle();companyId=m?.company_id||null}
  if(!companyId){setLoading(false);return}
  const [{data:c},{data:a},{data:q}]=await Promise.all([
   s.from("companies").select("*").eq("id",companyId).single(),
   s.from("actions").select("*").eq("company_id",companyId).order("position"),
   s.from("qr_codes").select("*").eq("company_id",companyId).order("position")
  ]);
  setCompany(c);setForm(c||{});setActions(a||[]);setQrs(q||[]);setLoading(false);
 }
 useEffect(()=>{load()},[]);
 async function save(){
  if(!company)return;setSaving(true);setMsg("");
  const payload={name:form.name,description:form.description,phone:form.phone,whatsapp:form.whatsapp,instagram:form.instagram,website:form.website,google_review_url:form.google_review_url,address:form.address,primary_color:form.primary_color,secondary_color:form.secondary_color,background_color:form.background_color,logo_url:form.logo_url,updated_at:new Date().toISOString()};
  const {error}=await s.from("companies").update(payload).eq("id",company.id);
  if(error)setMsg("Não foi possível salvar: "+error.message);else{setCompany({...company,...payload});setMsg("Alterações salvas com sucesso");}
  setSaving(false);
 }
 async function upload(kind:"logo"|"cover"){
  if(!company)return;const input=document.createElement("input");input.type="file";input.accept="image/png,image/jpeg,image/webp,image/jpg";input.onchange=async()=>{
   const file=input.files?.[0];if(!file)return;if(file.size>6*1024*1024){setMsg("Use uma imagem de até 6 MB.");return}
   const ext=file.name.split(".").pop()||"jpg";const path=`${company.id}/${kind}-${Date.now()}.${ext}`;
   const {error}=await s.storage.from("company-assets").upload(path,file,{upsert:false,contentType:file.type});
   if(error){setMsg("Upload falhou: "+error.message);return}
   const {data}=s.storage.from("company-assets").getPublicUrl(path);const url=data.publicUrl;
   if(kind==="logo"){setForm((x:any)=>({...x,logo_url:url}));const {error:e}=await s.from("companies").update({logo_url:url}).eq("id",company.id);if(e){setMsg(e.message);return}}
   else {
    const {data:existing}=await s.from("profiles").select("id").eq("company_id",company.id).limit(1).maybeSingle();
    const result=existing?await s.from("profiles").update({cover_url:url}).eq("id",existing.id):await s.from("profiles").insert({company_id:company.id,cover_url:url});
    if(result.error){setMsg("Capa enviada, mas não foi possível salvar no perfil: "+result.error.message);return}
   }
   setMsg(kind==="logo"?"Foto de perfil atualizada":"Capa atualizada");load();
  };input.click();
 }
 async function addAction(){if(!company)return;const {data,error}=await s.from("actions").insert({company_id:company.id,type:"custom",label:"Novo botão",url:"https://",position:actions.length,enabled:true}).select().single();if(error)setMsg(error.message);else if(data){setActions([...actions,data]);setMsg("Ação adicionada")}}
 async function updateAction(a:Action,patch:Partial<Action>){const {data,error}=await s.from("actions").update(patch).eq("id",a.id).select().single();if(error)setMsg(error.message);else if(data)setActions(actions.map(x=>x.id===a.id?data:x))}
 async function removeAction(id:string){const {error}=await s.from("actions").delete().eq("id",id);if(error){setMsg(error.message);return}setActions(actions.filter(x=>x.id!==id));setMsg("Ação removida")}
 async function uploadQR(){if(!company)return;const input=document.createElement("input");input.type="file";input.accept="image/png,image/jpeg,image/webp,image/jpg";input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(file.size>6*1024*1024){setMsg("Use uma imagem de até 6 MB.");return}const ext=file.name.split(".").pop()||"png";const path=`${company.id}/qr-${Date.now()}.${ext}`;const {error}=await s.storage.from("company-assets").upload(path,file,{upsert:false,contentType:file.type});if(error){setMsg(error.message);return}const {data:url}=s.storage.from("company-assets").getPublicUrl(path);const {data,error:e}=await s.from("qr_codes").insert({company_id:company.id,name:file.name,image_url:url.publicUrl,storage_path:path,position:qrs.length,enabled:true}).select().single();if(e){setMsg(e.message);return}setQrs([...qrs,data]);setMsg("QR Code salvo")};input.click()}
 async function removeQR(q:QR){const {error}=await s.from("qr_codes").delete().eq("id",q.id);if(error){setMsg(error.message);return}await s.storage.from("company-assets").remove([q.storage_path]);setQrs(qrs.filter(x=>x.id!==q.id));setMsg("QR Code removido")}
 if(loading)return <main className="elite-editor"><div className="editor-loading"><div className="loading-orb"/><b>Preparando seu editor</b><span>Carregando identidade, ações e QR Codes…</span></div></main>;
 if(!company)return <main className="elite-editor"><div className="editor-empty"><Wifi size={25}/><h1>Nenhuma empresa configurada</h1><p>O Admin Master precisa criar e vincular uma empresa antes da personalização.</p><Link href="/admin" className="black-button">Abrir Admin Master</Link></div></main>;
 const enabledActions=actions.filter(a=>a.enabled);
 return <main className="elite-editor">
  <header className="editor-header"><Link href="/dashboard" className="editor-back"><ArrowLeft size={17}/> Painel</Link><div className="editor-brand"><span className="brand-mark"><Wifi size={16}/></span><div><b>NFC SMART</b><small>EDITOR VISUAL</small></div></div><div className="editor-header-actions"><a href={`/p/${company.slug}`} target="_blank" className="ghost-button"><ExternalLink size={15}/> Ver página</a><button className="black-button compact" onClick={save} disabled={saving}>{saving?<span className="spinner"/>:<Save size={15}/>} {saving?"Salvando":"Salvar"}</button></div></header>
  <div className="editor-layout">
   <section className="editor-workspace">
    <div className="editor-title-row"><div><span className="eyebrow-line"><span/> PERSONALIZAÇÃO</span><h1>Construa uma página que <em>pareça sua.</em></h1><p>Edite, salve e veja o resultado no celular ao lado.</p></div><div className="save-state">{msg?<><Check size={14}/>{msg}</>:<><span className="live-dot"/> Salvamento manual</>}</div></div>
    <div className="editor-tabs">{[["visual","Identidade",Palette],["ações","Ações",Settings2],["qr","QR Codes",QrCode],["aparência","Cores",Palette]].map(([id,label,Icon]:any)=><button key={id} className={tab===id?"editor-tab active":"editor-tab"} onClick={()=>setTab(id)}><Icon size={16}/>{label}</button>)}</div>
    {tab==="visual"&&<div className="editor-panel-grid">
      <Panel title="Perfil público" text="Essas informações aparecem no topo da sua página."><div className="media-row"><div className="media-preview round">{form.logo_url?<img src={form.logo_url} alt="Logo"/>:<span>{(form.name||"N").slice(0,1)}</span>}</div><div><b>Foto de perfil</b><small>PNG, JPG ou WEBP · até 6 MB</small><button className="outline-button" onClick={()=>upload("logo")}><Upload size={14}/> Trocar foto</button></div></div><div className="field-grid"><Field label="Nome da empresa" value={form.name||""} onChange={(v:string)=>setForm({...form,name:v})}/><Field label="Descrição" value={form.description||""} onChange={(v:string)=>setForm({...form,description:v})}/><Field label="Telefone" value={form.phone||""} onChange={(v:string)=>setForm({...form,phone:v})}/><Field label="WhatsApp" value={form.whatsapp||""} onChange={(v:string)=>setForm({...form,whatsapp:v})}/><Field label="Instagram" value={form.instagram||""} onChange={(v:string)=>setForm({...form,instagram:v})}/><Field label="Endereço" value={form.address||""} onChange={(v:string)=>setForm({...form,address:v})}/><Field wide label="Site" value={form.website||""} onChange={(v:string)=>setForm({...form,website:v})}/><Field wide label="Google avaliações" value={form.google_review_url||""} onChange={(v:string)=>setForm({...form,google_review_url:v})}/></div></Panel>
      <Panel title="Capa / fundo" text="Uma imagem horizontal cria a sensação de perfil e deixa a página muito mais visual."><div className="cover-preview">{form.cover_url?<img src={form.cover_url} alt="Capa"/>:<div><ImagePlus size={24}/><span>Nenhuma capa configurada</span></div>}</div><button className="outline-button full" onClick={()=>upload("cover")}><ImagePlus size={15}/> {form.cover_url?"Trocar capa":"Adicionar foto de capa"}</button></Panel>
    </div>}
    {tab==="ações"&&<Panel title="Ações da página" text="Você decide quais botões aparecem e o que cada um faz."><div className="action-list">{actions.map((a)=><ActionEditor key={a.id} a={a} onChange={p=>updateAction(a,p)} onDelete={()=>removeAction(a.id)}/>)}</div><button className="add-action" onClick={addAction}><Plus size={17}/> Adicionar nova ação</button></Panel>}
    {tab==="qr"&&<Panel title="QR Codes como imagens" text="Envie os QR Codes que você já possui. O NFC Smart apenas armazena e exibe a imagem."><button className="upload-zone" onClick={uploadQR}><span className="upload-zone-icon"><ImagePlus size={24}/></span><b>Adicionar imagem de QR Code</b><small>PNG, JPG, JPEG ou WEBP · até 6 MB</small></button><div className="qr-list">{qrs.map(q=><div className="qr-item" key={q.id}><img src={q.image_url} alt={q.name}/><div><b>{q.name}</b><small>Imagem ativa na página pública</small></div><button className="danger-icon" onClick={()=>removeQR(q)} aria-label="Excluir QR"><Trash2 size={16}/></button></div>)}{!qrs.length&&<div className="empty-mini"><QrCode size={20}/><span>Nenhum QR Code adicionado ainda.</span></div>}</div></Panel>}
    {tab==="aparência"&&<Panel title="Cores e identidade visual" text="Deixe a página com a identidade da empresa. O padrão é claro com ações pretas."><div className="color-editor-grid"><Color label="Cor dos botões" value={form.primary_color||"#111111"} onChange={(v:string)=>setForm({...form,primary_color:v})}/><Color label="Cor do texto dos botões" value={form.secondary_color||"#ffffff"} onChange={(v:string)=>setForm({...form,secondary_color:v})}/><Color label="Cor do fundo" value={form.background_color||"#f5f5f5"} onChange={(v:string)=>setForm({...form,background_color:v})}/></div><div className="theme-presets"><button onClick={()=>setForm({...form,primary_color:"#111111",secondary_color:"#ffffff",background_color:"#f6f6f3"})}><span className="preset black"/><b>Minimal claro</b></button><button onClick={()=>setForm({...form,primary_color:"#171717",secondary_color:"#ffffff",background_color:"#ffffff"})}><span className="preset mono"/><b>Branco editorial</b></button><button onClick={()=>setForm({...form,primary_color:"#d8ff57",secondary_color:"#111111",background_color:"#f4f6ed"})}><span className="preset lime"/><b>Lime NFC</b></button></div><button className="black-button" onClick={save}><Save size={15}/> Salvar identidade</button></Panel>}
   </section>
   <aside className="editor-preview-column"><div className="preview-label"><span>PREVIEW AO VIVO</span><a href={`/p/${company.slug}`} target="_blank"><Share2 size={14}/> Abrir</a></div><div className="device"><div className="device-notch"/><div className="device-screen" style={{background:form.background_color||"#f6f6f3"}}><div className="preview-cover">{form.cover_url?<img src={form.cover_url} alt="Capa"/>:<div className="preview-cover-art"><span/><span/><span/></div>}</div><div className="preview-profile"><div className="preview-avatar">{form.logo_url?<img src={form.logo_url} alt="Perfil"/>:<span>{(form.name||"N").slice(0,1)}</span>}</div><b>{form.name||"Sua empresa"}</b><p>{form.description||"Uma experiência digital em um toque."}</p>{form.address&&<small><MapPin size={11}/>{form.address}</small>}</div><div className="preview-actions">{enabledActions.map(a=><div className="preview-action" style={{background:form.primary_color||"#111",color:form.secondary_color||"#fff"}} key={a.id}>{a.label}<ArrowUpRight size={12}/></div>)}</div>{qrs.filter(q=>q.enabled).map(q=><div className="preview-qr" key={q.id}><img src={q.image_url} alt={q.name}/></div>)}<small className="preview-footer">NFC SMART · TOQUE. CONECTE.</small></div></div></aside>
  </div>
 </main>
}
function Panel({title,text,children}:{title:string;text:string;children:React.ReactNode}){return <div className="editor-panel"><div className="panel-heading"><div><h2>{title}</h2><p>{text}</p></div></div>{children}</div>}
function Field({label,value,onChange,wide=false}:{label:string;value:string;onChange:(v:string)=>void;wide?:boolean}){return <label className={"elite-field "+(wide?"wide":"")}><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value)}/></label>}
function Color({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="elite-color"><span>{label}</span><div><input type="color" value={value} onChange={e=>onChange(e.target.value)}/><input value={value} onChange={e=>onChange(e.target.value)}/></div></label>}
function ActionEditor({a,onChange,onDelete}:{a:Action;onChange:(p:Partial<Action>)=>void;onDelete:()=>void}){const meta=actionTypes.find(x=>x[0]===a.type);const Icon:any=meta?.[2]||ArrowUpRight;return <div className="action-editor"><div className="action-editor-icon"><Icon size={17}/></div><div className="action-editor-main"><div className="action-top"><select value={a.type} onChange={e=>onChange({type:e.target.value})}>{actionTypes.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select><label className="switch"><input type="checkbox" checked={a.enabled} onChange={e=>onChange({enabled:e.target.checked})}/><span/></label></div><input className="action-label-input" value={a.label} onChange={e=>onChange({label:e.target.value})}/><input className="action-url-input" value={a.url||""} placeholder="https://, telefone, WhatsApp ou chave PIX" onChange={e=>onChange({url:e.target.value})}/></div><button className="danger-icon" onClick={onDelete} aria-label="Excluir ação"><Trash2 size={16}/></button></div>}
