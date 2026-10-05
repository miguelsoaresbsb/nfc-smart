"use client";

import {useState} from "react";

type PixActionData={
  id:string;
  label:string;
  pix_key?:string|null;
  pix_key_type?:string|null;
  pix_receiver_name?:string|null;
  pix_amount?:number|null;
  pix_description?:string|null;
  pix_copy_paste?:string|null;
  pix_qr_code_id?:string|null;
  qr_code?:{image_url:string;name:string}|null;
};

export function PixAction({action}:{action:PixActionData}){
  const [open,setOpen]=useState(false);
  const [copied,setCopied]=useState("");
  async function copy(value:string,type:string){
    try{await navigator.clipboard.writeText(value);setCopied(type);setTimeout(()=>setCopied(""),1800)}catch{}
  }
  return <>
    <button className="bio-action" data-action-id={action.id} onClick={()=>setOpen(true)}>
      <span>₿</span><b>{action.label}</b><small>↗</small>
    </button>
    {open&&<div className="pix-modal-backdrop" onClick={()=>setOpen(false)}>
      <section className="pix-modal" onClick={e=>e.stopPropagation()}>
        <button className="pix-close" onClick={()=>setOpen(false)}>×</button>
        <div className="pix-modal-icon">PIX</div>
        <p className="eyebrow">PAGAMENTO</p>
        <h2>Pague via PIX</h2>
        {action.pix_receiver_name&&<p className="pix-receiver">{action.pix_receiver_name}</p>}
        {action.pix_amount!=null&&<strong className="pix-amount">R$ {Number(action.pix_amount).toFixed(2).replace(".",",")}</strong>}
        {action.pix_description&&<p className="pix-description">{action.pix_description}</p>}
        {action.qr_code?.image_url&&<img className="pix-qr" src={action.qr_code.image_url} alt="QR Code PIX" />}
        {action.pix_copy_paste&&<button className="pix-copy" onClick={()=>copy(action.pix_copy_paste!,"copypaste")}>{copied==="copypaste"?"Copiado!":"Copiar Pix Copia e Cola"}</button>}
        {action.pix_key&&<div className="pix-key-box"><small>CHAVE PIX · {action.pix_key_type||"chave"}</small><strong>{action.pix_key}</strong><button className="pix-copy" onClick={()=>copy(action.pix_key!,"key")}>{copied==="key"?"Copiado!":"Copiar chave PIX"}</button></div>}
        <p className="pix-help">Depois de copiar, abra o aplicativo do seu banco e faça o pagamento.</p>
      </section>
    </div>}
  </>;
}
