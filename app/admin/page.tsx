"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type RequestRow = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  company_id: string | null;
  status: string;
  created_at: string;
};

type Company = { id: string; name: string; slug: string };

export default function Admin() {
  const supabase = createClient();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompany, setNewCompany] = useState({ name: "", slug: "" });
  const [msg, setMsg] = useState("");

  async function load() {
    const [{ data: reqs }, { data: comps }] = await Promise.all([
      supabase.from("access_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("companies").select("id,name,slug").order("name"),
    ]);
    setRequests(reqs ?? []);
    setCompanies(comps ?? []);
  }

  useEffect(() => { load(); }, []);

  async function approve(row: RequestRow, companyId: string) {
    if (!companyId) {
      setMsg("Selecione a empresa antes de autorizar.");
      return;
    }
    const { error } = await supabase
      .from("access_requests")
      .update({ status: "approved", company_id: companyId, reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    setMsg(error ? error.message : "Acesso autorizado.");
    await load();
  }

  async function reject(row: RequestRow) {
    const { error } = await supabase
      .from("access_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    setMsg(error ? error.message : "Solicitação recusada.");
    await load();
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    const slug = newCompany.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    const { error } = await supabase.from("companies").insert({ name: newCompany.name.trim(), slug });
    setMsg(error ? error.message : "Empresa criada.");
    if (!error) setNewCompany({ name: "", slug: "" });
    await load();
  }

  return (
    <main className="min-h-screen grid-bg px-5 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[.3em] text-white/40">NFC Smart</div>
            <h1 className="mt-2 text-4xl font-semibold">Painel do dono</h1>
            <p className="mt-2 text-white/45">Autorize clientes antes que eles tenham acesso ao sistema.</p>
          </div>
          <a href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm">Dashboard</a>
        </div>

        {msg && <div className="glass mt-6 rounded-2xl p-4 text-sm text-white/70">{msg}</div>}

        <section className="glass mt-6 rounded-3xl p-6">
          <h2 className="text-xl font-semibold">Criar empresa</h2>
          <form onSubmit={createCompany} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input className="rounded-xl border border-white/10 bg-black/30 p-3" placeholder="Nome da empresa" value={newCompany.name} onChange={e => setNewCompany({ ...newCompany, name: e.target.value })} required />
            <input className="rounded-xl border border-white/10 bg-black/30 p-3" placeholder="slug-da-empresa" value={newCompany.slug} onChange={e => setNewCompany({ ...newCompany, slug: e.target.value })} required />
            <button className="rounded-xl bg-white px-5 py-3 font-semibold text-black">Criar</button>
          </form>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Pedidos de acesso</h2>
            <span className="text-sm text-white/40">{requests.filter(r => r.status === "pending").length} pendente(s)</span>
          </div>
          <div className="space-y-3">
            {requests.length === 0 && <div className="glass rounded-2xl p-6 text-white/45">Nenhuma solicitação ainda.</div>}
            {requests.map(row => (
              <RequestCard key={row.id} row={row} companies={companies} onApprove={approve} onReject={reject} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function RequestCard({
  row, companies, onApprove, onReject,
}: {
  row: RequestRow;
  companies: Company[];
  onApprove: (row: RequestRow, companyId: string) => void;
  onReject: (row: RequestRow) => void;
}) {
  const [companyId, setCompanyId] = useState(row.company_id ?? "");
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-semibold">{row.name || "Cliente sem nome"}</div>
          <div className="mt-1 text-sm text-white/55">{row.email}</div>
          {row.phone && <div className="text-sm text-white/40">{row.phone}</div>}
          <div className="mt-2 text-xs uppercase tracking-widest text-white/35">{row.status}</div>
        </div>
        {row.status === "pending" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="rounded-xl border border-white/10 bg-black/40 p-3">
              <option value="">Vincular empresa</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => onApprove(row, companyId)} className="rounded-xl bg-white px-4 py-3 font-semibold text-black">Autorizar</button>
            <button onClick={() => onReject(row)} className="rounded-xl border border-red-400/20 px-4 py-3 text-red-200">Recusar</button>
          </div>
        )}
      </div>
    </div>
  );
}
