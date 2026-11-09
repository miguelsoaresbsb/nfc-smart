"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {Copy,ExternalLink,Eye,Palette,Wifi,Check} from "lucide-react";
import {createClient} from "@/lib/supabase-browser";
import {getPublicPageUrl} from "@/lib/public-url";

export default function NFC(){
 const s=useMemo(()=>createClient(),[]);
 const [url,setUrl]=useState(""),[name,setName]=useState(""),[copied,setCopied]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState("");
 useEffect(()=>{let alive=true;(async()=>{
  const {data:u}=await s.auth.getUser();
  if(!u.user){location.href="/login";return;}
  const {data:m,error:memberError}=await s.from("company_members").select("company_id").eq("user_id",u.user.id).limit(1).maybeSingle();
  if(memberError)throw memberError;
  let id=m?.company_id;
  if(!id){const {data:a}=await s.from("platform_admins").select("user_id").eq("user_id",u.user.id).maybeSingle();
   if(a){const {data:c}=await s.from("companies").select("id").order("name").limit(1).maybeSingle();id=c?.id;}}
  if(!id){if(alive)setMessage("Nenhuma empresa disponível. Acompanhe a liberação do seu acesso.");return;}
  const {data:c,error}=await s.from("companies").select("slug,name").eq("id",id).single();
  if(error)throw error;
  if(alive&&c){setName(c.name);setUrl(getPublicPageUrl(c.slug));}
 })().catch(()=>{if(alive)setMessage("Não foi possível carregar o endereço da empresa. Atualize a página para tentar novamente.");}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[s]);
 async function copy(){if(!url)return;try{await navigator.clipboard.writeText(url);setCopied(true);setMessage("");setTimeout(()=>setCopied(false),1800);}catch{setMessage("Não foi possível copiar automaticamente. Selecione o endereço acima para copiá-lo.");}}
 return <main className="premium-shell nfc-page"><header className="premium-nav"><Link href="/dashboard" className="brand"><span className="brand-mark"><Wifi size={17}/></span><span>NFC<span>SMART</span></span></Link><div className="premium-nav-right">{url&&<a href={url} target="_blank" rel="noopener noreferrer"><Eye size={14}/> Ver pública</a>}<Link href="/dashboard/editor" className="premium-btn"><Palette size={15}/> Personalizar</Link></div></header><section className="subpage"><div className="section-kicker"><span className="live-dot"/> MINHA PÁGINA</div><div className="hub-title"><div><h1>Seu endereço <span>permanente.</span></h1><p>A TAG NFC aponta para esta URL. Você pode editar o conteúdo sem precisar regravar a TAG.</p></div></div><div className="url-showcase"><div className="url-visual"><div className="url-icon"><Wifi size={25}/></div><div className="signal-ring one"/><div className="signal-ring two"/></div><small>URL PÚBLICA • {name||"SUA EMPRESA"}</small><strong>{url||(loading?"Carregando...":"Endereço indisponível")}</strong>{message&&<p role="status">{message}</p>}<div className="url-actions"><button onClick={copy} disabled={!url}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?"Copiado":"Copiar URL"}</button>{url&&<a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Abrir página</a>}</div></div><div className="nfc-steps"><div><b>01</b><span>Grave esta URL na TAG</span></div><div><b>02</b><span>Entregue a placa ao cliente</span></div><div><b>03</b><span>Edite o conteúdo quando quiser</span></div></div></section></main>;
}
