"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type RequestRow = {
  id: string;
  name: string;
  email: string;
  company_name: string;
  status: "pending" | "approved" | "rejected";
  user_id: string | null;
  company_id: string | null;
  created_at: string;
};

type CompanyRow = { id: string; name: string; slug: string };

export default function Admin() {
  const sb = createClient();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setMessage("");
    const [requestResult, companyResult] = await Promise.all([
      sb.from("access_requests").select("*").order("created_at", { ascending: false }),
      sb.from("companies").select("id,name,slug").order("created_at", { ascending: false }),
    ]);
    if (requestResult.error) setMessage(requestResult.error.message);
    else setRequests(requestResult.data || []);
    if (companyResult.error) setMessage(companyResult.error.message);
    else setCompanies(companyResult.data || []);
  }

  useEffect(() => {
    load().catch(() => setMessage("Não foi possível carregar os dados. Atualize a página."));
  }, []);

  async function approve(request: RequestRow) {
    if (busy) return;
    setBusy(request.id);
    setMessage("");
    try {
      const result = await sb.rpc("approve_access_request", { request_id: request.id });
      if (result.error) throw new Error(result.error.message);
      await load();
      setMessage("Acesso autorizado. A empresa foi criada e aguarda a ativação da assinatura.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível autorizar a solicitação.");
    } finally {
      setBusy("");
    }
  }

  async function reject(id: string) {
    if (busy) return;
    setBusy(id);
    setMessage("");
    try {
      const result = await sb.from("access_requests")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", id).eq("status", "pending").select("id");
      if (result.error) throw new Error(result.error.message);
      await load();
      setMessage(result.data?.length ? "Solicitação recusada." : "Esta solicitação já foi analisada. A lista foi atualizada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível recusar a solicitação.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="premium-shell admin-premium">
      <header className="premium-nav">
        <a href="/dashboard" className="brand"><span className="brand-mark">N</span><span>NFC<span>SMART</span></span></a>
        <span className="admin-top-label"><span className="live-dot"/> MASTER CONTROL</span>
      </header>
      <section className="subpage admin-subpage">
        <div className="section-kicker"><span className="live-dot"/> ADMINISTRAÇÃO DA PLATAFORMA</div>
        <div className="hub-title"><div><h1>Empresas. <span>Acessos. Controle.</span></h1><p>Revise solicitações, autorize novos clientes e acompanhe as empresas cadastradas.</p></div><span className="admin-count">{requests.filter(r=>r.status==="pending").length} pendentes</span></div>
        {message && <div className="editor-message" role="status">{message}</div>}
        <section className="admin-section">
          <div className="admin-section-heading"><div><span className="section-kicker">FILA DE ENTRADA</span><h2>Solicitações de acesso</h2></div><span>{requests.length} registros</span></div>
          <div className="admin-grid">
            {requests.length === 0 && <p className="muted">Nenhuma solicitação encontrada.</p>}
            {requests.map((request) => (
              <article className="admin-request" key={request.id}>
                <div className="admin-request-main">
                  <span className="admin-request-avatar">{request.company_name.slice(0,1).toUpperCase()}</span>
                  <div><strong>{request.company_name}</strong><span>{request.name} · {request.email}</span><small>Recebido em {new Date(request.created_at).toLocaleDateString("pt-BR")}</small></div>
                </div>
                <span className={"admin-request-status status-"+request.status}>{request.status==="pending"?"PENDENTE":request.status==="approved"?"APROVADO":"RECUSADO"}</span>
                {request.status === "pending" && (
                  <div className="admin-request-actions">
                    <button className="premium-btn premium-btn-dark" onClick={() => approve(request)} disabled={Boolean(busy)}>{busy === request.id ? "Processando…" : "Autorizar"}</button>
                    <button className="premium-btn" onClick={() => reject(request.id)} disabled={Boolean(busy)}>Recusar</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
        <section className="admin-section admin-companies-section">
          <div className="admin-section-heading"><div><span className="section-kicker">BASE DE CLIENTES</span><h2>Empresas cadastradas</h2></div><span>{companies.length} empresas</span></div>
          <div className="admin-company-list">
            {companies.map(company => <div className="admin-company-row" key={company.id}><span className="admin-company-avatar">{company.name.slice(0,1).toUpperCase()}</span><b>{company.name}</b><code>/p/{company.slug}</code><a href={"/p/"+company.slug} target="_blank" rel="noreferrer">Abrir página ↗</a></div>)}
            {!companies.length && <p className="muted">Nenhuma empresa cadastrada.</p>}
          </div>
        </section>
      </section>
    </main>
  );}
