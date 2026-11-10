"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, MousePointerClick, Eye, Users, TrendingUp, Lightbulb, RefreshCw, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { analyticsDay, analyticsWindow, analyticsChange, analyticsMonthly, analyticsInsight, summarizeAnalytics, contactLabels, readAllPages,
  type AnalyticsEvent, type AnalyticsPeriod, type AnalyticsPoint, type AnalyticsStats } from "@/lib/analytics";
import "./analytics.css";

type ActionPoint = { id: string; label: string; clicks: number };
const emptyStats: AnalyticsStats = { views: 0, clicks: 0, unique: 0 };

export default function Analytics() {
  const [period, setPeriod] = useState<AnalyticsPeriod>(30);
  const [grouping, setGrouping] = useState<"day" | "month">("day");
  const [stats, setStats] = useState(emptyStats);
  const [previous, setPrevious] = useState(emptyStats);
  const [days, setDays] = useState<AnalyticsPoint[]>([]);
  const [topActions, setTopActions] = useState<ActionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    setLoading(true); setError("");
    (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError && authError.name !== "AuthSessionMissingError") throw new Error("Sessão indisponível");
        if (!auth.user) { if (alive) window.location.href = "/login"; return; }
        const { data: member, error: memberError } = await supabase.from("company_members")
          .select("company_id").eq("user_id", auth.user.id).limit(1).maybeSingle();
        if (memberError || !member) throw new Error("Empresa indisponível");
        const range = analyticsWindow(new Date(), period);
        const [events, actions] = await Promise.all([
          readAllPages<AnalyticsEvent>((from, to) => supabase.from("analytics_events")
            .select("event_type,action_id,contact_type,created_at,session_id")
            .eq("company_id", member.company_id).gte("created_at", range.previousSince).lte("created_at", range.until)
            .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to), () => alive),
          readAllPages<{ id: string; label: string }>((from, to) => supabase.from("actions")
            .select("id,label").eq("company_id", member.company_id).order("id").range(from, to), () => alive),
        ]);
        if (!alive) return;
        const currentEvents = events.filter(event => {
          const timestamp = new Date(event.created_at).getTime();
          return timestamp >= new Date(range.since).getTime() && timestamp <= new Date(range.until).getTime();
        });
        setStats(summarizeAnalytics(currentEvents, range.since, range.until));
        setPrevious(summarizeAnalytics(events, range.previousSince, range.previousUntil));
        const buckets = new Map(range.days.map(day => [day.key, { ...day }]));
        const counts = new Map<string, number>();
        for (const event of currentEvents) {
          const point = buckets.get(analyticsDay(new Date(event.created_at)));
          if (point) point[event.event_type === "page_view" ? "views" : "clicks"]++;
          if (event.event_type === "action_click") {
            const id = event.contact_type ? `contact:${event.contact_type}` : event.action_id || "deleted";
            counts.set(id, (counts.get(id) || 0) + 1);
          }
        }
        setDays(Array.from(buckets.values()));
        const labels = new Map(actions.map(action => [action.id, action.label]));
        for (const [contact, label] of Object.entries(contactLabels)) labels.set(`contact:${contact}`, label);
        setTopActions(Array.from(counts, ([id, clicks]) => ({ id, label: labels.get(id) || "Ação removida", clicks }))
          .sort((a, b) => b.clicks - a.clicks || a.label.localeCompare(b.label, "pt-BR")).slice(0, 5));
        setUpdatedAt(new Date(range.until).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }));
      } catch {
        if (alive) setError("Não foi possível carregar os resultados. Tente novamente.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey, period]);

  const points = grouping === "month" ? analyticsMonthly(days) : days;
  const max = Math.max(1, ...points.map(point => Math.max(point.views, point.clicks)));
  const average = stats.views ? (stats.clicks / stats.views).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—";
  const unavailable = loading || Boolean(error);
  const labelStep = Math.max(1, Math.ceil(points.length / 7));

  return <main className="premium-shell analytics-page">
    <section className="subpage">
      <div className="section-kicker">RESULTADOS</div>
      <div className="hub-title"><div><h1>Entenda suas <span>conexões.</span></h1><p>Veja quantas vezes sua página foi aberta e quais botões despertaram interesse.</p></div></div>
      <div className="analytics-toolbar">
        <div className="analytics-periods" role="group" aria-label="Período dos resultados">{([7, 30, 90] as const).map(value =>
          <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>Últimos {value} dias</button>)}</div>
        <div className="analytics-refresh"><span className="analytics-freshness">{!unavailable && updatedAt ? `Atualizado às ${updatedAt}` : loading ? "Carregando resultados…" : ""}</span><button className="premium-btn" type="button" disabled={loading} onClick={() => setReloadKey(key => key + 1)}><RefreshCw size={14}/> Atualizar</button></div>
      </div>
      <p className="analytics-comparison-note">Comparação com o mesmo intervalo anterior, até o mesmo horário de Brasília. O dia de hoje ainda está em andamento.</p>
      {error && <div className="notice" role="alert">{error} <button type="button" className="premium-btn" onClick={() => setReloadKey(key => key + 1)}>Tentar novamente</button></div>}
      <div className="analytics-grid">
        <Metric icon={Eye} title="Visitas à página" value={unavailable ? "—" : stats.views.toLocaleString("pt-BR")} hint="Cada abertura da página" change={unavailable ? "" : analyticsChange(stats.views, previous.views)}/>
        <Metric icon={MousePointerClick} title="Cliques nos botões" value={unavailable ? "—" : stats.clicks.toLocaleString("pt-BR")} hint="Uma visita pode gerar vários cliques" change={unavailable ? "" : analyticsChange(stats.clicks, previous.clicks)}/>
        <Metric icon={Users} title="Sessões estimadas" value={unavailable ? "—" : stats.unique.toLocaleString("pt-BR")} hint="Navegações identificadas no navegador" change={unavailable ? "" : analyticsChange(stats.unique, previous.unique)}/>
      </div>
      {!unavailable && <div className="analytics-insight"><Lightbulb size={19}/><div><b>O que observar</b><p>{analyticsInsight(stats, topActions[0]?.label)}</p></div></div>}
      <div className="analytics-content-grid">
        <section className="analytics-panel">
          <div className="analytics-panel-heading"><div><b>Evolução da página</b><small>Visitas e cliques no período selecionado</small></div><label className="analytics-grouping">Agrupar por<select aria-label="Agrupar gráfico" value={grouping} onChange={event => setGrouping(event.target.value as "day" | "month")}><option value="day">Dia</option><option value="month">Mês</option></select></label></div>
          {error ? <p className="muted">Dados indisponíveis.</p> : loading ? <p className="muted" role="status">Carregando dados…</p> : <>
            <div className="analytics-legend"><span><i/> Visitas</span><span><i/> Cliques</span></div>
            <div className="analytics-chart-scroll" role="region" aria-label="Gráfico de visitas e cliques" tabIndex={period === 90 && grouping === "day" ? 0 : undefined}>
              <div className={`analytics-bars ${grouping === "month" ? "analytics-bars-monthly" : period === 90 ? "analytics-bars-wide" : ""}`} style={{ gridTemplateColumns: `repeat(${Math.max(1, points.length)}, minmax(0, 1fr))` }}>
                {points.map((point, index) => <div className="analytics-day" key={point.key} title={`${point.label}: ${point.views} visitas, ${point.clicks} cliques`}>
                  <div className="analytics-bar-pair"><span className="analytics-bar views" style={{ height: `${Math.max(point.views ? 3 : 1, point.views / max * 100)}%` }}/><span className="analytics-bar clicks" style={{ height: `${Math.max(point.clicks ? 3 : 1, point.clicks / max * 100)}%` }}/></div>
                  <small>{grouping === "month" || index % labelStep === 0 || index === points.length - 1 ? point.label : "\u00a0"}</small>
                </div>)}
              </div>
            </div>
            {grouping === "month" && <p className="analytics-chart-help">Cada mês reúne apenas os dias incluídos no período selecionado. O primeiro e o último mês podem estar incompletos.</p>}
            {!stats.views && !stats.clicks && <p className="analytics-empty">Os primeiros resultados aparecerão aqui quando sua página receber visitas.</p>}
            <details className="analytics-chart-help"><summary>Ver os valores do gráfico</summary><table><thead><tr><th scope="col">{grouping === "month" ? "Mês" : "Dia"}</th><th scope="col">Visitas</th><th scope="col">Cliques</th></tr></thead><tbody>{points.map(point => <tr key={point.key}><th scope="row">{point.label}</th><td>{point.views}</td><td>{point.clicks}</td></tr>)}</tbody></table></details>
          </>}
        </section>
        <section className="analytics-panel">
          <div className="analytics-panel-heading"><div><b>Botões mais utilizados</b><small>Os cinco destaques do período</small></div><TrendingUp size={19}/></div>
          {error ? <p className="muted">Dados indisponíveis.</p> : loading ? <p className="muted">Carregando…</p> : topActions.length ? <div className="analytics-top-list">{topActions.map((action, index) =>
            <div className="analytics-top-item" key={action.id}><span>{String(index + 1).padStart(2, "0")}</span><b>{action.label}</b><strong>{action.clicks.toLocaleString("pt-BR")}</strong><div className="analytics-ranking-bar" aria-hidden="true"><i style={{ width: `${action.clicks / topActions[0].clicks * 100}%` }}/></div></div>)}</div>
            : <p className="analytics-empty">Quando alguém usar seus botões, você verá os mais procurados aqui. <Link className="analytics-empty-link" href="/dashboard/actions">Revisar meus botões</Link></p>}
          <div className="analytics-unique"><span>Média de cliques por visita</span><b>{unavailable ? "—" : average}</b></div>
          <p className="analytics-chart-help">A média pode ser maior que 1: o mesmo visitante pode abrir mais de um botão.</p>
        </section>
      </div>
      <div className="analytics-note"><BarChart3 size={20}/><div><b>Como interpretar</b><span>Visitas contam aberturas; cliques contam o uso dos botões, incluindo telefone e WhatsApp. Sessões são estimativas do navegador e não identificam pessoas. Bloqueadores e falhas de conexão podem reduzir a contagem. Os dados de contatos passam a ser registrados a partir desta atualização, sem armazenar números neste relatório.</span></div></div>
    </section>
  </main>;
}

function Metric({ icon: Icon, title, value, hint, change }: { icon: LucideIcon; title: string; value: string; hint: string; change: string }) {
  return <article className="metric-card"><div className="metric-icon"><Icon size={18}/></div><small>{title}</small><strong>{value}</strong><span>{hint}</span>{change && <span className="analytics-metric-change">{change}</span>}</article>;
}
