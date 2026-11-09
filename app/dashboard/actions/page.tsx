"use client";

import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase-browser";
import {actionTarget} from "@/lib/action-target";

const types=[["whatsapp","WhatsApp","wa"],["instagram","Instagram","ig"],["google","Avaliação do Google","star"],["pix","PIX","pix"],["website","Site","web"],["phone","Telefone","tel"],["maps","Localização","map"],["wifi","Wi-Fi","wifi"],["custom","Personalizado","link"]];

export default function Actions(){
  const sb=useMemo(()=>createClient(),[]),router=useRouter();
  const [message,setMessage]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [id,setId]=useState(""),[items,setItems]=useState<any[]>([]),[qrCodes,setQrCodes]=useState<any[]>([]);
  const [f,setF]=useState({type:"whatsapp",label:"WhatsApp",url:"",pixKeyType:"random",pixKey:"",pixReceiver:"",pixAmount:"",pixDescription:"",pixCopyPaste:"",pixQrCodeId:"",wifiSsid:"",wifiPassword:"",wifiSecurity:"WPA",wifiHidden:false,wifiQrCodeId:""});
  async function load(cid:string){
    const {data,error}=await sb.from("actions").select("*").eq("company_id",cid).order("position");
    if(error){setMessage(error.message);setLoading(false);return;}
    setItems(data||[]);
    const {data:qr,error:qrError}=await sb.from("qr_codes").select("id,name,image_url,description").eq("company_id",cid).eq("enabled",true).order("position");
    if(qrError)setMessage(qrError.message);
    setQrCodes(qr||[]);setLoading(false);
  }
  useEffect(()=>{(async()=>{const {data:{user}}=await sb.auth.getUser();if(!user)return router.push("/login");const {data:m}=await sb.from("company_members").select("company_id").eq("user_id",user.id).limit(1).maybeSingle();if(!m)return router.push("/acesso-pendente");setId(m.company_id);await load(m.company_id)})().catch(()=>{setMessage("Não foi possível carregar as ações. Atualize a página para tentar novamente.");setLoading(false);})},[router,sb]);
  async function add(e:React.FormEvent){
    e.preventDefault();
    if(!id||busy||loading)return;
    setMessage("");
    const t=types.find(x=>x[0]===f.type);
    let target="";
    try{target=f.type==="pix"?"#pix":f.type==="wifi"?"#wifi":actionTarget(f.type,f.url);}catch(error){setMessage(error instanceof Error?error.message:"Destino inválido.");return;}
    if(f.type==="pix"&&!f.pixKey.trim()&&!f.pixCopyPaste.trim()&&!f.pixQrCodeId){setMessage("Informe uma chave PIX, um código Copia e Cola ou selecione um QR Code.");return;}
    if(f.type==="wifi"&&(!f.wifiSsid.trim()||(f.wifiSecurity!=="nopass"&&!f.wifiPassword))){setMessage("Informe a rede e a senha do Wi-Fi, ou selecione Sem senha.");return;}
    setBusy(true);
    const payload:any={company_id:id,type:f.type,label:f.label.trim()||t?.[1],icon:t?.[2]||"link",position:items.reduce((max,item)=>Math.max(max,item.position),-1)+1,enabled:true,url:target};
    if(f.type==="wifi"){payload.wifi_ssid=f.wifiSsid.trim();payload.wifi_password=f.wifiPassword||null;payload.wifi_security=f.wifiSecurity;payload.wifi_hidden=f.wifiHidden;payload.wifi_qr_code_id=f.wifiQrCodeId||null;}
    if(f.type==="pix"){
      payload.pix_key=f.pixKey||null;
      payload.pix_key_type=f.pixKeyType;
      payload.pix_receiver_name=f.pixReceiver||null;
      payload.pix_amount=f.pixAmount?Number(f.pixAmount):null;
      payload.pix_description=f.pixDescription||null;
      payload.pix_copy_paste=f.pixCopyPaste||null;
      payload.pix_qr_code_id=f.pixQrCodeId||null;
    }
    const {error}=await sb.from("actions").insert(payload);
    if(error){setMessage(error.message);setBusy(false);return}
    setF({type:"whatsapp",label:"WhatsApp",url:"",pixKeyType:"random",pixKey:"",pixReceiver:"",pixAmount:"",pixDescription:"",pixCopyPaste:"",pixQrCodeId:"",wifiSsid:"",wifiPassword:"",wifiSecurity:"WPA",wifiHidden:false,wifiQrCodeId:""});
    setMessage("Ação adicionada.");setBusy(false);await load(id);
  }
  async function remove(x:string){
    if(busy||!confirm("Excluir esta ação?"))return;
    setBusy(true);const {error}=await sb.from("actions").delete().eq("id",x).eq("company_id",id).select("id").single();
    if(error)setMessage(error.message);else {setMessage("Ação excluída.");await load(id);}setBusy(false);
  }
  async function toggle(a:any){
    if(busy)return;
    setBusy(true);const {error}=await sb.from("actions").update({enabled:!a.enabled}).eq("id",a.id).eq("company_id",id).select("id").single();
    if(error)setMessage(error.message);else await load(id);setBusy(false);
  }
  return <main className="premium-shell actions-premium"><header className="premium-nav"><button className="premium-btn" onClick={()=>router.back()}>← Voltar</button><b className="brand"><span className="brand-mark">N</span><span>NFC<span>SMART</span></span></b><span className="section-kicker">EDITOR DE AÇÕES</span></header><section className="subpage actions-content"><div className="section-kicker"><span className="live-dot"/> PERSONALIZE SUA PÁGINA</div><div className="hub-title"><div><h1>Conexões rápidas. <span>Do seu jeito.</span></h1><p>Adicione os atalhos que seus clientes precisam para entrar em contato, pagar, encontrar sua empresa ou se conectar.</p></div></div><div className="actions-workspace"><div className="actions-builder"><p className="eyebrow">NOVA AÇÃO</p><h2>Adicionar um botão</h2>
    {message&&<p className="notice" role="status">{message}</p>}
    <form className="action-form" onSubmit={add}>
      <select value={f.type} onChange={e=>{const next=types.find(t=>t[0]===e.target.value);setF({...f,type:e.target.value,label:next?.[1]||"",url:""})}} aria-label="Tipo da ação">{types.map(t=><option key={t[0]} value={t[0]}>{t[1]}</option>)}</select>
      <input placeholder="Nome" aria-label="Nome do botão" maxLength={80} value={f.label} onChange={e=>setF({...f,label:e.target.value})}/>
      {f.type==="wifi" ? <div className="pix-action-form"><input placeholder="Nome da rede (SSID)" value={f.wifiSsid} onChange={e=>setF({...f,wifiSsid:e.target.value})} required/><input type="text" placeholder="Senha do Wi-Fi" value={f.wifiPassword} onChange={e=>setF({...f,wifiPassword:e.target.value})}/><select value={f.wifiSecurity} onChange={e=>setF({...f,wifiSecurity:e.target.value})}><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">Sem senha</option></select><label className="checkline"><input type="checkbox" checked={f.wifiHidden} onChange={e=>setF({...f,wifiHidden:e.target.checked})}/> Rede oculta</label><select value={f.wifiQrCodeId} onChange={e=>setF({...f,wifiQrCodeId:e.target.value})}><option value="">Sem QR Code Wi-Fi</option>{qrCodes.map(q=><option key={q.id} value={q.id}>{q.name}</option>)}</select><small className="muted">Envie o QR Code em <b>QR Codes</b> e selecione aqui. O NFC SMART não gera QR Code.</small></div> : f.type!=="pix" ? <input placeholder="URL ou destino" value={f.url} onChange={e=>setF({...f,url:e.target.value})} required/> :
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
      <button className="btn dark" disabled={busy||loading||!id}>{busy?"Salvando...":"Adicionar"}</button>
    </form></div><div className="actions-existing"><div className="actions-existing-heading"><div><p className="eyebrow">SEUS BOTÕES</p><h2>Organize suas conexões</h2></div><span>{items.length} itens</span></div><div className="action-list">{items.map(a=><div className={"action-item "+(!a.enabled?"off":"")} key={a.id}><b>{a.icon}</b><div><strong>{a.label}</strong><small>{a.type==="pix" ? (a.pix_key ? "PIX · "+a.pix_key : "PIX · Copia e Cola") : a.type==="wifi" ? "Wi-Fi · "+(a.wifi_ssid||"Rede") : a.url}</small></div><button disabled={busy} onClick={()=>toggle(a)}>{a.enabled?"Ativo":"Inativo"}</button><button disabled={busy} onClick={()=>remove(a.id)}>Excluir</button></div>)}</div></div></div></section></main>
}
