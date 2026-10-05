"use client";
import {useState} from "react";
export function ContactActions({phone,whatsapp,phoneEnabled,whatsappEnabled}:{phone?:string|null;whatsapp?:string|null;phoneEnabled?:boolean;whatsappEnabled?:boolean}){
 const [copied,setCopied]=useState(false);
 const clean=(phone||"").replace(/\D/g,"");
 const waRaw=(whatsapp||"").replace(/\D/g,"");
 const wa=waRaw.length===10||waRaw.length===11?(waRaw.startsWith("55")?waRaw:"55"+waRaw):waRaw;
 async function copy(){if(!phone)return;try{await navigator.clipboard.writeText(phone);setCopied(true);setTimeout(()=>setCopied(false),1600)}catch{}}
 if((!phoneEnabled||!phone)&&(!whatsappEnabled||!whatsapp))return null;
 return <>
  {phoneEnabled&&phone&&<button className="bio-action" onClick={()=>window.location.href="tel:"+clean}><span>☎</span><b>Ligar</b><small>↗</small></button>}
  {whatsappEnabled&&whatsapp&&<a className="bio-action" href={"https://wa.me/"+wa} target="_blank" rel="noreferrer" data-contact="whatsapp"><span>◉</span><b>WhatsApp</b><small>↗</small></a>}
  {phone&&<button type="button" className="bio-action" onClick={copy} aria-label="Copiar número de telefone"><span>▣</span><b>{copied?"Número copiado":"Copiar número"}</b><small>✓</small></button>}
 </>;
}