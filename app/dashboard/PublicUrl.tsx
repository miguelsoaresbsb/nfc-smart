"use client";

import { useState } from "react";

export default function PublicUrl({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined"
    ? window.location.origin + "/p/" + slug
    : "/p/" + slug;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="public-url-card">
      <div>
        <p className="eyebrow">LINK DA PÁGINA PÚBLICA</p>
        <strong>Use este endereço na sua plaquinha NFC</strong>
        <div className="public-url">{url}</div>
        <small>O cliente abre este link diretamente, sem login.</small>
      </div>
      <div className="public-url-actions">
        <a className="btn ghost" href={url} target="_blank" rel="noreferrer">Abrir página</a>
        <button className="btn dark" onClick={copy}>{copied ? "Copiado ✓" : "Copiar link"}</button>
      </div>
    </div>
  );
}
