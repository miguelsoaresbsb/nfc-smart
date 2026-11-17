"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Package, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { tagDate, tagStatuses, tagStatusLabels, type PhysicalTag } from "@/lib/nfc-tags";
import "./tag-status.css";

const PAGE_SIZE = 20;

export default function TagStatusPanel({ companyId }: { companyId: string }) {
  const sb = useMemo(createClient, []);
  const [tags, setTags] = useState<PhysicalTag[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [pagination, setPagination] = useState({ companyId, page: 0 });
  const page = pagination.companyId === companyId ? pagination.page : 0;
  const [hasMore, setHasMore] = useState(false), [loadedCompanyId, setLoadedCompanyId] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(""); setTags([]); setHasMore(false);
      try {
        const result = await sb.from("nfc_tags").select("id,serial,company_id,status,production_at,delivery_at,activated_at,archived_at,created_at,updated_at").eq("company_id", companyId).is("archived_at", null).order("created_at", { ascending: false }).order("id").range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        if (result.error) throw result.error;
        if (alive) {
          const rows = (result.data || []) as PhysicalTag[];
          if (!rows.length && page > 0) { setPagination({ companyId, page: 0 }); return; }
          setTags(rows.slice(0, PAGE_SIZE)); setHasMore(rows.length > PAGE_SIZE); setLoadedCompanyId(companyId);
        }
      } catch { if (alive) setError("Não conseguimos consultar a situação da plaquinha agora. Tente novamente em um momento."); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [sb, companyId, attempt, page]);
  return <section className="physical-tag-status" aria-labelledby="physical-tag-title" aria-busy={loading}>
    <div className="physical-tag-heading"><span><Package size={23} aria-hidden="true"/></span><div><h2 id="physical-tag-title">Sua plaquinha física</h2><p>Acompanhe a preparação e a entrega da peça vinculada à sua empresa.</p></div></div>
    {loading && <p role="status">Carregando a situação da plaquinha…</p>}
    {error && <div className="physical-tag-error" role="alert"><p>{error}</p><button className="premium-btn" type="button" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16}/>Consultar novamente</button></div>}
    {!loading && !error && loadedCompanyId === companyId && !tags.length && <p className="physical-tag-empty">Ainda não há uma plaquinha cadastrada para esta empresa. A contratação e a preparação da peça são combinadas com a equipe NFC SMART.</p>}
    {!loading && !error && loadedCompanyId === companyId && tags.map(tag => <article key={tag.id} className="physical-tag-card"><div><code>{tag.serial}</code><span>{tagStatusLabels[tag.status]}</span></div><ol aria-label={"Etapas físicas de " + tag.serial}>{tagStatuses.map((status, index) => <li key={status} className={index <= tagStatuses.indexOf(tag.status) ? "is-complete" : ""} aria-current={tag.status === status ? "step" : undefined}><i aria-hidden="true">{index + 1}</i><span>{tagStatusLabels[status]}</span></li>)}</ol><small>Última atualização: {tagDate(tag.updated_at)}</small></article>)}
    {!error && loadedCompanyId === companyId && (page > 0 || hasMore) && <nav className="physical-tag-pagination" aria-label="Páginas de suas plaquinhas"><button type="button" className="premium-btn" disabled={loading || page === 0} onClick={() => setPagination({ companyId, page: page - 1 })}><ArrowLeft size={16}/>Anterior</button><span>Página {page + 1}</span><button type="button" className="premium-btn" disabled={loading || !hasMore} onClick={() => setPagination({ companyId, page: page + 1 })}>Próxima<ArrowRight size={16}/></button></nav>}
    <p className="physical-tag-note">A situação da peça física é independente da assinatura. Uma plaquinha marcada como ativada não libera os recursos pagos nem altera o endereço da página.</p>
  </section>;
}
