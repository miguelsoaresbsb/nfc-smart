import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase-server";
export async function POST(request:Request){
 const body=await request.json().catch(()=>null) as any;
 if(!body?.companyId||!["page_view","action_click"].includes(body.eventType))return NextResponse.json({ok:false},{status:400});
 const s=await createClient();
 const {data:company}=await s.from("companies").select("id").eq("id",body.companyId).maybeSingle();
 if(!company)return NextResponse.json({ok:false},{status:404});
 const {error}=await s.from("analytics_events").insert({company_id:body.companyId,action_id:body.actionId||null,event_type:body.eventType,session_id:String(body.sessionId||"").slice(0,120)||null,source:String(body.source||"").slice(0,500)||null,user_agent:String(body.userAgent||"").slice(0,1000)||null,referrer:String(body.referrer||"").slice(0,500)||null});
 if(error)return NextResponse.json({ok:false},{status:500});
 return NextResponse.json({ok:true});
}
