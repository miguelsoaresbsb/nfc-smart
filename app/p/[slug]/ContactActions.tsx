"use client";
import {useState} from "react";
import {whatsappNumber} from "@/lib/action-target";
export function ContactActions({phone,whatsapp,phoneEnabled=true,whatsappEnabled=true}:{phone?:string|null;whatsapp?:string|null;phoneEnabled?:boolean;whatsappEnabled?:boolean}){
 const [copied,setCopied]=useState(false),[error,setError]=useState("");
 const clean=(phone?.trim().startsWith("+")?"+":"")+(phone||"").replace(/\D/g,"");
 const wa=whatsappNumber(whatsapp||"");
 const showPhone=phoneEnabled&&!!phone&&clean.replace(/\D/g,"").length>=8;
 const showWhatsapp=whatsappEnabled&&!!whatsapp&&wa.length>=10;
 async function copy(){if(!phone)return;try{await navigator.clipboard.writeText(phone);setError("");setCopied(true);setTimeout(()=>setCopied(false),1600)}catch{setError("Não foi possível copiar. Selecione o número: "+phone)}}
 if(!showPhone&&!showWhatsapp)return null;
 return <>
  {showPhone&&<a className="bio-action" href={"tel:"+clean}><span>☎</span><b>Ligar</b><small>↗</small></a>}
  {showWhatsapp&&<a className="bio-action" href={"https://wa.me/"+wa} target="_blank" rel="noopener noreferrer" data-contact="whatsapp"><span>◉</span><b>WhatsApp</b><small>↗</small></a>}
  {showPhone&&<button type="button" className="bio-action" onClick={copy} aria-label="Copiar número de telefone"><span>▣</span><b>{copied?"Número copiado":"Copiar número"}</b><small>✓</small></button>}
  {error&&<p role="status">{error}</p>}
 </>;
}
