"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { passwordValidation } from "@/lib/auth-recovery";

export default function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [signoutFailed, setSignoutFailed] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const invalid = passwordValidation(password, confirmation);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/auth/password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Não foi possível atualizar sua senha."); setExpired(Boolean(data.expired)); return; }
      setPassword(""); setConfirmation("");
      if (data.signoutFailed) { setSignoutFailed(true); return; }
      router.replace("/login?password=updated"); router.refresh();
    } catch { setError("Não foi possível conectar. Verifique a conexão e tente novamente."); }
    finally { setBusy(false); }
  }
  if (signoutFailed) return <div className="auth-flow-success" role="status"><p>Senha atualizada. Encerre sua sessão antes de entrar novamente.</p><form method="post" action="/auth/signout"><button className="premium-btn premium-btn-dark">Encerrar sessão</button></form></div>;
  return <form className="auth-flow-form" onSubmit={submit}>
    {!expired && <><label>Nova senha<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Pelo menos 8 caracteres"/></label>
    <label>Confirme a nova senha<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} required placeholder="Digite a senha novamente"/></label>
    <p className="auth-flow-note">Prefira uma senha exclusiva, com letras, números e símbolos.</p></>}
    {error && <p className="error" role="alert">{error}</p>}
    {expired ? <Link href="/recuperar-senha" className="premium-btn premium-btn-dark">Solicitar novo link</Link> : <button className="premium-btn premium-btn-dark auth-submit" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>}
  </form>;
}
