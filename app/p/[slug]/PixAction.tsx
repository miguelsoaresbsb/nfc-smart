"use client";

import { useId, useState } from "react";
import { useModal } from "@/lib/use-modal";

type PixActionData = {
  id: string;
  label: string;
  pix_key?: string | null;
  pix_key_type?: string | null;
  pix_receiver_name?: string | null;
  pix_amount?: number | null;
  pix_description?: string | null;
  pix_copy_paste?: string | null;
  pix_qr_code_id?: string | null;
  qr_code?: { image_url: string; name: string } | null;
};

export function PixAction({ action }: { action: PixActionData }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const titleId = useId();
  const helpId = useId();
  const dialog = useModal(open, () => setOpen(false));
  const sameCopyValue = Boolean(action.pix_key && action.pix_copy_paste && action.pix_key.trim() === action.pix_copy_paste.trim());
  const hasPaymentDetails = Boolean(action.pix_key || action.pix_copy_paste || action.qr_code?.image_url);

  function showPayment() {
    setCopied("");
    setError("");
    setManualCopy("");
    setOpen(true);
  }

  async function copy(value: string, type: string) {
    try {
      await navigator.clipboard.writeText(value);
      setError("");
      setManualCopy("");
      setCopied(type);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setManualCopy(value);
      setError("Não foi possível copiar automaticamente. Selecione e copie o código no campo abaixo.");
    }
  }

  return <>
    <button type="button" className="bio-action" data-action-id={action.id} aria-haspopup="dialog" onClick={showPayment}>
      <span className="bio-pix-symbol" aria-hidden="true">PIX</span><b>{action.label}</b><small aria-hidden="true">↗</small>
    </button>
    {open && <div className="pix-modal-backdrop" onClick={() => setOpen(false)}>
      <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={helpId} className="pix-modal" onClick={event => event.stopPropagation()}>
        <button type="button" aria-label="Fechar" className="pix-close" onClick={() => setOpen(false)}>×</button>
        <div className="pix-modal-icon" aria-hidden="true">PIX</div>
        <p className="eyebrow">PAGAMENTO</p>
        <h2 id={titleId}>Pague via PIX</h2>
        {action.pix_receiver_name && <p className="pix-receiver">{action.pix_receiver_name}</p>}
        {action.pix_amount != null && <strong className="pix-amount">R$ {Number(action.pix_amount).toFixed(2).replace(".", ",")}</strong>}
        {action.pix_description && <p className="pix-description">{action.pix_description}</p>}
        <p id={helpId} className="public-dialog-intro">{hasPaymentDetails ? "Use os dados abaixo no aplicativo do seu banco para fazer o pagamento." : "A empresa ainda não informou os dados para este pagamento. Entre em contato com ela antes de pagar."}</p>
        {action.qr_code?.image_url && <img className="pix-qr" src={action.qr_code.image_url} alt="QR Code PIX" width={260} height={260}/>}
        {action.pix_copy_paste && <button type="button" className="pix-copy" onClick={() => copy(action.pix_copy_paste!, "copypaste")}>{copied === "copypaste" ? "Copiado!" : "Copiar Pix Copia e Cola"}</button>}
        {action.pix_key && <div className="pix-key-box"><small>CHAVE PIX · {action.pix_key_type || "chave"}</small><strong>{action.pix_key}</strong>{!sameCopyValue && <button type="button" className="pix-copy" onClick={() => copy(action.pix_key!, "key")}>{copied === "key" ? "Copiado!" : "Copiar chave PIX"}</button>}</div>}
        <p className={"public-copy-status" + (error ? " is-error" : "")} role="status" aria-live="polite">{error || (copied ? "Dados copiados. Agora abra o aplicativo do seu banco." : "")}</p>
        {manualCopy && <label className="public-manual-copy">Código para copiar manualmente<textarea readOnly rows={3} value={manualCopy} onFocus={event => event.currentTarget.select()}/></label>}
        {hasPaymentDetails && <p className="pix-help public-dialog-tip">Confira o nome do recebedor e o valor no banco antes de confirmar o pagamento.</p>}
      </section>
    </div>}
  </>;
}
