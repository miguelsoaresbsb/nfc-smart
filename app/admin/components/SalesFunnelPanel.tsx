"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { operationalDate, type SalesFunnel } from "@/lib/operations";
import "./operations.css";

const stages = [
  { key: "registered", label: "Cadastro", description: "Contas criadas no período selecionado." },
  { key: "confirmed", label: "E-mail confirmado", description: "Contas com endereço de e-mail confirmado." },
  { key: "approved", label: "Aprovação", description: "Contas aprovadas e vinculadas à empresa." },
  { key: "paid", label: "Pagamento comprovado", description: "Contas com pagamento processado no histórico da Cakto." },
  { key: "ready", label: "Página pronta", description: "Assinatura válida, apresentação e ao menos um contato ou botão ativo." },
] as const;

export default function SalesFunnelPanel({ refreshKey = 0 }: { refreshKey?: number | null }) {
  const sb = useMemo(createClient, []);
  const [days, setDays] = useState(30), [data, setData] = useState<SalesFunnel | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const mounted = useRef(true), sequence = useRef(0), errorRef = useRef<HTMLParagraphElement>(null);
  const load = useCallback(async () => {
    const request = ++sequence.current; const current = () => mounted.current && request === sequence.current;
    setLoading(true); setError("");
    try {
      const result = await sb.rpc("admin_sales_funnel", { p_days: days });
      if (result.error) throw result.error;
      if (current()) setData(result.data as SalesFunnel);
    } catch { if (current()) setError("Não conseguimos consultar o funil. Os números anteriores podem estar desatualizados. Tente atualizar novamente."); }
    finally { if (current()) setLoading(false); }
  }, [sb, days]);
  useEffect(() => { mounted.current = true; setData(null); void load(); return () => { mounted.current = false; sequence.current++; }; }, [load, refreshKey]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <section id="admin-funnel" className="admin-section operation-panel" aria-labelledby="sales-funnel-title">
    <div className="admin-section-heading operation-heading"><div><h2 id="sales-funnel-title"><BarChart3 size={22} aria-hidden="true"/>Funil de clientes</h2><p>Acompanhe onde os cadastros precisam de atenção, até a página estar pronta para uso.</p></div><button type="button" className="premium-btn" onClick={() => void load()} disabled={loading}><RefreshCw size={16} aria-hidden="true"/>{loading ? "Atualizando…" : "Atualizar funil"}</button></div>
    <div className="operation-toolbar"><label>Contas cadastradas<select value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>Nos últimos 7 dias</option><option value={30}>Nos últimos 30 dias</option><option value={90}>Nos últimos 90 dias</option><option value={0}>Em todo o período</option></select></label><p role="status">{data ? `Consulta ${operationalDate(data.snapshot_at)}` : loading ? "Consultando cadastros…" : "Consulta indisponível"}</p></div>
    {error && <p ref={errorRef} className="operation-error" role="alert" tabIndex={-1}>{error}</p>}
    <ol className="operation-funnel" aria-busy={loading}>{stages.map((stage, index) => {
      const value = data ? Number(data[stage.key]) : null;
      const previous = data && index > 0 ? Number(data[stages[index - 1].key]) : null;
      const percent = value !== null && previous ? Math.round(value / previous * 100) : null;
      return <li key={stage.key}><span className="operation-stage-number" aria-hidden="true">0{index + 1}</span><h3>{stage.label}</h3><strong>{value === null ? "—" : value.toLocaleString("pt-BR")}</strong><p>{stage.description}</p>{index > 0 && <small>{percent === null ? "Sem base para conversão" : `${percent}% da etapa anterior`}</small>}</li>;
    })}</ol>
    {data && data.legacy_active_without_evidence > 0 && <p className="operation-notice">{data.legacy_active_without_evidence} {data.legacy_active_without_evidence === 1 ? "conta aprovada possui assinatura ativa" : "contas aprovadas possuem assinatura ativa"} sem pagamento registrado no histórico da Cakto. Esse acesso aparece separado e não conta como pagamento comprovado.</p>}
    <details className="operation-funnel-help"><summary>Como os números são calculados</summary><p>O período seleciona a data de criação da conta. As etapas mostram a situação atual dessas mesmas contas e cada etapa exige a anterior. Administradores são excluídos; uma conta é contada uma vez mesmo com mais de uma empresa.</p><p>“Pagamento comprovado” exige um evento de pagamento aceito no histórico da Cakto. “Página pronta” também exige assinatura ativa com vencimento futuro, uma apresentação preenchida e um contato ou botão ativo. Esse indicador não comprova leitura da plaquinha nem visita à página. A situação pode mudar com vencimentos, estornos e edição de conteúdo.</p></details>
    <p className="operation-footnote">Horários de Brasília. A consulta não altera cadastros, cobranças ou assinaturas.</p>
  </section>;
}
