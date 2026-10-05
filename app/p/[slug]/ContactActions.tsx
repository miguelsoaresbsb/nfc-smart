"use client";
import {useState} from "react";
export function ContactActions({phone,whatsapp,phoneEnabled,whatsappEnabled}:{phone?:string|null;whatsapp?:string|null;phoneEnabled?:boolean;whatsappEnabled?:boolean}){
 const [copied,setCopied]=useState(false);
 const clean=(phone||"").replace(/\\D/g,"");
 const wa=(whatsapp||"").replace(/\\D/g,"");
 async function copy(){if(!phone)return;await navigator.clipboard.writeText(phone);setCopied(true);setTimeout(()=>setCopied(false),1600)}
 if((!phoneEnabled||!phone)&&(!whatsappEnabled||!whatsapp))return null;
 return <>
  {phoneEnabled&&phone&&<button className="bio-action" onClick={()=>window.location.href="tel:"+clean}><span>☎</span><b>Ligar</b><small>↗</small></button>}
  {whatsappEnabled&&whatsapp&&<a className="bio-action" href={"https://wa.me/"+wa} target="_blank" rel="noreferrer" data-contact="whatsapp"><span>◉</span><b>WhatsApp</b><small>↗</small></a>}
  {phone&&<button className="bio-action" onClick={copy}><span>▣</span><b>{copied?"Número copiado":"Copiar número"}</b><small>✓</small></button>}
 </>
}
