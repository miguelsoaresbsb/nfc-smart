import { NextResponse } from "next/server";
export async function POST(request:Request){
 const payload=await request.json().catch(()=>null);
 if(!payload)return NextResponse.json({ok:false},{status:400});
 console.log("Cakto webhook received",payload);
 return NextResponse.json({ok:true});
}