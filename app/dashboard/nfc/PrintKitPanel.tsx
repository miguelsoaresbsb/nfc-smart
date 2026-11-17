"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, FileText, LoaderCircle, Printer } from "lucide-react";
import "./print-kit.css";

export default function PrintKitPanel({ disabled = false }: { disabled?: boolean }) {
  const title = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (failed) feedback.current?.focus(); }, [failed]);

  async function download() {
    if (disabled || busy) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/print-kit", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.error === "string" ? data.error : "Não foi possível baixar o PDF. Tente novamente.");
      }
      if (!response.headers.get("content-type")?.startsWith("application/pdf")) throw new Error("A resposta do download não é um PDF válido. Atualize a página e tente novamente.");
      const file = await response.blob();
      const source = URL.createObjectURL(file);
      const link = document.createElement("a");
      const suggested = response.headers.get("content-disposition")?.match(/filename="([a-z0-9-]+\.pdf)"/)?.[1];
      link.href = source; link.download = suggested || "nfc-smart-material.pdf";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(source), 10000);
      setMessage("PDF preparado para download. Abra o arquivo, confira o nome e imprima em tamanho real (100%).");
    } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : "Não foi possível conectar. Confira sua internet e tente novamente.");
    } finally { setBusy(false); }
  }

  return <section className="print-kit-panel" aria-labelledby={title} aria-busy={busy}>
    <div className="print-kit-icon"><Printer size={23} aria-hidden="true"/></div>
    <div className="print-kit-copy"><span className="section-kicker">PRONTO PARA IMPRIMIR</span><h2 id={title}>Sua página também no papel.</h2><p>Baixe uma folha A4 com o nome da empresa, o QR Code da página e instruções para o cliente. Use no balcão, na recepção ou em materiais do seu negócio.</p><p className="print-kit-note"><FileText size={16} aria-hidden="true"/>PDF em A4 · QR Code do endereço da página · não é um código de pagamento PIX.</p></div>
    <button type="button" className="premium-btn premium-btn-dark print-kit-download" disabled={disabled || busy} onClick={() => void download()}>{busy ? <><LoaderCircle size={18} aria-hidden="true"/>Preparando PDF…</> : <><Download size={18} aria-hidden="true"/>Baixar material em PDF</>}</button>
    {message && <p ref={feedback} tabIndex={-1} role={failed ? "alert" : "status"} className={"print-kit-feedback" + (failed ? " is-error" : "")}>{message}</p>}
  </section>;
}
