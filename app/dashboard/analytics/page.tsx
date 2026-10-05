"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, MousePointerClick, Eye, Percent, TrendingUp, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

export default function Analytics() {
  const s = createClient();
  const [stats, setStats] = useState([0, 0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await s.auth.getUser();
      if (!auth.user) {
        window.location.href = "/login";
        return;
      }

      const { data: member, error: memberError } = await s
        .from("company_members")
        .select("company_id")
        .eq("user_id", auth.user.id)
        .limit(1)
        .maybeSingle();

      if (memberError || !member) {
        setError(memberError?.message || "Empresa não encontrada.");
        setLoading(false);
        return;
      }

      const { data: events, error: eventError } = await s
        .from("analytics_events")
        .select("event_type")
        .eq("company_id", member.company_id);

      if (eventError) setError(eventError.message);
      else {
        const views = (events || []).filter((x) => x.event_type === "page_view").length;
        const clicks = (events || []).filter((x) => x.event_type === "action_click").length;
        setStats([views, clicks]);
      }

      setLoading(false);
    })();
  }, []);

  const ctr = stats[0] ? ((stats[1] / stats[0]) * 100).toFixed(1) : "0.0";

  return (
    <main className="premium-shell analytics-page">
      <header className="premium-nav">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark"><Wifi size={17} /></span>
          <span>NFC<span>SMART</span></span>
        </Link>
        <Link href="/dashboard" className="premium-btn"><ArrowLeft size={15} /> Painel</Link>
      </header>

      <section className="subpage">
        <div className="section-kicker"><span className="live-dot" /> INTELIGÊNCIA</div>
        <div className="hub-title">
          <div>
            <h1>Veja o que está <span>gerando atenção.</span></h1>
            <p>Acompanhe visualizações e cliques registrados na sua página pública.</p>
          </div>
          <div className="analytics-badge"><TrendingUp size={15} /> Dados em tempo real</div>
        </div>

        {error && <div className="notice">{error}</div>}

        <div className="analytics-grid">
          <Metric icon={Eye} title="Visualizações" value={loading ? "—" : stats[0].toLocaleString("pt-BR")} hint="Aberturas da página" />
          <Metric icon={MousePointerClick} title="Cliques" value={loading ? "—" : stats[1].toLocaleString("pt-BR")} hint="Ações acionadas" />
          <Metric icon={Percent} title="CTR" value={loading ? "—" : ctr + "%"} hint="Cliques / visualizações" />
        </div>

        <div className="analytics-note">
          <BarChart3 size={20} />
          <div>
            <b>Leitura dos dados</b>
            <span>O NFC SMART mede abertura da página e cliques nos botões. Um QR Code enviado como imagem continua estático, então o sistema não atribui um escaneamento individual a ele.</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, title, value, hint }: { icon: any; title: string; value: string; hint: string }) {
  return (
    <article className="metric-card">
      <div className="metric-icon"><Icon size={18} /></div>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{hint}</span>
    </article>
  );
}
