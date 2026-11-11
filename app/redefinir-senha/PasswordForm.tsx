"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import AuthPasswordField from "@/app/components/AuthPasswordField";
import { passwordValidation } from "@/lib/auth-recovery";

export default function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [signoutFailed, setSignoutFailed] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const router = useRouter();
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
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
      if (!response.ok) { setError(typeof data.error === "string" ? data.error : "Não foi possível atualizar sua senha. Aguarde um momento e tente novamente."); setExpired(Boolean(data.expired)); return; }
      setPassword(""); setConfirmation("");
      if (data.signoutFailed) { setSignoutFailed(true); return; }
      router.replace("/login?password=updated"); router.refresh();
    } catch { setError("Não foi possível conectar. Confira sua internet e tente novamente. Suas senhas continuam preenchidas."); }
    finally { setBusy(false); }
  }
  if (signoutFailed) return <div className="auth-flow-success" role="status"><p>Senha atualizada. Encerre sua sessão antes de entrar novamente.</p><form method="post" action="/auth/signout"><button className="premium-btn premium-btn-dark auth-submit">Encerrar sessão</button></form></div>;
  return <form className="auth-flow-form" onSubmit={submit} aria-busy={busy}>
    {!expired && <>
      <AuthPasswordField id="reset-password" name="password" label="Nova senha" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required placeholder="Crie uma senha exclusiva" hint="Use pelo menos 8 caracteres. Prefira letras, números e símbolos." disabled={busy}/>
      <AuthPasswordField id="reset-confirmation" name="confirmation" label="Confirme a nova senha" revealLabel="confirmação da senha" autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} required placeholder="Digite a mesma senha novamente" disabled={busy}/>
      <p className="auth-flow-note">Depois de salvar, você sairá da conta e entrará novamente com a nova senha.</p>
    </>}
    {error && <p className="error auth-form-error" id="reset-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    {expired ? <Link href="/recuperar-senha" className="premium-btn premium-btn-dark auth-submit">Solicitar novo link</Link> : <button className="premium-btn premium-btn-dark auth-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={18} className="auth-busy-icon" aria-hidden="true"/> Salvando…</> : "Salvar nova senha"}</button>}
  </form>;
}
