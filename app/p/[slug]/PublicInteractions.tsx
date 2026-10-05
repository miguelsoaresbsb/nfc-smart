"use client";
import {useEffect} from "react";
import {Share2} from "lucide-react";

function sessionId(){const key="nfc-smart-session";let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id)}return id}
async function track(companyId:string,eventType:"page_view"|"action_click",actionId?:string){try{await fetch("/api/analytics/event",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId,eventType,actionId,sessionId:sessionId(),source:location.href,referrer:document.referrer||null,userAgent:navigator.userAgent})})}catch{}}
export function PageViewTracker({companyId}:{companyId:string}){useEffect(()=>{track(companyId,"page_view")},[companyId]);return null}
export function ActionTracker({companyId,actionId}:{companyId:string;actionId:string}){return <span className="sr-only" data-track-action={actionId} data-company={companyId}/>}
export function ShareButton({url,label="Compartilhar página"}:{url?:string;label?:string}){async function share(){const finalUrl=url?new URL(url,window.location.origin).href:window.location.href;try{if(navigator.share)await navigator.share({title:document.title,url:finalUrl});else{await navigator.clipboard.writeText(finalUrl);alert("Link copiado!")}}catch{}}return <button className="bio-share" type="button" onClick={share}><Share2 size={15}/>{label}</button>}
export function ActionClickBinder({companyId}:{companyId:string}){useEffect(()=>{const handler=(e:Event)=>{const el=(e.target as HTMLElement)?.closest("[data-action-id]") as HTMLElement|null;if(el){const id=el.dataset.actionId;if(id)track(companyId,"action_click",id)}};document.addEventListener("click",handler);return()=>document.removeEventListener("click",handler)},[companyId]);return null}
