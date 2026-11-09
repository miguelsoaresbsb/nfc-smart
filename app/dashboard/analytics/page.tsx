"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, MousePointerClick, Eye, Percent, TrendingUp, Wifi, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { analyticsDay, analyticsWindow, readAllPages, type AnalyticsEvent } from "@/lib/analytics";

type DayPoint = { label: string; views: number; clicks: number };
type ActionPoint = { id: string; label: string; clicks: number };

export default function Analytics() {
  const [stats, setStats] = useState({ views: 0, clicks: 0, unique: 0 });
  const [days, setDays] = useState<DayPoint[]>([]);
  const [topActions, setTopActions] = useState<ActionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const s = createClient();
    setLoading(true);
    setError("");
    (async () => {
      try {
        const { data: auth, error: authError } = await s.auth.getUser();
        if (authError && authError.name !== "AuthSessionMissingError") {
          throw new Error("Não foi possível validar sua sessão. Tente novamente.");
        }
        if (!auth.user) { if (alive) window.location.href = "/login"; return; }
        const { data: member, error: memberError } = await s.from("company_members")
          .select("company_id").eq("user_id", auth.user.id).limit(1).maybeSingle();
        if (memberError) throw new Error("Não foi possível carregar sua empresa.");
        if (!member) throw new Error("Empresa não encontrada.");

        const period = analyticsWindow();
        const [events, actions] = await Promise.all([
          readAllPages<AnalyticsEvent>((from, to) => s.from("analytics_events")
            .select("event_type,action_id,created_at,session_id")
            .eq("company_id", member.company_id).gte("created_at", period.since).lte("created_at", period.until)
            .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to), () => alive),
          readAllPages<{ id: string; label: string }>((from, to) => s.from("actions")
            .select("id,label").eq("company_id", member.company_id).order("id").range(from, to), () => alive),
        ]);
        if (!alive) return;
        const views = events.filter(x => x.event_type === "page_view");
        const clicks = events.filter(x => x.event_type === "action_click");
        const unique = new Set(views.map(x => x.session_id).filter(Boolean)).size;
        setStats({ views: views.length, clicks: clicks.length, unique });

        const buckets = new Map(period.days.map(day => [day.key, day]));
        for (const event of events) {
          const point = buckets.get(analyticsDay(new Date(event.created_at)));
          if (point) point[event.event_type === "page_view" ? "views" : "clicks"]++;
        }
        setDays(Array.from(buckets.values()));

        const labels = new Map(actions.map(x => [x.id, x.label]));
        const counts = new Map<string, number>();
        clicks.forEach(x => { if (x.action_id) counts.set(x.action_id, (counts.get(x.action_id) || 0) + 1); });
        setTopActions(Array.from(counts, ([id, count]) => ({ id, label: labels.get(id) || "Ação removida", clicks: count }))
          .sort((a, b) => b.clicks - a.clicks).slice(0, 5));
      } catch {
        if (alive) setError("Não foi possível carregar os dados. Tente novamente.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  const ctr = stats.views ? ((stats.clicks / stats.views) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "0,0";
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
        {error && <div className="notice" role="alert">{error} <button type="button" className="premium-btn" onClick={() => setReloadKey(key => key + 1)}>Tentar novamente</button></div>}
        <div className="analytics-grid">
          <Metric icon={Eye} title="Visualizações" value={loading || error ? "—" : stats.views.toLocaleString("pt-BR")} hint="Aberturas da página"/>
          <Metric icon={MousePointerClick} title="Cliques" value={loading || error ? "—" : stats.clicks.toLocaleString("pt-BR")} hint="Interações com ações"/>
          <Metric icon={Percent} title="Taxa de interação" value={loading || error ? "—" : ctr + "%"} hint="Cliques ÷ visualizações"/>
        </div>
        <div className="analytics-content-grid">
          <section className="analytics-panel">
            <div className="analytics-panel-heading"><div><b>Atividade diária</b><small>Visualizações e cliques por dia</small></div><BarChart3 size={19}/></div>
            {error ? <p className="muted">Dados indisponíveis.</p> : loading ? <p className="muted">Carregando dados...</p> : (
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
            {error ? <p className="muted">Dados indisponíveis.</p> : loading ? <p className="muted">Carregando...</p> : topActions.length ? <div className="analytics-top-list">
              {topActions.map((a,i)=><div className="analytics-top-item" key={a.id}><span>{String(i+1).padStart(2,"0")}</span><b>{a.label}</b><strong>{a.clicks}</strong></div>)}
            </div> : <p className="analytics-empty">Os botões mais utilizados aparecerão aqui quando receberem cliques.</p>}
            <div className="analytics-unique"><span>Visitantes identificados por sessão</span><b>{loading || error ? "—":stats.unique.toLocaleString("pt-BR")}</b></div>
          </section>
        </div>
        <div className="analytics-note"><BarChart3 size={20}/><div><b>Sobre os dados</b><span>As visualizações são registradas quando a página abre. Os cliques são registrados quando alguém aciona um botão rastreável. Visitantes únicos são estimados por sessão do navegador, não representam pessoas identificadas. Os dias seguem o horário de Brasília.</span></div></div>
      </section>
    </main>
  );
}

function Metric({icon:Icon,title,value,hint}:{icon:any;title:string;value:string;hint:string}) {
  return <article className="metric-card"><div className="metric-icon"><Icon size={18}/></div><small>{title}</small><strong>{value}</strong><span>{hint}</span></article>;
}
