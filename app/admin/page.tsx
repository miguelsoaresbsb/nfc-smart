"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, CheckCircle2, Clock3, ExternalLink, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { readAllPages } from "@/lib/analytics";
import { getPublicPageUrl } from "@/lib/public-url";
import {
  adminDate, companyAccounts, matchesAdminSearch,
  type AccessRequest, type AdminCompany, type AdminSubscription, type CompanyStatus,
} from "@/lib/admin-data";
import "./admin.css";

const companyLabels: Record<CompanyStatus, string> = {
  active: "Ativa", pending: "Aguardando pagamento", expired: "Vencida", canceled: "Cancelada",
};
const requestLabels: Record<AccessRequest["status"], string> = {
  pending: "Aguardando análise", approved: "Aprovada", rejected: "Recusada",
};

export default function Admin() {
  const sb = useMemo(createClient, []);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [query, setQuery] = useState("");
  const [requestFilter, setRequestFilter] = useState<AccessRequest["status"] | "all">("pending");
  const [companyFilter, setCompanyFilter] = useState<CompanyStatus | "inactive" | "all">("all");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const mounted = useRef(true);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const current = () => mounted.current && sequence === loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const [nextRequests, nextCompanies, nextSubscriptions] = await Promise.all([
        readAllPages<AccessRequest>((from, to) => sb.from("access_requests")
          .select("id,name,email,phone,company_name,status,user_id,company_id,created_at")
          .order("created_at", { ascending: false }).order("id").range(from, to), current),
        readAllPages<AdminCompany>((from, to) => sb.from("companies")
          .select("id,name,slug,created_at").order("created_at", { ascending: false }).order("id").range(from, to), current),
        readAllPages<AdminSubscription>((from, to) => sb.from("subscriptions")
          .select("company_id,status,plan,started_at,expires_at").order("company_id").range(from, to), current),
      ]);
      if (!current()) return;
      setRequests(nextRequests);
      setCompanies(nextCompanies);
      setSubscriptions(nextSubscriptions);
      setUpdatedAt(Date.now());
    } catch {
      if (current()) setError("Não foi possível atualizar os dados. Tente novamente antes de analisar novos pedidos.");
    } finally {
      if (current()) setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; loadSequence.current++; };
  }, [load]);

  // Expirations are derived at render time rather than trusting a stale stored
  // status. A refresh reloads both the records and the reference time.
  const accounts = companyAccounts(companies, subscriptions, requests);
  const pending = requests.filter(request => request.status === "pending").length;
  const rejected = requests.filter(request => request.status === "rejected").length;
  const active = accounts.filter(company => company.status === "active").length;
  const expired = accounts.filter(company => company.status === "expired" || company.status === "canceled").length;
  const visibleRequests = requests.filter(request =>
    (requestFilter === "all" || request.status === requestFilter) &&
    matchesAdminSearch(query, [request.name, request.company_name, request.email, request.phone]),
  );
  const visibleCompanies = accounts.filter(company =>
    (companyFilter === "all" || (companyFilter === "inactive" ? company.status === "expired" || company.status === "canceled" : company.status === companyFilter)) &&
    matchesAdminSearch(query, [company.name, company.slug, company.account?.name, company.account?.email, company.account?.phone]),
  );

  async function approve(request: AccessRequest) {
    if (busy || loading || error) return;
    setBusy(request.id);
    setMessage("");
    try {
      const result = await sb.rpc("approve_access_request", { request_id: request.id });
      if (result.error) throw result.error;
      await load();
      if (mounted.current) setMessage("Acesso aprovado. A empresa está cadastrada e aguarda o pagamento da assinatura.");
    } catch {
      if (mounted.current) setMessage("Não foi possível autorizar a solicitação. Atualize os dados e tente novamente.");
    } finally {
      if (mounted.current) setBusy("");
    }
  }

  async function reject(id: string) {
    if (busy || loading || error) return;
    if (!window.confirm("Recusar esta solicitação de acesso? O cliente verá a situação ao entrar na conta.")) return;
    setBusy(id);
    setMessage("");
    try {
      const result = await sb.from("access_requests")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", id).eq("status", "pending").select("id");
      if (result.error) throw result.error;
      await load();
      if (mounted.current) setMessage(result.data?.length ? "Solicitação recusada." : "Esta solicitação já foi analisada. A lista foi atualizada.");
    } catch {
      if (mounted.current) setMessage("Não foi possível recusar a solicitação. Atualize os dados e tente novamente.");
    } finally {
      if (mounted.current) setBusy("");
    }
  }

  return (
    <main className="admin-console">
      <section className="subpage admin-subpage">
        <div className="section-kicker"><ShieldCheck size={14}/> ADMINISTRAÇÃO</div>
        <div className="hub-title admin-console-title">
          <div><h1>Clientes e acessos.</h1><p>Analise os pedidos e acompanhe cada empresa e sua assinatura em um só lugar.</p></div>
          <button className="premium-btn" onClick={() => { setMessage(""); void load(); }} disabled={loading || Boolean(busy)}><RefreshCw size={15} className={loading ? "spin" : undefined}/>{loading ? "Atualizando…" : "Atualizar"}</button>
        </div>

        <div className="admin-summary" aria-label="Resumo da plataforma">
          <a href="#admin-requests" onClick={() => setRequestFilter("pending")}><Clock3 size={19}/><span>Pedidos pendentes</span><strong>{updatedAt ? pending : "—"}</strong><small>Aguardando sua análise</small></a>
          <a href="#admin-companies" onClick={() => setCompanyFilter("active")}><CheckCircle2 size={19}/><span>Empresas ativas</span><strong>{updatedAt ? active : "—"}</strong><small>Página com assinatura vigente</small></a>
          <a href="#admin-companies" onClick={() => setCompanyFilter("inactive")}><Building2 size={19}/><span>Vencidas ou canceladas</span><strong>{updatedAt ? expired : "—"}</strong><small>Precisam regularizar o acesso</small></a>
          <a href="#admin-requests" onClick={() => setRequestFilter("rejected")}><XCircle size={19}/><span>Pedidos recusados</span><strong>{updatedAt ? rejected : "—"}</strong><small>Histórico de solicitações</small></a>
        </div>

        <div className="admin-search-row">
          <label className="admin-search"><Search size={17}/><span className="admin-visually-hidden">Buscar clientes e solicitações</span><input type="search" placeholder="Buscar empresa, responsável, e-mail ou endereço…" value={query} onChange={event => setQuery(event.target.value)}/></label>
          {updatedAt && <small>Atualizado às {new Date(updatedAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}</small>}
        </div>
        {error && <div className="admin-error" role="alert">{error} <button className="premium-btn" disabled={loading || Boolean(busy)} onClick={() => void load()}>Tentar novamente</button></div>}
        {message && <div className="editor-message" role="status">{message}</div>}
        {loading && !updatedAt && <p className="admin-loading" role="status">Carregando solicitações, empresas e assinaturas…</p>}

        <section id="admin-requests" className="admin-section">
          <div className="admin-section-heading admin-filter-heading">
            <div><h2>Solicitações de acesso</h2><p>Autorizar cria a empresa. A página fica disponível após o pagamento.</p></div>
            <label>Situação<select aria-label="Filtrar solicitações" value={requestFilter} onChange={event => setRequestFilter(event.target.value as typeof requestFilter)}>
              <option value="pending">Pendentes</option><option value="approved">Aprovadas</option><option value="rejected">Recusadas</option><option value="all">Todas</option>
            </select></label>
          </div>
          <p className="admin-result-count">{updatedAt ? `${visibleRequests.length} de ${requests.length} solicitações` : "Aguardando dados"}</p>
          <div className="admin-grid" aria-busy={loading}>
            {!loading && !error && !visibleRequests.length && <div className="admin-empty"><p>{query ? "Nenhuma solicitação corresponde à sua busca." : "Nenhuma solicitação nesta situação."}</p>{requestFilter !== "all" && <button className="premium-btn" onClick={() => setRequestFilter("all")}>Ver todas as solicitações</button>}</div>}
            {visibleRequests.map(request => (
              <article className="admin-request" key={request.id}>
                <div className="admin-request-main">
                  <span className="admin-request-avatar" aria-hidden="true">{request.company_name.slice(0, 1).toUpperCase()}</span>
                  <div><strong>{request.company_name}</strong><span>{request.name}</span><a href={"mailto:" + request.email}>{request.email}</a>{request.phone && <small>{request.phone}</small>}<small>Recebido em {adminDate(request.created_at)}</small></div>
                </div>
                <span className={"admin-request-status status-" + request.status}>{requestLabels[request.status]}</span>
                {request.status === "pending" && <div className="admin-request-actions">
                  <button className="premium-btn premium-btn-dark" onClick={() => approve(request)} disabled={Boolean(busy) || loading || Boolean(error)}>{busy === request.id ? "Processando…" : "Autorizar"}</button>
                  <button className="premium-btn" onClick={() => reject(request.id)} disabled={Boolean(busy) || loading || Boolean(error)}>Recusar</button>
                </div>}
              </article>
            ))}
          </div>
        </section>

        <section id="admin-companies" className="admin-section admin-companies-section">
          <div className="admin-section-heading admin-filter-heading">
            <div><h2>Empresas e assinaturas</h2><p>Consulte o status real e o vencimento sem alterar a cobrança.</p></div>
            <label>Assinatura<select aria-label="Filtrar empresas por assinatura" value={companyFilter} onChange={event => setCompanyFilter(event.target.value as typeof companyFilter)}>
              <option value="all">Todas</option><option value="active">Ativas</option><option value="pending">Aguardando pagamento</option><option value="inactive">Vencidas ou canceladas</option><option value="expired">Vencidas</option><option value="canceled">Canceladas</option>
            </select></label>
          </div>
          <p className="admin-result-count">{updatedAt ? `${visibleCompanies.length} de ${companies.length} empresas` : "Aguardando dados"}</p>
          <div className="admin-table-wrap" aria-busy={loading}>
            <table className="admin-company-table">
              <caption className="admin-visually-hidden">Empresas cadastradas com responsável e situação da assinatura</caption>
              <thead><tr><th scope="col">Empresa</th><th scope="col">Responsável</th><th scope="col">Assinatura</th><th scope="col">Vencimento</th><th scope="col">Página pública</th></tr></thead>
              <tbody>{visibleCompanies.map(company => <tr key={company.id}>
                <td data-label="Empresa"><strong>{company.name}</strong><small>Cadastrada em {adminDate(company.created_at)}</small></td>
                <td data-label="Responsável">{company.account ? <><strong>{company.account.name}</strong><a href={"mailto:" + company.account.email}>{company.account.email}</a>{company.account.phone && <small>{company.account.phone}</small>}</> : <span className="muted">Cadastro anterior sem solicitação vinculada</span>}</td>
                <td data-label="Assinatura"><span className={"admin-subscription-status is-" + company.status}>{companyLabels[company.status]}</span><small>{company.subscription?.plan === "monthly" ? "Plano mensal" : company.subscription?.plan || "Sem assinatura cadastrada"}</small></td>
                <td data-label="Vencimento"><strong>{company.subscription?.expires_at ? adminDate(company.subscription.expires_at) : company.status === "active" ? "Sem vencimento definido" : "—"}</strong>{company.subscription?.started_at && <small>Início: {adminDate(company.subscription.started_at)}</small>}</td>
                <td data-label="Página pública"><a className="admin-public-link" href={getPublicPageUrl(company.slug)} target="_blank" rel="noopener noreferrer" aria-label={"Abrir página de " + company.name}>/p/{company.slug}<ExternalLink size={13}/></a>{company.status !== "active" && <small>Indisponível até a regularização</small>}</td>
              </tr>)}</tbody>
            </table>
            {!loading && !error && !visibleCompanies.length && <div className="admin-empty"><p>{query ? "Nenhuma empresa corresponde à sua busca." : "Nenhuma empresa nesta situação."}</p>{companyFilter !== "all" && <button className="premium-btn" onClick={() => setCompanyFilter("all")}>Ver todas as empresas</button>}</div>}
          </div>
          <p className="admin-timezone-note">Datas no horário de Brasília. A situação considera o vencimento, mesmo quando o último status recebido ainda é “ativo”.</p>
        </section>
      </section>
    </main>
  );
}
