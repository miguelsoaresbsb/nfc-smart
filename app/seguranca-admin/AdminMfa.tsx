"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { mfaErrorMessage, normalizeTotpCode, totpQrImage } from "@/lib/admin-mfa";

type Factor = { id: string; status: string; factor_type: string; friendly_name?: string };
type Enrollment = { id: string; qr: string; secret: string };

export default function AdminMfa({ initiallyVerified }: { initiallyVerified: boolean }) {
  const sb = useMemo(createClient, []);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [sessionVerified, setSessionVerified] = useState(initiallyVerified);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [name, setName] = useState(initiallyVerified ? "Autenticador de reserva" : "Autenticador principal");
  const [code, setCode] = useState(""), [factorId, setFactorId] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [removing, setRemoving] = useState<Factor | null>(null);
  const [keptFactorId, setKeptFactorId] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    let alive = true;
    setLoading(true); setLoaded(false); setError("");
    (async () => {
      const { data: auth, error: authError } = await sb.auth.getUser();
      if (authError || !auth.user) { window.location.replace("/login"); return; }
      const role = await sb.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
      if (role.error) throw new Error("access");
      if (!role.data) { window.location.replace("/dashboard"); return; }
      const result = await sb.auth.mfa.listFactors();
      if (result.error) throw result.error;
      if (!alive) return;
      const totp = result.data.all.filter(item => item.factor_type === "totp") as Factor[];
      setFactors(totp);
      setFactorId(totp.find(item => item.status === "verified")?.id || "");
      setLoaded(true);
    })().catch(() => { if (alive) setError("Não conseguimos consultar seus autenticadores. Tente carregar novamente antes de continuar."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt, sb]);

  const verified = factors.filter(item => item.status === "verified");
  const incomplete = factors.filter(item => item.status !== "verified");
  const canManage = sessionVerified && verified.length > 0;
  const challenge = !canManage && verified.length > 0;
  const currentName = (factor: Factor) => factor.friendly_name?.trim() || "Autenticador cadastrado";

  function resetFeedback() { setError(""); setMessage(""); }
  function verifyCodeInput() {
    const normalized = normalizeTotpCode(code);
    if (!normalized) setError("Digite os seis números que aparecem no seu aplicativo autenticador.");
    return normalized;
  }
  async function beginEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || !loaded || enrollment) return;
    const friendlyName = name.trim();
    if (!friendlyName || friendlyName.length > 60) { setError("Dê um nome ao autenticador, usando até 60 caracteres."); return; }
    setBusy(true); resetFeedback();
    try {
      const result = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName, issuer: "NFC SMART" });
      if (result.error) { setError(mfaErrorMessage(result.error.code)); return; }
      // Keep failed QR preparation recoverable as an incomplete enrollment.
      setFactors(current => [...current, { id: result.data.id, status: "unverified", factor_type: "totp", friendly_name: friendlyName }]);
      setEnrollment({ id: result.data.id, qr: totpQrImage(result.data.totp.qr_code), secret: result.data.totp.secret });
      setCode(""); setShowSecret(false);
    } catch { setError(mfaErrorMessage(undefined)); }
    finally { setBusy(false); }
  }
  async function confirmFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || !loaded) return;
    const normalized = verifyCodeInput();
    const target = enrollment?.id || factorId;
    if (!normalized || !target) return;
    setBusy(true); resetFeedback();
    try {
      const result = await sb.auth.mfa.challengeAndVerify({ factorId: target, code: normalized });
      if (result.error) { setError(mfaErrorMessage(result.error.code)); return; }
      // Secrets stay in this component's memory only, and are discarded before navigation.
      setCode(""); setEnrollment(null); setShowSecret(false);
      setFactors(current => current.map(item => item.id === target ? { ...item, status: "verified" } : item));
      setFactorId(target);
      // Verification upgrades the SDK session/cookies before this database call.
      // Only the live-session check can authorize administrative data.
      const authorized = await sb.rpc("admin_mfa_verified");
      if (authorized.error || authorized.data !== true) {
        setSessionVerified(false);
        setError("O código foi confirmado, mas não foi possível liberar a sessão administrativa. Confirme novamente ou saia e entre na conta.");
        return;
      }
      window.location.replace("/admin");
    } catch { setError(mfaErrorMessage(undefined)); }
    finally { setBusy(false); }
  }
  async function cancelIncomplete(id: string) {
    if (busy || loading || !loaded || verified.some(item => item.id === id)) return;
    setBusy(true); resetFeedback();
    try {
      const result = await sb.auth.mfa.unenroll({ factorId: id });
      if (result.error) { setError(mfaErrorMessage(result.error.code)); return; }
      if (enrollment?.id === id) { setEnrollment(null); setCode(""); setShowSecret(false); }
      setFactors(current => current.filter(item => item.id !== id));
      setMessage("Configuração incompleta cancelada. Você pode começar novamente.");
    } catch { setError(mfaErrorMessage(undefined)); }
    finally { setBusy(false); }
  }
  async function removeFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || !loaded || !removing || verified.length < 2 || keptFactorId === removing.id) return;
    const normalized = verifyCodeInput();
    if (!normalized || !verified.some(item => item.id === keptFactorId && item.id !== removing.id)) return;
    setBusy(true); resetFeedback();
    try {
      // Prove possession of the factor that will remain before removing another.
      const checked = await sb.auth.mfa.challengeAndVerify({ factorId: keptFactorId, code: normalized });
      if (checked.error) { setError(mfaErrorMessage(checked.error.code)); return; }
      const removed = await sb.auth.mfa.unenroll({ factorId: removing.id });
      if (removed.error) { setError(mfaErrorMessage(removed.error.code)); return; }
      setCode(""); setRemoving(null);
      window.location.replace("/seguranca-admin");
    } catch { setError(mfaErrorMessage(undefined)); }
    finally { setBusy(false); }
  }
  const codeField = (id: string) => <div className="auth-field"><label htmlFor={id}>Código do aplicativo autenticador</label><input id={id} name="totp-code" type="text" inputMode="numeric" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required disabled={busy} aria-describedby={id + "-hint"}/><small className="auth-field-hint" id={id + "-hint"}>Use o código de seis números mais recente. Ele não é enviado por e-mail.</small></div>;

  return <div className="admin-mfa-card" aria-busy={loading || busy}>
    {loading ? <p role="status" className="mfa-loading"><LoaderCircle size={20} aria-hidden="true"/>Consultando a proteção da sua conta…</p> : <>
      {!loaded ? <h2>Consulte seus autenticadores para continuar.</h2> : canManage ? <><span className="mfa-verified"><CheckCircle2 size={18} aria-hidden="true"/>Proteção em duas etapas ativa</span><h2>Seus autenticadores</h2><p className="mfa-copy">Confirme o autenticador ao entrar na administração com uma nova sessão. Cadastre um autenticador de reserva em outro dispositivo para recuperar o acesso se perder o principal.</p><Link href="/admin" className="premium-btn premium-btn-dark mfa-primary">Voltar à administração</Link></> : challenge ? <><span className="mfa-step">CONFIRME A SEGUNDA ETAPA</span><h2>Abra seu aplicativo autenticador.</h2><p className="mfa-copy">O acesso aos dados administrativos continua bloqueado até a confirmação do código.</p></> : <><span className="mfa-step">CONFIGURAÇÃO OBRIGATÓRIA</span><h2>Proteja o acesso administrativo.</h2><p className="mfa-copy">Use um aplicativo como Google Authenticator, Microsoft Authenticator ou um gerenciador de senhas compatível com TOTP. Esta configuração é feita uma vez no seu dispositivo.</p></>}
      {error && <div ref={errorRef} tabIndex={-1} className="mfa-error" role="alert">{error}</div>}
      {message && <p className="mfa-success" role="status">{message}</p>}
      {!loaded && <button type="button" className="premium-btn" disabled={busy} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={17}/>Carregar autenticadores novamente</button>}

      {loaded && (enrollment ? <section className="mfa-enrollment" aria-labelledby="mfa-enrollment-title"><h3 id="mfa-enrollment-title">Adicione “{name.trim()}” ao seu aplicativo.</h3><ol><li>Abra o autenticador e escolha adicionar uma conta por QR Code.</li><li>Leia este QR Code no seu próprio dispositivo.</li><li>Digite o código gerado para concluir a configuração.</li></ol><img src={enrollment.qr} width={240} height={240} alt="QR Code privado para configurar o autenticador da sua conta" className="mfa-qr"/><details className="mfa-manual"><summary>Não consigo ler o QR Code</summary><label htmlFor="mfa-manual-secret">Chave privada de configuração</label><div className="mfa-secret-field"><input id="mfa-manual-secret" type={showSecret ? "text" : "password"} readOnly value={enrollment.secret} autoComplete="off" spellCheck={false} onFocus={event => event.currentTarget.select()}/><button type="button" className="premium-btn" aria-pressed={showSecret} onClick={() => setShowSecret(value => !value)}>{showSecret ? "Ocultar chave" : "Mostrar chave"}</button></div><p>Digite esta chave no autenticador. Guarde-a com segurança e não a envie por mensagens.</p></details><form onSubmit={confirmFactor} className="mfa-form">{codeField("mfa-enroll-code")}<button type="submit" className="premium-btn premium-btn-dark mfa-primary" disabled={busy}>{busy ? "Confirmando…" : "Confirmar e entrar na administração"}</button></form><button type="button" className="mfa-text-button" disabled={busy} onClick={() => cancelIncomplete(enrollment.id)}>Cancelar esta configuração</button></section>
        : challenge ? <form onSubmit={confirmFactor} className="mfa-form"><div className="auth-field"><label htmlFor="mfa-existing-factor">Autenticador cadastrado</label><select id="mfa-existing-factor" value={factorId} onChange={event => { setFactorId(event.target.value); setCode(""); }} disabled={busy}>{verified.map(item => <option key={item.id} value={item.id}>{currentName(item)}</option>)}</select></div>{codeField("mfa-challenge-code")}<button type="submit" className="premium-btn premium-btn-dark mfa-primary" disabled={busy || !factorId}>{busy ? "Confirmando…" : "Confirmar e entrar"}</button></form>
          : <>
            {canManage && <ul className="mfa-factor-list">{verified.map(item => <li key={item.id}><ShieldCheck size={20} aria-hidden="true"/><span><strong>{currentName(item)}</strong><small>Autenticador confirmado</small></span>{verified.length > 1 && !removing && <button type="button" className="premium-btn" disabled={busy} aria-label={"Remover " + currentName(item)} onClick={() => { setRemoving(item); setKeptFactorId(verified.find(other => other.id !== item.id)!.id); setCode(""); resetFeedback(); }}><Trash2 size={16}/>Remover</button>}</li>)}</ul>}
            {removing ? <form onSubmit={removeFactor} className="mfa-form mfa-remove"><h3>Remover {currentName(removing)}?</h3><p>Confirme um código do autenticador que permanecerá cadastrado. Assim você mantém uma forma de entrar.</p><div className="auth-field"><label htmlFor="mfa-kept-factor">Autenticador que vai permanecer</label><select id="mfa-kept-factor" value={keptFactorId} onChange={event => { setKeptFactorId(event.target.value); setCode(""); }} disabled={busy}>{verified.filter(item => item.id !== removing.id).map(item => <option key={item.id} value={item.id}>{currentName(item)}</option>)}</select></div>{codeField("mfa-remove-code")}<div className="mfa-actions"><button type="button" className="premium-btn" disabled={busy} onClick={() => { setRemoving(null); setCode(""); resetFeedback(); }}>Manter autenticador</button><button type="submit" className="premium-btn danger" disabled={busy}>Confirmar remoção</button></div></form> : <form onSubmit={beginEnrollment} className="mfa-form"><div className="auth-field"><label htmlFor="mfa-factor-name">Nome para identificar o autenticador</label><input id="mfa-factor-name" type="text" autoComplete="off" maxLength={60} required value={name} onChange={event => setName(event.target.value)} disabled={busy}/><small className="auth-field-hint">Por exemplo: celular principal ou dispositivo de reserva.</small></div><button type="submit" className="premium-btn premium-btn-dark mfa-primary" disabled={busy}><Plus size={18}/>{busy ? "Preparando…" : canManage ? "Adicionar autenticador de reserva" : "Configurar meu autenticador"}</button></form>}
            {canManage && verified.length === 1 && <p className="mfa-note">Para substituir seu único autenticador, configure e confirme um de reserva antes. A proteção administrativa não pode ser desativada por esta tela.</p>}
          </>)}
      {loaded && !enrollment && incomplete.length > 0 && <details className="mfa-incomplete"><summary>Configurações não concluídas ({incomplete.length})</summary><p>Essas configurações ainda não protegem a conta. Cancele uma delas para começar novamente.</p>{incomplete.map(item => <div key={item.id}><span>{currentName(item)}</span><button type="button" className="premium-btn" disabled={busy} onClick={() => cancelIncomplete(item.id)}>Cancelar configuração</button></div>)}</details>}
      <aside className="mfa-recovery-note"><KeyRound size={19} aria-hidden="true"/><div><strong>Perdeu o autenticador?</strong><p>Use o dispositivo de reserva. Redefinir a senha não remove esta proteção. Se perder todos os autenticadores, a recuperação precisa ser feita pelo responsável do projeto no Supabase, após verificar a titularidade da conta.</p></div></aside>
    </>}
  </div>;
}
