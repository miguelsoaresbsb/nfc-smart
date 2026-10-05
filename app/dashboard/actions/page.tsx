"use client";

import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase-browser";

const types=[["whatsapp","WhatsApp","wa"],["instagram","Instagram","ig"],["google","Avaliação do Google","star"],["pix","PIX","pix"],["website","Site","web"],["phone","Telefone","tel"],["maps","Localização","map"],["custom","Personalizado","link"]];

export default function Actions(){
  const sb=createClient(),router=useRouter();
  const [id,setId]=useState(""),[items,setItems]=useState<any[]>([]),[qrCodes,setQrCodes]=useState<any[]>([]);
  const [f,setF]=useState({type:"whatsapp",label:"WhatsApp",url:"",pixKeyType:"random",pixKey:"",pixReceiver:"",pixAmount:"",pixDescription:"",pixCopyPaste:"",pixQrCodeId:""});
  async function load(cid:string){
    const {data}=await sb.from("actions").select("*").eq("company_id",cid).order("position");
    setItems(data||[]);
    const {data:qr}=await sb.from("qr_codes").select("id,name,image_url,description").eq("company_id",cid).eq("enabled",true).order("position");
    setQrCodes(qr||[]);
  }
  useEffect(()=>{(async()=>{const {data:{user}}=await sb.auth.getUser();if(!user)return router.push("/login");const {data:m}=await sb.from("company_members").select("company_id").eq("user_id",user.id).maybeSingle();if(!m)return router.push("/login");setId(m.company_id);load(m.company_id)})()},[]);
  async function add(e:React.FormEvent){
    e.preventDefault();
    const t=types.find(x=>x[0]===f.type);
    const payload:any={company_id:id,type:f.type,label:f.label||t?.[1],icon:t?.[2]||"link",position:items.length,enabled:true,url:f.type==="pix"?"#pix":f.url};
    if(f.type==="pix"){
      if(!f.pixKey && !f.pixCopyPaste) return;
      payload.pix_key=f.pixKey||null;
      payload.pix_key_type=f.pixKeyType;
      payload.pix_receiver_name=f.pixReceiver||null;
      payload.pix_amount=f.pixAmount?Number(f.pixAmount):null;
      payload.pix_description=f.pixDescription||null;
      payload.pix_copy_paste=f.pixCopyPaste||null;
      payload.pix_qr_code_id=f.pixQrCodeId||null;
    }
    const {error}=await sb.from("actions").insert(payload);
    if(error){alert(error.message);return}
    setF({type:"whatsapp",label:"WhatsApp",url:"",pixKeyType:"random",pixKey:"",pixReceiver:"",pixAmount:"",pixDescription:"",pixCopyPaste:"",pixQrCodeId:""});
    load(id);
  }
  async function remove(x:string){await sb.from("actions").delete().eq("id",x);load(id)}
  async function toggle(a:any){await sb.from("actions").update({enabled:!a.enabled}).eq("id",a.id);load(id)}
  return <main className="dash"><header><button onClick={()=>router.back()}>← Voltar</button><b className="logo">NFC<span>SMART</span></b></header><section className="panel wide"><p className="eyebrow">AÇÕES</p><h1>Crie seus próprios quadrados.</h1><p className="muted">Começa vazio. Você escolhe o que aparece.</p>
    <form className="action-form" onSubmit={add}>
      <select value={f.type} onChange={e=>setF({...f,type:e.target.value})}>{types.map(t=><option key={t[0]} value={t[0]}>{t[1]}</option>)}</select>
      <input placeholder="Nome" value={f.label} onChange={e=>setF({...f,label:e.target.value})}/>
      {f.type!=="pix" ? <input placeholder="URL ou destino" value={f.url} onChange={e=>setF({...f,url:e.target.value})} required/> :
      <div className="pix-action-form">
        <select value={f.pixKeyType} onChange={e=>setF({...f,pixKeyType:e.target.value})}><option value="random">Chave aleatória</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="phone">Telefone</option><option value="email">E-mail</option></select>
        <input placeholder="Chave PIX" value={f.pixKey} onChange={e=>setF({...f,pixKey:e.target.value})}/>
        <input placeholder="Nome do recebedor (opcional)" value={f.pixReceiver} onChange={e=>setF({...f,pixReceiver:e.target.value})}/>
        <input type="number" min="0" step="0.01" placeholder="Valor (opcional)" value={f.pixAmount} onChange={e=>setF({...f,pixAmount:e.target.value})}/>
        <input placeholder="Descrição (opcional)" value={f.pixDescription} onChange={e=>setF({...f,pixDescription:e.target.value})}/>
        <input placeholder="Pix Copia e Cola (opcional)" value={f.pixCopyPaste} onChange={e=>setF({...f,pixCopyPaste:e.target.value})}/>
        <select value={f.pixQrCodeId} onChange={e=>setF({...f,pixQrCodeId:e.target.value})}><option value="">Sem QR Code</option>{qrCodes.map(q=><option key={q.id} value={q.id}>{q.name}</option>)}</select>
        <small className="muted">Use um QR Code que você já enviou ao NFC SMART. O sistema não gera QR.</small>
      </div>}
      <button className="btn dark">Adicionar</button>
    </form>
    <div className="action-list">{items.map(a=><div className={"action-item "+(!a.enabled?"off":"")} key={a.id}><b>{a.icon}</b><div><strong>{a.label}</strong><small>{a.type==="pix" ? (a.pix_key ? "PIX · "+a.pix_key : "PIX · Copia e Cola") : a.url}</small></div><button onClick={()=>toggle(a)}>{a.enabled?"Ativo":"Inativo"}</button><button onClick={()=>remove(a.id)}>Excluir</button></div>)}</div>
  </section></main>
}
