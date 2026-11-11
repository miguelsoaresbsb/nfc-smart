"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { actionPayload, actionTypes, emptyActionForm, formFromAction, moveAction, type ActionForm, type ActionType, type EditableAction } from "@/lib/action-editor";
import { actionIdentity, contactIdentities, uniquePublicActions } from "@/lib/action-duplicates";
import { getSegmentTemplate, missingTemplateActions, type TemplateActionSuggestion } from "@/lib/segment-templates";
import "../content-editor.css";

type QRCode = { id: string; name: string };
type Contacts = { whatsapp?: string | null; whatsappEnabled?: boolean; phone?: string | null; phoneEnabled?: boolean };

export default function ActionsPage() {
  return <Suspense fallback={<p className="subpage" role="status">Carregando botões…</p>}><Actions /></Suspense>;
}

function Actions() {
  const sb = useMemo(() => createClient(), []), router = useRouter(), search = useSearchParams();
  const [message, updateMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  function setMessage(text: string, error = false) { updateMessage(text); setMessageError(error); }
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [canEdit, setCanEdit] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [companyId, setCompanyId] = useState(""), [items, setItems] = useState<EditableAction[]>([]), [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [contacts, setContacts] = useState<Contacts>({});
  const [editingId, setEditingId] = useState<string | null>(null), [form, setForm] = useState<ActionForm>(() => emptyActionForm());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null), builder = useRef<HTMLDivElement>(null);
  const template = getSegmentTemplate(search.get("template"));
  const suggestions = template && dataReady ? missingTemplateActions(template, items, contacts) : [];
  const contactKeys = contactIdentities(contacts);
  const draftDestination = actionIdentity({ type: form.type, url: form.url });
  const directContactExists = Boolean(draftDestination && contactKeys.has(draftDestination));
  const publicIds = new Set(uniquePublicActions(items, contacts).map(action => action.id));
  useEffect(() => { if (message && messageError) feedback.current?.focus(); }, [message, messageError]);

  async function load(id: string) {
    setDataReady(false);
    const [actions, qrs] = await Promise.all([
      sb.from("actions").select("*").eq("company_id", id).order("position").order("created_at").order("id"),
      sb.from("qr_codes").select("id,name").eq("company_id", id).eq("enabled", true).order("position"),
    ]);
    if (actions.error || qrs.error) throw new Error("Não foi possível carregar os botões e QR Codes. Tente novamente.");
    setItems(actions.data || []); setQrCodes(qrs.data || []); setDataReady(true);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { router.replace("/login"); return; }
        const { data: member, error } = await sb.from("company_members").select("company_id,role").eq("user_id", user.id).limit(1).maybeSingle();
        if (error) throw new Error("Não foi possível carregar sua empresa. Atualize a página.");
        if (!member) { router.replace("/acesso-pendente"); return; }
        const { data: company, error: companyError } = await sb.from("companies")
          .select("phone,whatsapp,phone_enabled,whatsapp_enabled").eq("id", member.company_id).single();
        if (companyError) throw new Error("Não foi possível verificar os contatos da empresa.");
        if (!alive) return;
        setCompanyId(member.company_id); setCanEdit(["owner", "admin", "editor"].includes(member.role));
        setContacts({ phone: company.phone, whatsapp: company.whatsapp, phoneEnabled: company.phone_enabled, whatsappEnabled: company.whatsapp_enabled });
        await load(member.company_id);
      } catch (error) { if (alive) setMessage(error instanceof Error ? error.message : "Não foi possível carregar os botões.", true); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [router, sb]);

  function set<K extends keyof ActionForm>(key: K, value: ActionForm[K]) { setForm(current => ({ ...current, [key]: value })); }
  function focusBuilder() { requestAnimationFrame(() => { builder.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); nameInput.current?.focus({ preventScroll: true }); }); }
  function startEdit(action: EditableAction) { setForm(formFromAction(action)); setEditingId(action.id); setMessage(""); focusBuilder(); }
  function cancelEdit() { setEditingId(null); setForm(emptyActionForm()); setMessage(""); }
  function configureSuggestion(suggestion: TemplateActionSuggestion) {
    setEditingId(null); setForm(emptyActionForm(suggestion.type as ActionType, suggestion.label));
    setMessage(suggestion.hint + " Preencha seu destino e salve para publicar."); focusBuilder();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || loading || !dataReady || !companyId || !canEdit || directContactExists) return;
    let payload: ReturnType<typeof actionPayload>;
    try { payload = actionPayload(form); } catch (error) { setMessage(error instanceof Error ? error.message : "Confira os dados do botão.", true); return; }
    const identity = actionIdentity(payload);
    const duplicate = identity && items.find(action => action.id !== editingId && actionIdentity(action) === identity);
    if (duplicate) { setMessage(`O destino já está no botão “${duplicate.label}”. Edite ou ative esse botão para manter um único acesso.`, true); return; }
    if (identity && contactKeys.has(identity)) { setMessage("Este destino já está configurado nos contatos da página. Edite-o em Minha página.", true); return; }
    setBusy(true); setMessage("");
    try {
      const result = editingId
        ? await sb.from("actions").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingId).eq("company_id", companyId).select("id").single()
        : await sb.from("actions").insert({ ...payload, company_id: companyId, position: items.reduce((max, action) => Math.max(max, action.position), -1) + 1, enabled: true }).select("id").single();
      if (result.error) throw new Error("Não foi possível salvar o botão. Verifique sua permissão e tente novamente.");
      const edited = Boolean(editingId);
      setForm(emptyActionForm()); setEditingId(null); await load(companyId);
      setMessage(edited ? "Botão atualizado. A página pública já usa os novos dados." : "Botão adicionado à sua página.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o botão.", true); }
    finally { setBusy(false); }
  }

  async function remove(action: EditableAction) {
    if (busy || !dataReady || !canEdit || !confirm(`Excluir o botão “${action.label}”?`)) return;
    setBusy(true); setMessage("");
    try {
      const result = await sb.from("actions").delete().eq("id", action.id).eq("company_id", companyId).select("id").single();
      if (result.error) throw new Error("Não foi possível excluir o botão. Tente novamente.");
      if (editingId === action.id) { setEditingId(null); setForm(emptyActionForm()); }
      await load(companyId); setMessage("Botão excluído.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível excluir o botão.", true); }
    finally { setBusy(false); }
  }

  async function toggle(action: EditableAction) {
    if (busy || !dataReady || !canEdit) return;
    if (!action.enabled) {
      try { actionPayload(formFromAction(action)); } catch { startEdit(action); setMessage("Complete o destino deste botão antes de ativá-lo.", true); return; }
      const identity = actionIdentity(action);
      if (identity && (contactKeys.has(identity) || items.some(other => other.id !== action.id && other.enabled && actionIdentity(other) === identity))) {
        setMessage("Este destino já aparece em outro botão ou contato. Edite o destino antes de ativar um acesso repetido.", true); return;
      }
    }
    setBusy(true); setMessage("");
    try {
      const result = await sb.from("actions").update({ enabled: !action.enabled }).eq("id", action.id).eq("company_id", companyId).select("id").single();
      if (result.error) throw new Error("Não foi possível alterar a visibilidade do botão.");
      await load(companyId); setMessage(action.enabled ? "Botão ocultado da página pública." : "Botão ativado na página pública.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o botão.", true); }
    finally { setBusy(false); }
  }

  async function reorder(sourceId: string, targetId: string) {
    if (busy || !dataReady || !canEdit || sourceId === targetId) return;
    const next = moveAction(items, sourceId, targetId);
    if (next.every((item, index) => item.id === items[index].id)) return;
    const previous = items;
    setBusy(true); setItems(next); setMessage("");
    try {
      const result = await sb.rpc("reorder_company_actions", { p_company_id: companyId, p_action_ids: next.map(action => action.id) });
      if (result.error) throw new Error("A ordem não foi salva. A lista pode ter mudado em outra janela. Tente novamente.");
      await load(companyId); setMessage("Ordem dos botões atualizada.");
    } catch (error) {
      setItems(previous);
      try { await load(companyId); } catch { /* Keep the last complete list and the explicit reorder error. */ }
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a ordem.", true);
    } finally { setBusy(false); setDraggedId(null); }
  }

  const selectedSuggestion = suggestions.find(suggestion => suggestion.type === form.type);
  const destinationPlaceholder = selectedSuggestion?.placeholder || (form.type === "whatsapp" || form.type === "phone" ? "Número com DDD" : form.type === "instagram" ? "@suaempresa ou link do perfil" : "https://seusite.com.br");

  return <main className="premium-shell actions-premium"><section className="subpage actions-content">
    <div className="section-kicker">BOTÕES DA PÁGINA</div>
    <div className="hub-title"><div><h1>Seus atalhos. <span>Na ordem certa.</span></h1><p>Crie, edite e organize os botões que seus clientes encontram ao tocar na plaquinha.</p></div></div>
    {message && <p ref={feedback} tabIndex={-1} className={"notice action-feedback" + (messageError ? " is-error" : "")} role={messageError ? "alert" : "status"}>{message}</p>}
    {!loading && !dataReady && <div className="workspace-state"><p>Precisamos carregar seus botões antes de editar para preservar a ordem e evitar destinos repetidos.</p><button type="button" className="premium-btn" onClick={() => window.location.reload()}>Tentar novamente</button></div>}
    {!loading && !canEdit && <p className="notice">Seu acesso permite consultar os botões. Peça a um administrador da empresa para editar.</p>}
    {template && <section className="template-action-suggestions" aria-label="Sugestões do modelo">
      <div><span className="section-kicker">MODELO {template.name.toLocaleUpperCase("pt-BR")}</span><h2>Atalhos para seu segmento</h2><p>Os botões já configurados ficam fora das sugestões. Cada novo destino é preenchido por você antes de publicar.</p></div>
      {!dataReady ? <p>As sugestões ficam disponíveis depois que todos os seus botões forem carregados.</p> : suggestions.length ? <div className="template-suggestion-list">{suggestions.map(suggestion => <button className="template-suggestion" type="button" key={suggestion.type} onClick={() => configureSuggestion(suggestion)} disabled={busy || loading || !canEdit}><Plus size={16}/><span><b>{suggestion.label}</b><small>{suggestion.hint}</small></span><span>Configurar</span></button>)}</div> : <p>Você já configurou os tipos de botão sugeridos para este segmento.</p>}
      <Link href="/dashboard/editor#modelos">Ver modelos da página</Link>
    </section>}
    <div className="actions-workspace">
      <div className="actions-builder" ref={builder}>
        <p className="eyebrow">{editingId ? "EDITANDO BOTÃO" : "NOVO BOTÃO"}</p><h2>{editingId ? "Atualizar botão" : "Adicionar um botão"}</h2>
        <p className="action-form-hint">Escolha uma ação, dê um nome claro e informe o destino. Ao salvar, o botão já aparece na sua página.</p>
        <form className="action-form" onSubmit={save} aria-busy={busy}>
          <fieldset disabled={busy || loading || !dataReady || !canEdit} className="action-fields">
            <label>Tipo do botão<select value={form.type} onChange={event => { const type = event.target.value as ActionType; setForm(emptyActionForm(type)); }} aria-label="Tipo da ação">{actionTypes.map(type => <option key={type[0]} value={type[0]}>{type[1]}</option>)}</select></label>
            <label>Nome do botão<input ref={nameInput} placeholder="Ex.: Agendar horário" aria-label="Nome do botão" maxLength={80} required value={form.label} onChange={event => set("label", event.target.value)}/></label>
            {directContactExists && <p className="contact-already-configured">Esse contato já aparece na página. <Link href="/dashboard/editor#contatos">Edite o contato em Minha página</Link> para manter um único botão.</p>}
            {form.type === "wifi" ? <div className="pix-action-form">
              <label>Nome da rede (SSID)<input placeholder="Nome da rede (SSID)" value={form.wifiSsid} onChange={event => set("wifiSsid", event.target.value)} required/></label>
              <label>Segurança<select value={form.wifiSecurity} onChange={event => set("wifiSecurity", event.target.value)}><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">Sem senha</option></select></label>
              {form.wifiSecurity !== "nopass" && <label>Senha do Wi-Fi<input type="text" autoComplete="off" placeholder="Senha do Wi-Fi" value={form.wifiPassword} onChange={event => set("wifiPassword", event.target.value)} required/></label>}
              <label className="checkline"><input type="checkbox" checked={form.wifiHidden} onChange={event => set("wifiHidden", event.target.checked)}/> Rede oculta</label>
              <label>QR Code da rede<select value={form.wifiQrCodeId} onChange={event => set("wifiQrCodeId", event.target.value)}><option value="">Sem QR Code Wi-Fi</option>{qrCodes.map(qr => <option key={qr.id} value={qr.id}>{qr.name}</option>)}</select></label>
              <small className="muted">Envie uma imagem de QR Code em <Link href="/dashboard/nfc#qr-codes">Compartilhar e QR Codes</Link> e selecione aqui.</small>
            </div> : form.type === "pix" ? <div className="pix-action-form">
              <label>Tipo da chave<select value={form.pixKeyType} onChange={event => set("pixKeyType", event.target.value)}><option value="random">Chave aleatória</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="phone">Telefone</option><option value="email">E-mail</option></select></label>
              <label>Chave PIX<input placeholder="Chave PIX" value={form.pixKey} onChange={event => set("pixKey", event.target.value)}/></label>
              <label>Nome do recebedor<input placeholder="Nome do recebedor (opcional)" value={form.pixReceiver} onChange={event => set("pixReceiver", event.target.value)}/></label>
              <label>Valor em reais (opcional)<input type="number" min="0" max="999999999" step="0.01" placeholder="Valor (opcional)" value={form.pixAmount} onChange={event => set("pixAmount", event.target.value)}/></label>
              <label>Descrição<input placeholder="Descrição (opcional)" value={form.pixDescription} onChange={event => set("pixDescription", event.target.value)}/></label>
              <label>PIX Copia e Cola<input placeholder="Pix Copia e Cola (opcional)" value={form.pixCopyPaste} onChange={event => set("pixCopyPaste", event.target.value)}/></label>
              <label>QR Code do PIX<select value={form.pixQrCodeId} onChange={event => set("pixQrCodeId", event.target.value)}><option value="">Sem QR Code</option>{qrCodes.map(qr => <option key={qr.id} value={qr.id}>{qr.name}</option>)}</select></label>
              <small className="muted">Informe uma chave, um código Copia e Cola ou uma imagem de QR Code enviada em <Link href="/dashboard/nfc#qr-codes">Compartilhar e QR Codes</Link>.</small>
            </div> : <label>Destino<input placeholder={destinationPlaceholder} aria-label="URL ou destino" inputMode={form.type === "phone" || form.type === "whatsapp" ? "tel" : "url"} autoCapitalize="none" spellCheck={false} aria-describedby="action-destination-help" value={form.url} maxLength={2048} onChange={event => set("url", event.target.value)} required/><small id="action-destination-help" className="workspace-field-help">{form.type === "phone" || form.type === "whatsapp" ? "Informe o número com DDD. O contato deve ser diferente dos que já estão em Minha página." : form.type === "instagram" ? "Use o nome do perfil com @ ou o link completo do Instagram." : "Cole o link completo do destino. Confira o endereço antes de publicar."}</small></label>}
          </fieldset>
          <div className="action-form-controls"><button className="btn dark" disabled={busy || loading || !dataReady || !companyId || !canEdit || Boolean(directContactExists)}>{busy ? "Salvando…" : editingId ? "Salvar botão" : "Adicionar botão"}</button>{editingId && <button type="button" className="premium-btn" onClick={cancelEdit} disabled={busy}>Cancelar edição</button>}</div>
        </form>
      </div>
      <section className="actions-existing" aria-label="Botões cadastrados">
        <div className="actions-existing-heading"><div><p className="eyebrow">SEUS BOTÕES</p><h2>Organize suas conexões</h2></div><span>{publicIds.size} visíveis · {items.length} no total</span></div>
        <p className="action-order-help">No celular, use as setas para subir ou descer um botão. No computador, você também pode arrastar pela alça. A ordem é salva automaticamente.</p>
        {loading ? <p role="status">Carregando botões…</p> : !items.length ? <div className="workspace-state"><h3>Seu primeiro botão começa aqui.</h3><p>Preencha o formulário de novo botão. Escolha o destino que seus clientes mais procuram, como um agendamento ou seu site.</p></div> : <ol className="editable-action-list" aria-label="Ordem dos botões" aria-busy={busy}>{items.map((action, index) => <li key={action.id}
          className={"editable-action " + (!action.enabled ? "is-hidden " : "") + (editingId === action.id ? "is-editing " : "") + (draggedId === action.id ? "is-dragging" : "")}
          onDragOver={event => { if (draggedId && canEdit && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
          onDrop={event => { event.preventDefault(); const source = event.dataTransfer.getData("text/plain"); if (source === draggedId) void reorder(source, action.id); }}>
          <div className="editable-action-summary"><button className="action-drag-handle" type="button" draggable={canEdit && dataReady && !busy} disabled={!canEdit || !dataReady || busy} aria-label={"Arrastar " + action.label}
            onDragStart={event => { event.dataTransfer.setData("text/plain", action.id); event.dataTransfer.effectAllowed = "move"; setDraggedId(action.id); }} onDragEnd={() => setDraggedId(null)}><GripVertical size={18}/></button>
            <span className="action-order-number">{index + 1}</span><div><strong>{action.label}</strong><small>{action.type === "pix" ? "Pagamento por PIX" : action.type === "wifi" ? "Wi-Fi · " + (action.wifi_ssid || "Rede") : action.url}</small><span className="action-visibility">{!action.enabled ? "Oculto da página" : publicIds.has(action.id) ? "Visível na página" : "Destino repetido · revise este botão"}</span></div></div>
          <div className="editable-action-controls"><div className="action-move-controls"><button type="button" disabled={!canEdit || !dataReady || busy || index === 0} onClick={() => void reorder(action.id, items[index - 1].id)} aria-label={"Mover " + action.label + " para cima"}><ArrowUp size={15}/></button><button type="button" disabled={!canEdit || !dataReady || busy || index === items.length - 1} onClick={() => void reorder(action.id, items[index + 1].id)} aria-label={"Mover " + action.label + " para baixo"}><ArrowDown size={15}/></button></div>
            <button type="button" onClick={() => startEdit(action)} disabled={!canEdit || !dataReady || busy} aria-pressed={editingId === action.id}><Pencil size={14}/> Editar</button>
            <button type="button" onClick={() => void toggle(action)} disabled={!canEdit || !dataReady || busy} aria-label={(action.enabled ? "Ocultar " : "Ativar ") + action.label}>{action.enabled ? "Ocultar" : "Ativar"}</button>
            <button type="button" className="action-delete" onClick={() => void remove(action)} disabled={!canEdit || !dataReady || busy} aria-label={"Excluir " + action.label}><Trash2 size={14}/><span>Excluir</span></button></div>
        </li>)}</ol>}
      </section>
    </div>
  </section></main>;
}
