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

function makeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "empresa";
}

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
    load();
  }, []);

  async function approve(request: RequestRow) {
    if (!request.user_id) {
      setMessage("Esta solicitação não possui usuário vinculado.");
      return;
    }

    setBusy(request.id);
    setMessage("");

    try {
      let company = companies.find(
        (item) => item.name.trim().toLowerCase() === request.company_name.trim().toLowerCase(),
      );

      if (!company) {
        let slug = makeSlug(request.company_name);
        const { data: sameSlug } = await sb.from("companies").select("id").eq("slug", slug).maybeSingle();
        if (sameSlug) slug = slug + "-" + request.id.slice(0, 6);

        const created = await sb
          .from("companies")
          .insert({ name: request.company_name.trim(), slug })
          .select("id,name,slug")
          .single();

        if (created.error) throw new Error("Não foi possível criar a empresa: " + created.error.message);
        company = created.data;
      }

      const profile = await sb
        .from("profiles")
        .upsert(
          { company_id: company.id, display_name: request.company_name.trim() },
          { onConflict: "company_id" },
        );
      if (profile.error) throw new Error("Não foi possível criar o perfil: " + profile.error.message);

      const subscription = await sb
        .from("subscriptions")
        .upsert(
          { company_id: company.id, plan: "annual", status: "pending" },
          { onConflict: "company_id" },
        );
      if (subscription.error) throw new Error("Não foi possível criar a assinatura: " + subscription.error.message);

      const member = await sb
        .from("company_members")
        .upsert(
          { company_id: company.id, user_id: request.user_id, role: "owner" },
          { onConflict: "company_id,user_id" },
        );
      if (member.error) throw new Error("Não foi possível vincular o usuário: " + member.error.message);

      const approved = await sb
        .from("access_requests")
        .update({
          status: "approved",
          company_id: company.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      if (approved.error) throw new Error("Não foi possível concluir a autorização: " + approved.error.message);

      setMessage("Acesso autorizado. A empresa foi criada/vinculada e aguarda a ativação da assinatura.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível autorizar a solicitação.");
    } finally {
      setBusy("");
    }
  }

  async function reject(id: string) {
    setBusy(id);
    setMessage("");
    const result = await sb
      .from("access_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", id);

    setMessage(result.error ? result.error.message : "Solicitação recusada.");
    setBusy("");
    await load();
  }

  return (
    <main className="dash">
      <header>
        <b className="logo">NFC<span>SMART</span></b>
        <span className="pill">MASTER</span>
      </header>

      <section className="panel wide">
        <p className="eyebrow">PAINEL DO DONO</p>
        <h1>Solicitações de acesso.</h1>

        {message && <div className="notice">{message}</div>}

        <div className="admin-grid">
          {requests.length === 0 && <p className="muted">Nenhuma solicitação encontrada.</p>}
          {requests.map((request) => (
            <div className="request" key={request.id}>
              <div>
                <strong>{request.company_name}</strong>
                <span>{request.name} · {request.email}</span>
              </div>
              <em>{request.status}</em>
              {request.status === "pending" && (
                <div>
                  <button
                    className="btn dark"
                    onClick={() => approve(request)}
                    disabled={busy === request.id}
                  >
                    {busy === request.id ? "Processando…" : "Autorizar"}
                  </button>
                  <button onClick={() => reject(request.id)} disabled={busy === request.id}>
                    Recusar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <h2>Empresas</h2>
        {companies.map((company) => (
          <div className="company-row" key={company.id}>
            <span>{company.name}</span>
            <small>/p/{company.slug}</small>
          </div>
        ))}
      </section>
    </main>
  );
}
