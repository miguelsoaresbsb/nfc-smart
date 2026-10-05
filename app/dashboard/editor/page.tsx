"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {createClient} from "@/lib/supabase-browser";

type Company={id:string;name:string;slug:string;logo_url:string|null;description:string|null;phone:string|null;whatsapp:string|null;instagram:string|null;website:string|null;google_review_url:string|null;pix_key:string|null;address:string|null;primary_color:string;secondary_color:string;background_color:string};
type QR={id:string;name:string;image_url:string;storage_path:string;description:string|null;position:number;enabled:boolean};
type Action={id:string;type:string;label:string;url:string|null;position:number;enabled:boolean};

const actionTypes=[["whatsapp","WhatsApp"],["instagram","Instagram"],["google","Google avaliações"],["maps","Localização"],["website","Site"],["phone","Telefone"],["menu","Cardápio"],["pix","PIX"],["custom","Personalizado"]];

export default function Editor(){
 const s=createClient(); const [company,setCompany]=useState<Company|null>(null); const [actions,setActions]=useState<Action[]>([]); const [qrs,setQrs]=useState<QR[]>([]);
 const [tab,setTab]=useState("visual"); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [msg,setMsg]=useState("");
 const [form,setForm]=useState<any>({});
 async function load(){
  setLoading(true); const {data:user}=await s.auth.getUser(); if(!user.user){location.href="/login";return}
  const {data:admin}=await s.from("platform_admins").select("user_id").eq("user_id",user.user.id).maybeSingle();
  let companyId:string|null=null;
  if(admin){const {data:c}=await s.from("companies").select("*").order("created_at").limit(1).maybeSingle(); companyId=c?.id||null}
  else {const {data:m}=await s.from("company_members").select("company_id").eq("user_id",user.user.id).limit(1).maybeSingle(); companyId=m?.company_id||null}
  if(!companyId){setLoading(false);return}
  const [{data:c},{data:a},{data:q}]=await Promise.all([
   s.from("companies").select("*").eq("id",companyId).single(),
   s.from("actions").select("*").eq("company_id",companyId).order("position"),
   s.from("qr_codes").select("*").eq("company_id",companyId).order("position")
  ]);
  setCompany(c); setForm(c||{}); setActions(a||[]); setQrs(q||[]); setLoading(false);
 }
 useEffect(()=>{load()},[]);
 async function save(){
  if(!company)return; setSaving(true); setMsg("");
  const {error}=await s.from("companies").update({...form,updated_at:new Date().toISOString()}).eq("id",company.id);
  if(error)setMsg("Não foi possível salvar: "+error.message); else {setCompany({...company,...form});setMsg("Alterações salvas ✓")}
  setSaving(false);
 }
 async function upload(kind:"logo"|"cover"){
  if(!company)return; const input=document.createElement("input"); input.type="file"; input.accept="image/*"; input.onchange=async()=>{
   const file=input.files?.[0]; if(!file)return; if(file.size>6*1024*1024){setMsg("Use uma imagem de até 6 MB.");return}
   const ext=file.name.split(".").pop()||"jpg"; const path=`${company.id}/${kind}-${Date.now()}.${ext}`;
   const {error}=await s.storage.from("company-assets").upload(path,file,{upsert:true,contentType:file.type});
   if(error){setMsg("Upload falhou: "+error.message);return}
   const {data}=s.storage.from("company-assets").getPublicUrl(path); setForm((x:any)=>({...x,[kind==="logo"?"logo_url":"cover_url"]:data.publicUrl}));
   if(kind==="logo") await s.from("companies").update({logo_url:data.publicUrl}).eq("id",company.id);
   else await s.from("profiles").upsert({id:(await s.auth.getUser()).data.user?.id,company_id:company.id,cover_url:data.publicUrl},{onConflict:"id"});
   setMsg(kind==="logo"?"Logo enviada ✓":"Capa enviada ✓"); load();
  }; input.click();
 }
 async function addAction(){
  if(!company)return; const {data,error}=await s.from("actions").insert({company_id:company.id,type:"custom",label:"Novo botão",url:"https://",position:actions.length,enabled:true}).select().single();
  if(error)setMsg(error.message); else setActions([...actions,data]);
 }
 async function updateAction(a:Action,patch:Partial<Action>){const {data}=await s.from("actions").update(patch).eq("id",a.id).select().single();if(data)setActions(actions.map(x=>x.id===a.id?data:x))}
 async function removeAction(id:string){await s.from("actions").delete().eq("id",id);setActions(actions.filter(x=>x.id!==id))}
 async function uploadQR(){
  if(!company)return; const input=document.createElement("input"); input.type="file"; input.accept="image/png,image/jpeg,image/webp,image/jpg"; input.onchange=async()=>{
   const file=input.files?.[0];if(!file)return;if(file.size>6*1024*1024){setMsg("Use um QR em imagem de até 6 MB.");return}
   const ext=file.name.split(".").pop()||"png";const path=`${company.id}/qr-${Date.now()}.${ext}`;
   const {error}=await s.storage.from("company-assets").upload(path,file,{upsert:false,contentType:file.type});if(error){setMsg(error.message);return}
   const {data:url}=s.storage.from("company-assets").getPublicUrl(path);
   const {data,error:e}=await s.from("qr_codes").insert({company_id:company.id,name:file.name,image_url:url.publicUrl,storage_path:path,position:qrs.length,enabled:true}).select().single();
   if(e)setMsg(e.message);else setQrs([...qrs,data]); setMsg("QR Code salvo ✓");
  };input.click();
 }
 async function removeQR(q:QR){await s.from("qr_codes").delete().eq("id",q.id);await s.storage.from("company-assets").remove([q.storage_path]);setQrs(qrs.filter(x=>x.id!==q.id))}
 if(loading)return <div className="app"><div className="panel">Carregando seu editor…</div></div>;
 if(!company)return <div className="app"><div className="panel"><h1>Primeiro configure uma empresa</h1><p>O Admin Master precisa criar e vincular a empresa antes da personalização.</p><Link href="/admin" className="btn">Ir para Painel do Dono</Link></div></div>;
 return <main className="app"><div className="topbar"><div><b>NFC Smart</b><span>Editor da página</span></div><div className="toplinks"><Link href="/dashboard">← Início</Link><a href={`/p/${company.slug}`} target="_blank">Ver página ↗</a></div></div>
 <div className="editor-grid"><section>
  <div className="tabs">{["visual","ações","qr","aparência"].map(x=><button className={tab===x?"tab active":"tab"} onClick={()=>setTab(x)} key={x}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div>
  {msg&&<div className="notice">{msg}</div>}
  {tab==="visual"&&<div className="panel stack">
   <h2>Informações da página</h2><Field label="Nome da empresa" value={form.name||""} onChange={(v:string)=>setForm({...form,name:v})}/><Field label="Descrição" value={form.description||""} onChange={(v:string)=>setForm({...form,description:v})}/><Field label="Telefone" value={form.phone||""} onChange={(v:string)=>setForm({...form,phone:v})}/><Field label="WhatsApp" value={form.whatsapp||""} onChange={(v:string)=>setForm({...form,whatsapp:v})}/><Field label="Instagram" value={form.instagram||""} onChange={(v:string)=>setForm({...form,instagram:v})}/><Field label="Site" value={form.website||""} onChange={(v:string)=>setForm({...form,website:v})}/><Field label="Google avaliações" value={form.google_review_url||""} onChange={(v:string)=>setForm({...form,google_review_url:v})}/><Field label="Endereço" value={form.address||""} onChange={(v:string)=>setForm({...form,address:v})}/><button className="btn" onClick={()=>save()} disabled={saving}>{saving?"Salvando…":"Salvar alterações"}</button>
   <div className="upload-row"><button className="btn secondary" onClick={()=>upload("logo")}>📷 Foto de perfil / logo</button><button className="btn secondary" onClick={()=>upload("cover")}>🖼️ Foto de capa / fundo</button></div>
  </div>}
  {tab==="ações"&&<div className="panel stack"><div className="row-between"><h2>Botões e ações</h2><button className="btn" onClick={addAction}>+ Adicionar ação</button></div>{actions.map(a=><div className="action-edit" key={a.id}><select value={a.type} onChange={e=>updateAction(a,{type:e.target.value})}>{actionTypes.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select><input value={a.label} onChange={e=>updateAction(a,{label:e.target.value})}/><input value={a.url||""} placeholder="Link / telefone / chave PIX" onChange={e=>updateAction(a,{url:e.target.value})}/><label><input type="checkbox" checked={a.enabled} onChange={e=>updateAction(a,{enabled:e.target.checked})}/> Ativo</label><button className="icon-btn" onClick={()=>removeAction(a.id)}>Excluir</button></div>)}</div>}
  {tab==="qr"&&<div className="panel stack"><div className="row-between"><h2>QR Codes</h2><button className="btn" onClick={uploadQR}>+ Adicionar imagem</button></div><p className="muted">Envie o QR Code que você já possui. O NFC Smart guarda a imagem; não altera nem gera o QR.</p><div className="qr-grid">{qrs.map(q=><div className="qr-card" key={q.id}><img src={q.image_url} alt={q.name}/><b>{q.name}</b><button className="icon-btn" onClick={()=>removeQR(q)}>Excluir</button></div>)}</div></div>}
  {tab==="aparência"&&<div className="panel stack"><h2>Visual da página</h2><div className="color-grid"><Color label="Cor principal" value={form.primary_color||"#111111"} onChange={(v:string)=>setForm({...form,primary_color:v})}/><Color label="Cor secundária" value={form.secondary_color||"#ffffff"} onChange={(v:string)=>setForm({...form,secondary_color:v})}/><Color label="Fundo" value={form.background_color||"#f5f5f5"} onChange={(v:string)=>setForm({...form,background_color:v})}/></div><button className="btn" onClick={save}>Salvar cores</button><p className="muted">O padrão agora é claro e os botões usam preto, mas você pode escolher suas próprias cores.</p></div>}
 </section><aside className="phone"><div className="phone-screen" style={{background:form.background_color||"#f5f5f5"}}>{form.cover_url&&<img className="cover" src={form.cover_url} alt="capa"/>}<div className="profile">{form.logo_url?<img src={form.logo_url} alt="logo"/>:<div className="avatar-placeholder">{(form.name||"N").slice(0,1)}</div>}<h3>{form.name||"Sua empresa"}</h3><p>{form.description||"Sua descrição aparecerá aqui."}</p></div><div className="preview-actions">{actions.filter(a=>a.enabled).map(a=><div className="preview-button" style={{background:form.primary_color||"#111111",color:form.secondary_color||"#fff"}} key={a.id}>{a.label}</div>)}</div>{qrs.filter(q=>q.enabled).map(q=><img className="preview-qr" key={q.id} src={q.image_url} alt={q.name}/>)}<small>Powered by NFC Smart</small></div></aside></div></main>
}
function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="field"><span>{label}</span><input value={value} onChange={e=>onChange(e.target.value)}/></label>}
function Color({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="color-field"><span>{label}</span><input type="color" value={value} onChange={e=>onChange(e.target.value)}/><input value={value} onChange={e=>onChange(e.target.value)}/></label>}
