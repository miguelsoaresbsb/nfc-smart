import {notFound} from "next/navigation";
import {ArrowUpRight,MapPin,MessageCircle,Phone,Share2,Sparkles,Star,Wifi} from "lucide-react";
import {createClient} from "@/lib/supabase-server";

export default async function PublicPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;const s=await createClient();
 const {data:c}=await s.from("companies").select("*").eq("slug",slug).maybeSingle();if(!c)return notFound();
 const {data:sub}=await s.from("subscriptions").select("status,expires_at").eq("company_id",c.id).maybeSingle();
 const active=sub?.status==="active"&&(!sub.expires_at||new Date(sub.expires_at)>new Date());
 if(!active)return <main className="public-page public-offline"><div className="offline-card"><div className="public-mini-brand"><Wifi size={14}/> NFC SMART</div><div className="offline-icon"><Sparkles size={20}/></div><h1>Página temporariamente indisponível</h1><p>Esta página será reativada assim que a assinatura da empresa estiver regularizada.</p></div></main>;
 const [{data:actions},{data:qrs},{data:profile}]=await Promise.all([
  s.from("actions").select("*").eq("company_id",c.id).eq("enabled",true).order("position"),
  s.from("qr_codes").select("*").eq("company_id",c.id).eq("enabled",true).order("position"),
  s.from("profiles").select("cover_url").eq("company_id",c.id).limit(1).maybeSingle()
 ]);
 const cover=profile?.cover_url;
 const icon=(type:string)=>type==="whatsapp"?<MessageCircle size={18}/>:type==="phone"?<Phone size={18}/>:type==="google"?<Star size={18}/>:type==="maps"?<MapPin size={18}/>:<ArrowUpRight size={18}/>;
 return <main className="bio-public" style={{"--page-bg":c.background_color||"#f5f5f2","--button":c.primary_color||"#111111","--button-text":c.secondary_color||"#fff"} as React.CSSProperties}>
  <div className="bio-orb bio-orb-one"/><div className="bio-orb bio-orb-two"/>
  <section className="bio-shell">
   <div className="bio-cover">{cover?<img src={cover} alt="" />:<div className="bio-cover-art"><span/><span/><span/></div>}<div className="bio-cover-shade"/></div>
   <div className="bio-content">
    <div className="bio-avatar-wrap"><div className="bio-avatar">{c.logo_url?<img src={c.logo_url} alt={c.name}/>:<span>{c.name.slice(0,1).toUpperCase()}</span>}</div></div>
    <div className="bio-identity"><div className="bio-name-row"><h1>{c.name}</h1><span className="bio-check">✓</span></div>{c.description&&<p>{c.description}</p>}{c.address&&<div className="bio-location"><MapPin size={13}/>{c.address}</div>}</div>
    <div className="bio-actions">{(actions||[]).map((a:any)=><a className="bio-action" href={a.url||"#"} key={a.id}><span className="bio-action-icon">{icon(a.type)}</span><b>{a.label}</b><ArrowUpRight className="bio-action-arrow" size={16}/></a>)}</div>
    {(qrs||[]).map((q:any)=><div className="bio-qr" key={q.id}><div className="bio-qr-head"><span><QrLabel/></span><b>{q.name}</b></div><img src={q.image_url} alt={q.name}/>{q.description&&<p>{q.description}</p>}</div>)}
    <button className="bio-share" type="button"><Share2 size={15}/> Compartilhar página</button>
    <footer className="bio-footer"><span><Wifi size={12}/> NFC SMART</span><small>Toque. Conecte. Experimente.</small></footer>
   </div>
  </section>
 </main>
}
function QrLabel(){return <span className="qr-symbol">QR</span>}
