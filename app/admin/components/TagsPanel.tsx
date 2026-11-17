"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, ArrowRight, Check, CreditCard, Package, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { tagDate, tagStatuses, tagStatusLabels, tagStatusOptions, type AdminPhysicalTag, type TagCompany, type TagStatus } from "@/lib/nfc-tags";
import "./tags.css";

type TagFilter = TagStatus | "all" | "archived";
const PAGE_SIZE = 50;
const blank = { companyId: "", status: "personalization" as TagStatus, notes: "", tested: false };

export default function TagsPanel({ companies, refreshKey = 0 }: { companies: readonly TagCompany[]; refreshKey?: number | null }) {
  const sb = useMemo(createClient, []);
  const [tags, setTags] = useState<AdminPhysicalTag[]>([]), [total, setTotal] = useState(0);
  const [query, setQuery] = useState(""), [search, setSearch] = useState(""), [filter, setFilter] = useState<TagFilter>("all"), [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [editing, setEditing] = useState<AdminPhysicalTag | null>(null), [formOpen, setFormOpen] = useState(false), [form, setForm] = useState(blank);
  const [formError, setFormError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null), formHeading = useRef<HTMLHeadingElement>(null), formErrorRef = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(true), sequence = useRef(0);

  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [query]);
  const load = useCallback(async () => {
    const id = ++sequence.current; const current = () => mounted.current && id === sequence.current;
    setLoading(true); setError("");
    try {
      const result = await sb.rpc("admin_list_nfc_tags", { p_query: search, p_status: filter, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE });
      if (result.error) throw result.error;
      if (!current()) return;
      const rows = (result.data || []) as AdminPhysicalTag[];
      if (!rows.length && page > 0) { setPage(0); return; }
      setTags(rows); setTotal(Number(rows[0]?.total_count || 0));
    } catch { if (current()) setError("Não conseguimos carregar as plaquinhas. Atualize a consulta antes de editar um cadastro."); }
    finally { if (current()) setLoading(false); }
  }, [sb, search, filter, page]);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; sequence.current++; }; }, [load, refreshKey]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (formError) formErrorRef.current?.focus(); }, [formError]);
  useEffect(() => { if (formOpen) formHeading.current?.focus(); }, [formOpen, editing?.id]);
  const sortedCompanies = useMemo(() => [...companies].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [companies]);
  const changingActivation = Boolean(editing && editing.status !== "activated" && form.status === "activated");

  function openForm(tag: AdminPhysicalTag | null) {
    if (busy) return;
    setEditing(tag); setForm(tag ? { companyId: tag.company_id || "", status: tag.status, notes: tag.notes || "", tested: false } : blank);
    setFormError(""); setMessage(""); setFormOpen(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || error) return;
    if (form.notes.length > 1000 || (form.status !== "personalization" && !form.companyId && (!editing || editing.status !== form.status))) { setFormError("Vincule uma empresa antes de avançar a produção e use até 1.000 caracteres nas observações."); return; }
    if (changingActivation && !form.tested) { setFormError("Confirme que a plaquinha foi gravada com o endereço correto e testada."); return; }
    setBusy(editing?.id || "new"); setFormError(""); setMessage("");
    try {
      const result = await sb.rpc("admin_save_nfc_tag", { p_tag_id: editing?.id || null, p_company_id: form.companyId || null, p_status: form.status, p_notes: form.notes.trim(), p_expected_updated_at: editing?.updated_at || null });
      if (result.error) throw result.error;
      if (!mounted.current) return;
      setFormOpen(false); setEditing(null); setForm(blank);
      setMessage(editing ? "Plaquinha atualizada. A situação da assinatura não foi alterada." : "Plaquinha cadastrada com serial gerado pelo sistema.");
      await load();
    } catch { if (mounted.current) setFormError("Não foi possível salvar. Recarregue a lista para conferir se houve outra atualização e tente novamente. As etapas avançam uma por vez."); }
    finally { if (mounted.current) setBusy(""); }
  }
  async function archive(tag: AdminPhysicalTag) {
    if (busy || loading || error) return;
    const restoring = Boolean(tag.archived_at);
    if (!window.confirm(restoring ? "Restaurar este cadastro de plaquinha? A etapa física e o vínculo existentes serão mantidos." : "Arquivar esta plaquinha? O histórico é preservado e ela deixa de aparecer para o cliente. Isso não cancela a assinatura.")) return;
    setBusy(tag.id); setMessage("");
    try {
      const result = await sb.rpc("admin_archive_nfc_tag", { p_tag_id: tag.id, p_archived: !restoring, p_expected_updated_at: tag.updated_at });
      if (result.error) throw result.error;
      if (!mounted.current) return;
      if (editing?.id === tag.id) { setFormOpen(false); setEditing(null); }
      setMessage(restoring ? "Cadastro restaurado. A assinatura permanece separada." : "Plaquinha arquivada. O histórico foi preservado.");
      await load();
    } catch { if (mounted.current) setError("Não foi possível atualizar esse cadastro. Recarregue a consulta para conferir a versão atual antes de continuar."); }
    finally { if (mounted.current) setBusy(""); }
  }

  return <section id="admin-tags" className="admin-section tag-management" aria-labelledby="tag-management-title">
    <div className="admin-section-heading tag-heading"><div><h2 id="tag-management-title"><Package size={22} aria-hidden="true"/>Plaquinhas físicas</h2><p>Acompanhe cada peça, do preparo à entrega. O serial identifica a plaquinha; o endereço público continua sendo o da empresa.</p></div><button type="button" className="premium-btn premium-btn-dark" onClick={() => openForm(null)} disabled={Boolean(busy) || loading || Boolean(error)}><Plus size={17}/>Cadastrar plaquinha</button></div>
    <p className="tag-separation"><CreditCard size={19} aria-hidden="true"/>A etapa “Ativada” se refere à peça física. Ela não grava a TAG, não confirma pagamento e não libera a assinatura digital.</p>
    {formOpen && <form className="tag-form" onSubmit={save} aria-busy={Boolean(busy)}>
      <h3 ref={formHeading} tabIndex={-1}>{editing ? <>Editar <code>{editing.serial}</code></> : "Cadastrar nova plaquinha"}</h3>
      <p>{editing ? "Confira o vínculo e avance a etapa somente após concluir o trabalho físico." : "O serial é criado no servidor ao salvar. Você pode cadastrar uma peça ainda sem empresa, na etapa de personalização."}</p>
      <fieldset disabled={Boolean(busy)}><legend className="tag-sr-only">Dados da plaquinha</legend>
        <label>Empresa vinculada<select value={form.companyId} onChange={event => setForm(current => ({ ...current, companyId: event.target.value }))} disabled={Boolean(editing && editing.status !== "personalization")}><option value="">Sem empresa atribuída</option>{sortedCompanies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select><small>{editing && editing.status !== "personalization" ? "O vínculo fica fixo depois que a produção começa, para evitar reatribuir uma peça já preparada." : "A empresa pode ser ajustada enquanto a peça está em personalização."}</small></label>
        <label>Etapa física<select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as TagStatus, tested: false }))}>{tagStatusOptions(editing?.status).map(status => <option key={status} value={status}>{tagStatusLabels[status]}</option>)}</select><small>O fluxo é personalização → produção → entrega → ativação física.</small></label>
        <label className="tag-notes-field">Observações internas<textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} maxLength={1000} rows={3}/><small>{form.notes.length}/1.000 caracteres. Visíveis somente aos administradores; evite senhas e dados de pagamento.</small></label>
        {changingActivation && <label className="tag-confirm"><input type="checkbox" checked={form.tested} onChange={event => setForm(current => ({ ...current, tested: event.target.checked }))} required/>Confirmei o endereço da empresa gravado na plaquinha e testei sua leitura.</label>}
      </fieldset>
      {formError && <p ref={formErrorRef} role="alert" tabIndex={-1} className="tag-error">{formError}</p>}
      <div className="tag-form-actions"><button className="premium-btn premium-btn-dark" type="submit" disabled={Boolean(busy) || loading || Boolean(error)}><Check size={17}/>{busy ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar e gerar serial"}</button><button className="premium-btn" type="button" disabled={Boolean(busy)} onClick={() => { setFormOpen(false); setEditing(null); setFormError(""); }}>Cancelar</button></div>
    </form>}
    <div className="tag-filters"><label className="tag-search"><Search size={18} aria-hidden="true"/><span className="tag-sr-only">Buscar plaquinha por serial ou empresa</span><input type="search" value={query} disabled={Boolean(busy)} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="Buscar serial ou empresa"/></label><label>Etapa<select disabled={Boolean(busy)} value={filter} onChange={event => { setFilter(event.target.value as TagFilter); setPage(0); }}><option value="all">Todas as peças em acompanhamento</option>{tagStatuses.map(status => <option key={status} value={status}>{tagStatusLabels[status]}</option>)}<option value="archived">Arquivadas</option></select></label></div>
    {error && <div className="tag-error"><p ref={errorRef} role="alert" tabIndex={-1}>{error}</p><button className="premium-btn" type="button" disabled={loading || Boolean(busy)} onClick={() => void load()}>Carregar plaquinhas novamente</button></div>}
    {message && <p className="tag-notice" role="status">{message}</p>}
    <p className="tag-result-count" role="status">{loading ? "Carregando plaquinhas…" : `${total} ${total === 1 ? "plaquinha encontrada" : "plaquinhas encontradas"}`}</p>
    <div className="tag-list" aria-busy={loading}>{tags.map(tag => <article key={tag.id} className="tag-item">
      <div className="tag-item-title"><code>{tag.serial}</code><span className={"tag-stage is-" + tag.status}>{tag.archived_at ? "Arquivada" : tagStatusLabels[tag.status]}</span></div>
      <h3>{tag.company_name || "Sem empresa atribuída"}</h3>
      <dl className="tag-dates"><div><dt>Cadastro</dt><dd>{tagDate(tag.created_at)}</dd></div><div><dt>Produção</dt><dd>{tagDate(tag.production_at)}</dd></div><div><dt>Entrega</dt><dd>{tagDate(tag.delivery_at)}</dd></div><div><dt>Ativação física</dt><dd>{tagDate(tag.activated_at)}</dd></div></dl>
      {tag.notes && <details className="tag-internal-notes"><summary>Observações internas</summary><p>{tag.notes}</p></details>}
      <div className="tag-item-actions">{!tag.archived_at && <button type="button" className="premium-btn" onClick={() => openForm(tag)} disabled={Boolean(busy) || loading || Boolean(error)} aria-label={"Editar plaquinha " + tag.serial}><Pencil size={16}/>Editar etapa e dados</button>}<button type="button" className="premium-btn" onClick={() => void archive(tag)} disabled={Boolean(busy) || loading || Boolean(error)} aria-label={(tag.archived_at ? "Restaurar " : "Arquivar ") + tag.serial}>{tag.archived_at ? <RotateCcw size={16}/> : <Archive size={16}/>} {tag.archived_at ? "Restaurar cadastro" : "Arquivar"}</button></div>
    </article>)}</div>
    {!loading && !error && !tags.length && <p className="tag-empty">{search ? "Nenhuma plaquinha corresponde à busca." : filter === "archived" ? "Nenhuma plaquinha arquivada." : "Nenhuma plaquinha nesta etapa. Cadastre a primeira peça para acompanhar a produção."}</p>}
    {total > PAGE_SIZE && <nav className="tag-pagination" aria-label="Páginas de plaquinhas"><button className="premium-btn" type="button" disabled={page === 0 || loading || Boolean(busy)} onClick={() => setPage(value => value - 1)}><ArrowLeft size={16}/>Anterior</button><span>Página {page + 1} de {Math.ceil(total / PAGE_SIZE)}</span><button className="premium-btn" type="button" disabled={(page + 1) * PAGE_SIZE >= total || loading || Boolean(busy)} onClick={() => setPage(value => value + 1)}>Próxima<ArrowRight size={16}/></button></nav>}
  </section>;
}
