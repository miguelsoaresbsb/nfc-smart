"use client";
import {useEffect} from "react";
async function track(companyId:string,eventType:"page_view"|"action_click",actionId?:string){try{await fetch("/api/analytics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId,eventType,actionId})})}catch{}}
export function PublicInteractions({companyId}:{companyId:string}){useEffect(()=>{track(companyId,"page_view");const h=(e:Event)=>{const el=(e.target as HTMLElement)?.closest("[data-action-id]") as HTMLElement|null;if(el?.dataset.actionId)track(companyId,"action_click",el.dataset.actionId)};document.addEventListener("click",h);return()=>document.removeEventListener("click",h)},[companyId]);return null}
