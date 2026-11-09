"use client";

import { useState } from "react";
import { getPublicPageUrl } from "@/lib/public-url";


export default function PublicUrl({ slug }: { slug?: string | null }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const validSlug = Boolean(slug?.trim());
  const url = validSlug
    ? getPublicPageUrl(slug!.trim())
    : "";

  async function copy() {
    if (!url) return;
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setError("Não foi possível copiar. Selecione o endereço acima e copie manualmente.");
    }
  }

  return (
    <div className="public-url-card">
      <div>
        <p className="eyebrow">LINK DA PÁGINA PÚBLICA</p>
        <strong>Este é o endereço que deve ser gravado na sua plaquinha NFC</strong>
        {validSlug ? (
          <>
            <div className="public-url">{url}</div>
            <small>O cliente abre este link diretamente, sem login. Use sempre este endereço oficial, não um link de preview.</small>
          </>
        ) : (
          <small>O endereço público ainda não foi configurado para esta empresa.</small>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {validSlug && (
        <div className="public-url-actions">
          <a className="btn ghost" href={url} target="_blank" rel="noreferrer">Abrir página</a>
          <button className="btn dark" onClick={copy}>{copied ? "Copiado ✓" : "Copiar link"}</button>
        </div>
      )}
    </div>
  );
}
