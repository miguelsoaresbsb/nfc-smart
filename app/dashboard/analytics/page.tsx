"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, MousePointerClick, Eye, Percent, TrendingUp, Wifi, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

type EventRow = { event_type: "page_view" | "action_click"; action_id: string | null; created_at: string };
type DayPoint = { label: string; views: number; clicks: number };
type ActionPoint = { id: string; label: string; clicks: number };

export default function Analytics() {
  const s = createClient();
  const [stats, setStats] = useState({ views: 0, clicks: 0, unique: 0 });
  const [days, setDays] = useState<DayPoint[]>([]);
  const [topActions, setTopActions] = useState<ActionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await s.auth.getUser();
      if (!auth.user) { window.location.href = "/login"; return; }
      const { data: member, error: memberError } = await s.from("company_members")
        .select("company_id").eq("user_id", auth.user.id).limit(1).maybeSingle();
      if (memberError || !member) {
        if (alive) { setError(memberError?.message || "Empresa não encontrada."); setLoading(false); }
        return;
      }

      const since = new Date();
      since.setDate(since.getDate() - 29);
      since.setHours(0, 0, 0, 0);
      const [eventResult, actionResult] = await Promise.all([
        s.from("analytics_events").select("event_type,action_id,created_at,session_id")
          .eq("company_id", member.company_id).gte("created_at", since.toISOString()).order("created_at", { ascending: true }),
        s.from("actions").select("id,label").eq("company_id", member.company_id),
      ]);
      if (!alive) return;
      if (eventResult.error) {
        setError(eventResult.error.message); setLoading(false); return;
      }

      const events = (eventResult.data || []) as (EventRow & { session_id?: string | null })[];
      const views = events.filter(x => x.event_type === "page_view");
      const clicks = events.filter(x => x.event_type === "action_click");
      const unique = new Set(views.map(x => x.session_id).filter(Boolean)).size;
      setStats({ views: views.length, clicks: clicks.length, unique });

      const buckets = new Map<string, DayPoint>();
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        buckets.set(key, { label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), views: 0, clicks: 0 });
      }
      for (const event of events) {
        const key = new Date(event.created_at).toISOString().slice(0, 10);
        const point = buckets.get(key);
        if (point) point[event.event_type === "page_view" ? "views" : "clicks"]++;
      }
      setDays(Array.from(buckets.values()));

      const labels = new Map((actionResult.data || []).map(x => [x.id, x.label]));
      const counts = new Map<string, number>();
      clicks.forEach(x => { if (x.action_id) counts.set(x.action_id, (counts.get(x.action_id) || 0) + 1); });
      setTopActions(Array.from(counts, ([id, count]) => ({ id, label: labels.get(id) || "Ação", clicks: count }))
        .sort((a, b) => b.clicks - a.clicks).slice(0, 5));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const ctr = stats.views ? ((stats.clicks / stats.views) * 100).toFixed(1) : "0,0";
  const max = Math.max(1, ...days.map(x => Math.max(x.views, x.clicks)));

  return (
    <main className="premium-shell analytics-page">
      <header className="premium-nav">
        <Link href="/dashboard" className="brand"><span className="brand-mark"><Wifi size={17}/></span><span>NFC<span>SMART</span></span></Link>
        <Link href="/dashboard" className="premium-btn"><ArrowLeft size={15}/> Painel</Link>
      </header>
      <section className="subpage">
        <div className="section-kicker"><span className="live-dot"/> INTELIGÊNCIA DO NEGÓCIO</div>
        <div className="hub-title">
          <div><h1>Seus dados. <span>Decisões melhores.</span></h1><p>Veja como as pessoas interagem com sua página pública nos últimos 30 dias.</p></div>
          <div className="analytics-badge"><CalendarDays size={15}/> Últimos 30 dias</div>
        </div>
        {error && <div className="notice">{error}</div>}
        <div className="analytics-grid">
          <Metric icon={Eye} title="Visualizações" value={loading ? "—" : stats.views.toLocaleString("pt-BR")} hint="Aberturas da página"/>
          <Metric icon={MousePointerClick} title="Cliques" value={loading ? "—" : stats.clicks.toLocaleString("pt-BR")} hint="Interações com ações"/>
          <Metric icon={Percent} title="Taxa de interação" value={loading ? "—" : ctr + "%"} hint="Cliques ÷ visualizações"/>
        </div>
        <div className="analytics-content-grid">
          <section className="analytics-panel">
            <div className="analytics-panel-heading"><div><b>Atividade diária</b><small>Visualizações e cliques por dia</small></div><BarChart3 size={19}/></div>
            {loading ? <p className="muted">Carregando dados...</p> : (
              <>
                <div className="analytics-legend"><span><i/> Visualizações</span><span><i/> Cliques</span></div>
                <div className="analytics-bars">
                  {days.map((d,i)=><div className="analytics-day" key={i} title={d.label+": "+d.views+" visualizações, "+d.clicks+" cliques"}>
                    <div className="analytics-bar-pair"><span className="analytics-bar views" style={{height:Math.max(d.views?3:1,(d.views/max)*100)+"%"}}/><span className="analytics-bar clicks" style={{height:Math.max(d.clicks?3:1,(d.clicks/max)*100)+"%"}}/></div>
                    {i%5===0||i===29?<small>{d.label}</small>:<small>&nbsp;</small>}
                  </div>)}
                </div>
                {!stats.views&&!stats.clicks&&<p className="analytics-empty">Ainda não há atividade registrada neste período. Compartilhe sua página para começar a acompanhar os resultados.</p>}
              </>
            )}
          </section>
          <section className="analytics-panel">
            <div className="analytics-panel-heading"><div><b>Ações mais acessadas</b><small>Cliques por botão</small></div><TrendingUp size={19}/></div>
            {loading ? <p className="muted">Carregando...</p> : topActions.length ? <div className="analytics-top-list">
              {topActions.map((a,i)=><div className="analytics-top-item" key={a.id}><span>{String(i+1).padStart(2,"0")}</span><b>{a.label}</b><strong>{a.clicks}</strong></div>)}
            </div> : <p className="analytics-empty">Os botões mais utilizados aparecerão aqui quando receberem cliques.</p>}
            <div className="analytics-unique"><span>Visitantes identificados por sessão</span><b>{loading?"—":stats.unique.toLocaleString("pt-BR")}</b></div>
          </section>
        </div>
        <div className="analytics-note"><BarChart3 size={20}/><div><b>Sobre os dados</b><span>As visualizações são registradas quando a página abre. Os cliques são registrados quando alguém aciona um botão rastreável. Visitantes únicos são estimados por sessão do navegador, não representam pessoas identificadas.</span></div></div>
      </section>
    </main>
  );
}

function Metric({icon:Icon,title,value,hint}:{icon:any;title:string;value:string;hint:string}) {
  return <article className="metric-card"><div className="metric-icon"><Icon size={18}/></div><small>{title}</small><strong>{value}</strong><span>{hint}</span></article>;
}
