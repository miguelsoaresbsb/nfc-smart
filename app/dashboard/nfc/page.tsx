"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowRight, Download, ImagePlus, QrCode, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import PublicUrl from "../PublicUrl";
import { getPublicPageUrl } from "@/lib/public-url";

type QrItem = { id: string; name: string; image_url: string; storage_path: string | null; description: string | null; position: number; enabled: boolean };
export default function SharePage() {
  const sb = useMemo(() => createClient(), []);
  const [company, setCompany] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [items, setItems] = useState<QrItem[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(""), [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (message && messageError) feedback.current?.focus(); }, [message, messageError]);

  async function load(id: string) {
    const { data, error } = await sb.from("qr_codes").select("id,name,image_url,storage_path,description,position,enabled").eq("company_id", id).order("position").order("created_at");
    if (error) throw new Error("Não foi possível carregar os QR Codes. Atualize a página para tentar novamente.");
    setItems(data || []); setReady(true);
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { window.location.href = "/login"; return; }
        const { data: member, error } = await sb.from("company_members").select("company_id,role").eq("user_id", user.id).limit(1).maybeSingle();
        if (error) throw error;
        if (!member) { window.location.href = "/acesso-pendente"; return; }
        const result = await sb.from("companies").select("id,name,slug").eq("id", member.company_id).single();
        if (result.error) throw result.error;
        if (!alive) return;
        setCompany(result.data); setCanEdit(["owner", "admin", "editor"].includes(member.role));
        await load(member.company_id);
      } catch { if (alive) { setMessageError(true); setMessage("Não foi possível carregar os dados de compartilhamento. Atualize a página para tentar novamente."); } }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [sb]);

  const publicUrl = company ? getPublicPageUrl(company.slug) : "";
  const pageQrExists = items.some(item => item.enabled && item.description === publicUrl);
  const mutable = canEdit && ready && !loading && !busy && Boolean(company);

  async function storeQr(blob: Blob, name: string, description?: string) {
    if (!company) return;
    const path = company.id + "/qr-codes/" + crypto.randomUUID() + "." + (blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png");
    const upload = await sb.storage.from("company-assets").upload(path, blob, { upsert: false, contentType: blob.type, cacheControl: "3600" });
    if (upload.error) throw new Error("Não foi possível enviar a imagem. Tente novamente.");
    const imageUrl = sb.storage.from("company-assets").getPublicUrl(path).data.publicUrl;
    const saved = await sb.from("qr_codes").insert({ company_id: company.id, name, image_url: imageUrl, storage_path: path, description: description || null, position: items.reduce((max, item) => Math.max(max, item.position), -1) + 1, enabled: true });
    if (saved.error) { await sb.storage.from("company-assets").remove([path]); throw new Error("Não foi possível salvar o QR Code. Verifique sua permissão e tente novamente."); }
    await load(company.id);
  }
  async function generatePageQr() {
    if (!mutable || !company || pageQrExists) return;
    setBusy("generate"); setMessage(""); setMessageError(false);
    try {
      const canvas = document.createElement("canvas");
      await QRCode.toCanvas(canvas, publicUrl, { errorCorrectionLevel: "H", margin: 2, width: 900, color: { dark: "#111111", light: "#FFFFFF" } });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(image => {
        if (image) resolve(image);
        else reject(new Error("Não foi possível gerar a imagem do QR Code. Tente novamente."));
      }, "image/png"));
      await storeQr(blob, "Página NFC - " + company.name, publicUrl);
      setMessage("QR Code da página gerado. Ele está disponível abaixo para baixar.");
    } catch (error) { setMessageError(true); setMessage(error instanceof Error ? error.message : "Não foi possível gerar o QR Code."); }
    finally { setBusy(""); }
  }
  async function uploadQr(file: File) {
    if (!mutable) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setMessageError(true); setMessage("Envie uma imagem PNG, JPG ou WEBP."); return; }
    if (file.size > 6 * 1024 * 1024 || file.size === 0) { setMessageError(true); setMessage("Escolha uma imagem válida de até 6 MB."); return; }
    setBusy("upload"); setMessage(""); setMessageError(false);
    try { await storeQr(file, file.name.replace(/\.[^.]+$/, "").slice(0, 100) || "QR Code"); setMessage("QR Code enviado. Você já pode selecioná-lo em Botões → PIX ou Wi-Fi."); }
    catch (error) { setMessageError(true); setMessage(error instanceof Error ? error.message : "Não foi possível enviar o QR Code."); }
    finally { setBusy(""); }
  }
  async function downloadQr(item: QrItem) {
    if (busy) return;
    setBusy(item.id); setMessage(""); setMessageError(false);
    try {
      const response = await fetch(item.image_url);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "nfc-smart-qr-code." + extension; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setMessageError(true); setMessage("Não foi possível baixar o QR Code. Tente novamente."); }
    finally { setBusy(""); }
  }
  async function removeQr(item: QrItem) {
    if (!mutable || !company || !confirm("Excluir este QR Code? Os botões que usam esta imagem ficarão sem QR Code.")) return;
    setBusy(item.id); setMessage(""); setMessageError(false);
    try {
      const result = await sb.from("qr_codes").delete().eq("id", item.id).eq("company_id", company.id).select("id").single();
      if (result.error) throw new Error("Não foi possível excluir este QR Code. Tente novamente.");
      if (item.storage_path) await sb.storage.from("company-assets").remove([item.storage_path]);
      await load(company.id); setMessage("QR Code excluído.");
    } catch (error) { setMessageError(true); setMessage(error instanceof Error ? error.message : "Não foi possível excluir o QR Code."); }
    finally { setBusy(""); }
  }

  return <main className="premium-shell qr-page"><section className="subpage">
    <div className="section-kicker">COMPARTILHAR</div>
    <div className="hub-title"><div><h1>Uma página. <span>Muitas conexões.</span></h1><p>Use sempre o mesmo endereço na plaquinha NFC. Suas edições atualizam a página sem precisar regravar a TAG.</p></div></div>
    {company && <PublicUrl slug={company.slug}/>}
    {loading && <p role="status">Carregando os dados da sua página…</p>}
    {!loading && !ready && <div className="workspace-state"><p>Precisamos carregar a biblioteca antes de gerar ou enviar um QR Code.</p><button type="button" className="premium-btn" onClick={() => window.location.reload()}>Tentar novamente</button></div>}
    {!loading && ready && !canEdit && <p className="notice">Você pode copiar o endereço e baixar os códigos. A edição é feita pelo administrador da empresa.</p>}
    <div className="share-heading" id="qr-codes"><h2>QR Codes da sua empresa</h2><p>O código da página abre seu endereço NFC. As imagens de PIX e Wi-Fi podem ser associadas aos seus botões.</p></div>
    <div className="share-options">
      <section><span className="share-option-icon"><QrCode size={23}/></span><h3>QR Code da página</h3><p>Use em materiais impressos ou compartilhe para abrir a página da empresa.</p><button className="premium-btn premium-btn-dark" type="button" disabled={!mutable || pageQrExists} onClick={generatePageQr}>{busy === "generate" ? "Gerando…" : pageQrExists ? "Já disponível na biblioteca" : "Gerar QR Code da página"}</button></section>
      <section><span className="share-option-icon"><ImagePlus size={23}/></span><h3>PIX e Wi-Fi</h3><p id="qr-upload-help">Envie um QR Code que você já possui. PNG, JPG ou WEBP, até 6 MB.</p><label className={"premium-btn share-upload" + (!mutable ? " is-disabled" : "")}><ImagePlus size={15}/>{busy === "upload" ? "Enviando…" : "Enviar imagem de QR Code"}<input className="workspace-file-input" type="file" aria-label="Enviar imagem de QR Code" aria-describedby="qr-upload-help" accept="image/png,image/jpeg,image/webp" disabled={!mutable} onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void uploadQr(file); }}/></label></section>
    </div>
    {message && <p ref={feedback} tabIndex={-1} className={"notice" + (messageError ? " is-error" : "")} role={messageError ? "alert" : "status"}>{message}</p>}
    {!loading && ready && (items.length ? <div className="qr-list">{items.map(item => <article className="qr-item" key={item.id}>
      <img src={item.image_url} alt={item.name}/><div><strong>{item.name}</strong><small>{item.description === publicUrl ? "Endereço permanente da sua página NFC" : "Selecione em Botões → PIX ou Wi-Fi"}</small></div>
      <div className="share-item-actions"><button className="premium-btn" disabled={Boolean(busy)} onClick={() => void downloadQr(item)} aria-label={"Baixar " + item.name}><Download size={14}/>Baixar</button>{canEdit && <button className="premium-btn danger" disabled={!mutable} onClick={() => void removeQr(item)} aria-label={"Excluir " + item.name}><Trash2 size={14}/>Excluir</button>}</div>
    </article>)}</div> : <div className="workspace-state"><h3>Um código, o mesmo endereço.</h3><p>Gere o QR Code da página para usar na plaquinha e nos materiais impressos. Se já tem um QR Code de PIX ou Wi-Fi, envie a imagem no campo acima.</p></div>)}
    <div className="qr-next"><p>Para mostrar um QR Code de PIX ou Wi-Fi ao visitante, selecione a imagem no botão correspondente.</p><Link className="premium-btn" href="/dashboard/actions">Ir para Botões<ArrowRight size={15}/></Link></div>
  </section></main>;
}
