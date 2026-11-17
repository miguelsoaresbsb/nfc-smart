"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Bell, Check, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { billingAlertDescription, billingAlertTitle, operationalDate, type BillingAlertsResult } from "@/lib/operations";
import "./operations.css";

const PAGE_SIZE = 20;
type Filter = "active" | "resolved";

export default function BillingAlertsPanel({ refreshKey = 0, onActiveCountChange }: { refreshKey?: number | null; onActiveCountChange?: (count: number) => void }) {
  const sb = useMemo(createClient, []);
  const [data, setData] = useState<BillingAlertsResult | null>(null);
  const [filter, setFilter] = useState<Filter>("active"), [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const mounted = useRef(true), sequence = useRef(0), countCallback = useRef(onActiveCountChange);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { countCallback.current = onActiveCountChange; }, [onActiveCountChange]);

  const load = useCallback(async (scan = false) => {
    const request = ++sequence.current;
    const current = () => mounted.current && request === sequence.current;
    setLoading(true); setError("");
    try {
      if (scan) { const result = await sb.rpc("refresh_operational_alerts"); if (result.error) throw result.error; }
      const result = await sb.rpc("admin_billing_alerts", { p_state: filter, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE });
      if (result.error) throw result.error;
      if (!current()) return;
      const next = result.data as BillingAlertsResult;
      if (!next || !Array.isArray(next.items)) throw new Error("Invalid alert response");
      if (!next.items.length && page > 0) { setPage(0); return; }
      setData(next); countCallback.current?.(Number(next.active));
    } catch { if (current()) setError("Não conseguimos conferir os alertas. A última consulta pode estar desatualizada. Tente atualizar novamente."); }
    finally { if (current()) setLoading(false); }
  }, [sb, filter, page]);

  useEffect(() => {
    mounted.current = true; void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { mounted.current = false; sequence.current++; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [load, refreshKey]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function acknowledge(id: string) {
    if (busy || loading || error) return;
    setBusy(id); setNotice("");
    try {
      const result = await sb.rpc("acknowledge_billing_alert", { p_alert_id: id });
      if (result.error) throw result.error;
      if (!mounted.current) return;
      setNotice("Alerta marcado como visto. Ele permanece em acompanhamento até a causa ser resolvida.");
      await load();
    } catch { if (mounted.current) setError("Não foi possível marcar o alerta. Atualize a consulta para conferir a situação atual."); }
    finally { if (mounted.current) setBusy(""); }
  }

  return <section id="admin-alerts" className="admin-section operation-panel" aria-labelledby="billing-alerts-title">
    <div className="admin-section-heading operation-heading"><div><h2 id="billing-alerts-title"><Bell size={22} aria-hidden="true"/>Alertas de cobrança <span className="operation-count">{data ? data.active : "—"}</span></h2><p>Falhas de processamento, ativação e renovação. A conferência automática ocorre a cada cinco minutos.</p></div><button type="button" className="premium-btn" onClick={() => void load(true)} disabled={loading || Boolean(busy)}><RefreshCw size={16} aria-hidden="true"/>{loading ? "Conferindo…" : "Conferir agora"}</button></div>
    <p className="operation-explanation">Marcar como visto registra seu acompanhamento. O sistema resolve o alerta quando a confirmação de pagamento ou a condição da assinatura comprova a correção.</p>
    <div className="operation-toolbar"><label>Situação<select disabled={Boolean(busy)} value={filter} onChange={event => { setFilter(event.target.value as Filter); setPage(0); }}><option value="active">Em acompanhamento</option><option value="resolved">Resolvidos</option></select></label><p role="status">{data ? `${data.total} ${data.total === 1 ? "alerta" : "alertas"} · Consulta ${operationalDate(data.snapshot_at)}` : "Carregando alertas…"}</p></div>
    {error && <p ref={errorRef} className="operation-error" role="alert" tabIndex={-1}><AlertCircle size={18} aria-hidden="true"/>{error}</p>}
    {notice && <p className="operation-notice" role="status">{notice}</p>}
    <div className="operation-alert-list" aria-busy={loading}>{data?.items.map(alert => <article key={alert.id} className={`operation-alert is-${alert.severity}`}>
      <div className="operation-alert-heading"><h3>{billingAlertTitle(alert.kind)}</h3><span className={`operation-state is-${alert.state}`}>{alert.state === "resolved" ? "Resolvido" : alert.state === "acknowledged" ? "Visto · em acompanhamento" : "Novo"}</span></div>
      <p className="operation-company">{alert.company_name || "Empresa ainda não identificada"}</p><p>{billingAlertDescription(alert.reason_code)}</p>
      <dl><div><dt>Primeiro registro</dt><dd>{operationalDate(alert.first_seen_at)}</dd></div><div><dt>Último registro</dt><dd>{operationalDate(alert.last_seen_at)}</dd></div>{alert.kind === "webhook_failure" && <div><dt>Tentativas registradas</dt><dd>{alert.attempts}</dd></div>}{alert.resolved_at && <div><dt>Resolvido em</dt><dd>{operationalDate(alert.resolved_at)}</dd></div>}</dl>
      {(alert.order_ref || alert.contract_ref) && <details><summary>Referências para conferência na Cakto</summary>{alert.order_ref && <p>Pedido: <code>{alert.order_ref}</code></p>}{alert.contract_ref && <p>Contrato: <code>{alert.contract_ref}</code></p>}</details>}
      {alert.state === "open" && <button className="premium-btn" type="button" onClick={() => void acknowledge(alert.id)} disabled={Boolean(busy) || loading || Boolean(error)}><Check size={16} aria-hidden="true"/>{busy === alert.id ? "Registrando…" : "Marcar como visto"}</button>}
    </article>)}</div>
    {!loading && !error && !data?.items.length && <p className="operation-empty">{filter === "active" ? "Nenhum alerta de cobrança em acompanhamento." : "Nenhum alerta resolvido registrado."}</p>}
    {data && data.total > PAGE_SIZE && <nav className="operation-pagination" aria-label="Páginas de alertas"><button className="premium-btn" type="button" disabled={page === 0 || loading || Boolean(busy)} onClick={() => setPage(value => value - 1)}><ArrowLeft size={16} aria-hidden="true"/>Anterior</button><span>Página {page + 1} de {Math.ceil(data.total / PAGE_SIZE)}</span><button className="premium-btn" type="button" disabled={(page + 1) * PAGE_SIZE >= data.total || loading || Boolean(busy)} onClick={() => setPage(value => value + 1)}>Próxima<ArrowRight size={16} aria-hidden="true"/></button></nav>}
    <p className="operation-footnote">Horários de Brasília. Os alertas não modificam o acesso nem executam cobranças.</p>
  </section>;
}
