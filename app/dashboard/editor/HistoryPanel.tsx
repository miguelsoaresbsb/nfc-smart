"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, History, LoaderCircle, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { historyOperationLabel, historyRestoreError, parseContentHistory, type ContentHistory } from "@/lib/content-history";
import "./history.css";

const dates = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default function HistoryPanel({ companyId, canEdit, disabled, hasUnsavedChanges, refreshKey, onRestored, onBusyChange }: {
  companyId: string; canEdit: boolean; disabled: boolean; hasUnsavedChanges: boolean; refreshKey: string; onRestored: (notice: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const sb = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ContentHistory | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [restoring, setRestoring] = useState(false), [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (error) feedback.current?.focus(); }, [error]);

  const load = useCallback(async () => {
    const sequence = ++request.current;
    setLoading(true); setError("");
    try {
      const [result, auth] = await Promise.all([sb.rpc("get_company_content_history", { p_company_id: companyId }), sb.auth.getUser()]);
      if (sequence !== request.current) return;
      if (result.error) throw result.error;
      const next = parseContentHistory(result.data);
      setHistory(next); setUserId(auth.data.user?.id || "");
      setSelectedId(current => next.versions.some(version => version.id === current) ? current : next.versions[0]?.id || "");
    } catch {
      if (sequence === request.current) { setHistory(null); setError("Não conseguimos consultar o histórico agora. Atualize a lista para tentar novamente."); }
    } finally { if (sequence === request.current) setLoading(false); }
  }, [sb, companyId]);

  useEffect(() => { if (open) void load(); }, [open, refreshKey, load]);
  const selected = history?.versions.find(version => version.id === selectedId);

  async function restore() {
    if (!history || !selected || !canEdit || disabled || restoring || loading) return;
    const message = `Restaurar a versão de ${dates.format(new Date(selected.created_at))}? Ela substituirá os dados, as cores, os contatos e os botões publicados. Seu conteúdo atual será guardado no histórico. Imagens e QR Codes já excluídos não são recuperados.${hasUnsavedChanges ? " As alterações ainda não salvas na prévia serão descartadas." : ""}`;
    if (!window.confirm(message)) return;
    setRestoring(true); onBusyChange(true); setError("");
    try {
      const result = await sb.rpc("restore_company_content_version", { p_company_id: companyId, p_version_id: selected.id, p_expected_revision: history.revision });
      if (result.error) { setError(historyRestoreError(result.error.code)); return; }
      const missing = typeof result.data?.missing_qr_references === "number" ? result.data.missing_qr_references : 0;
      onRestored(missing ? "Versão restaurada. Alguns QR Codes haviam sido excluídos; selecione novas imagens em Botões para esses atalhos." : "Versão restaurada. Sua página e seus botões já usam o conteúdo escolhido.");
    } catch { setError("Não conseguimos confirmar a restauração por causa da conexão. Atualize o histórico para conferir a página antes de tentar novamente."); }
    finally { setRestoring(false); onBusyChange(false); }
  }

  return <details className="content-history" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span className="content-history-icon"><History size={22} aria-hidden="true"/></span><span><strong>Histórico de alterações</strong><small>Recupere uma versão anterior da página e dos botões.</small></span><ChevronDown size={20} aria-hidden="true"/></summary>
    {open && <div className="content-history-body" aria-busy={loading || restoring}>
      <div className="content-history-intro"><p>Guardamos até 30 versões, antes das alterações. A restauração muda o conteúdo publicado e mantém uma cópia do estado atual.</p><button type="button" className="premium-btn" onClick={() => void load()} disabled={loading || restoring || disabled}><RefreshCw size={16} aria-hidden="true"/>Atualizar histórico</button></div>
      {error && <p className="content-history-error" role="alert" tabIndex={-1} ref={feedback}>{error}</p>}
      {loading ? <p className="content-history-loading" role="status"><LoaderCircle size={18} className="spin" aria-hidden="true"/>Carregando versões…</p> : history && (history.versions.length ? <div className="content-history-grid">
        <ol className="content-history-list" aria-label="Versões salvas">{history.versions.map(version => <li key={version.id}><button type="button" aria-pressed={selectedId === version.id} disabled={restoring} onClick={() => setSelectedId(version.id)}><time dateTime={version.created_at}>{dates.format(new Date(version.created_at))}</time><strong>{historyOperationLabel(version.operation)}</strong><small>{version.actor_id === userId ? "Alteração feita por você" : version.actor_id ? "Alteração da equipe" : "Registro do sistema"}</small></button></li>)}</ol>
        {selected && <section className="content-history-preview" aria-label="Resumo da versão escolhida"><span className="section-kicker">VERSÃO SELECIONADA</span><h3>{selected.summary.name}</h3><p>{selected.summary.description || "Sem descrição nesta versão."}</p><strong>{selected.summary.action_count} {selected.summary.action_count === 1 ? "botão salvo" : "botões salvos"}</strong>{selected.summary.buttons.length > 0 && <ul>{selected.summary.buttons.map((button, index) => <li key={index}>{button.label}<small>{button.enabled ? "Visível" : "Oculto"}</small></li>)}</ul>}{selected.summary.action_count > selected.summary.buttons.length && <p className="content-history-more">O resumo mostra os primeiros {selected.summary.buttons.length} botões. A restauração inclui todos os botões da versão.</p>}<p className="content-history-boundary"><ShieldCheck size={18} aria-hidden="true"/>Seu endereço, a assinatura e as permissões da equipe não são alterados.</p>{!canEdit && <p className="content-history-permission">Você pode consultar as versões. A restauração é feita por quem tem permissão para editar a página.</p>}<button type="button" className="premium-btn premium-btn-dark content-history-restore" onClick={() => void restore()} disabled={!canEdit || disabled || restoring || loading}>{restoring ? <LoaderCircle size={17} className="spin" aria-hidden="true"/> : <RotateCcw size={17} aria-hidden="true"/>}{restoring ? "Restaurando…" : "Restaurar esta versão"}</button></section>}
      </div> : <p className="content-history-empty">Seu histórico ainda não tem versões. A primeira cópia será guardada quando uma alteração for salva.</p>)}
      <p className="content-history-note">As cópias guardam textos, cores, contatos e botões. Arquivos de imagem e QR Codes excluídos da biblioteca não podem ser recuperados por este histórico.</p>
    </div>}
  </details>;
}
