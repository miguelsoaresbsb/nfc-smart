import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase-server";
export default async function PublicPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params; const s=await createClient();
 const {data:c}=await s.from("companies").select("*").eq("slug",slug).maybeSingle();
 if(!c)return notFound();
 const {data:sub}=await s.from("subscriptions").select("status,expires_at").eq("company_id",c.id).maybeSingle();
 const active=sub?.status==="active"&&(!sub.expires_at||new Date(sub.expires_at)>new Date());
 if(!active)return <main className="public-page"><div className="public-card"><h1>Página temporariamente indisponível</h1><p>Esta página será reativada quando a assinatura estiver ativa.</p></div></main>;
 const [{data:actions},{data:qrs},{data:profile}]=await Promise.all([
  s.from("actions").select("*").eq("company_id",c.id).eq("enabled",true).order("position"),
  s.from("qr_codes").select("*").eq("company_id",c.id).eq("enabled",true).order("position"),
  s.from("profiles").select("cover_url").eq("company_id",c.id).maybeSingle()
 ]);
 const cover=profile?.cover_url;
 return <main className="public-page" style={{background:c.background_color||"#f5f5f5"}}><div className="public-wrap">{cover&&<img className="public-cover" src={cover} alt="capa"/>}<section className="public-card">{c.logo_url?<img className="public-avatar" src={c.logo_url} alt={c.name}/>:<div className="public-avatar public-initial">{c.name.slice(0,1)}</div>}<h1>{c.name}</h1>{c.description&&<p className="public-desc">{c.description}</p>}<div className="public-actions">{(actions||[]).map((a:any)=><a className="public-action" style={{background:c.primary_color||"#111",color:c.secondary_color||"#fff"}} href={a.url||"#"} key={a.id}>{a.label}</a>)}</div>{(qrs||[]).map((q:any)=><div className="public-qr" key={q.id}><img src={q.image_url} alt={q.name}/>{q.description&&<span>{q.description}</span>}</div>)}<footer>NFC Smart • toque para conectar</footer></section></div></main>
}