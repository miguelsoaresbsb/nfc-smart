"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, QrCode, Wifi, ShieldCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

export default function QRs() {
  const sb = createClient();
  const [companyId, setCompanyId] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function load(cid: string) {
    const { data } = await sb.from("qr_codes")
      .select("id,name,image_url,storage_path,description,position,enabled")
      .eq("company_id", cid)
      .order("position");
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const { data: member } = await sb.from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!member) {
        window.location.href = "/acesso-pendente";
        return;
      }
      setCompanyId(member.company_id);
      load(member.company_id);
    })();
  }, []);

  async function uploadQr(file: File) {
    if (!companyId) return;
    setMessage("");
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setMessage("Envie um QR Code em PNG, JPG, JPEG ou WEBP.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setMessage("O arquivo deve ter no máximo 6 MB.");
      return;
    }

    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = companyId + "/qr-codes/" + crypto.randomUUID() + "-" + safeName;
    const up = await sb.storage.from("company-assets").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

    if (up.error) {
      setMessage(up.error.message);
      setUploading(false);
      return;
    }

    const imageUrl = sb.storage.from("company-assets").getPublicUrl(path).data.publicUrl;
    const { error } = await sb.from("qr_codes").insert({
      company_id: companyId,
      name: file.name.replace(/\.[^.]+$/, ""),
      image_url: imageUrl,
      storage_path: path,
      position: items.length,
      enabled: true,
    });

    if (error) {
      await sb.storage.from("company-assets").remove([path]);
      setMessage(error.message);
      setUploading(false);
      return;
    }

    setMessage("QR Code enviado. Agora ele aparece nas Ações para você escolher.");
    setUploading(false);
    load(companyId);
  }

  async function removeQr(item: any) {
    if (!confirm("Excluir este QR Code?")) return;
    const { error } = await sb.from("qr_codes").delete().eq("id", item.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (item.storage_path) {
      await sb.storage.from("company-assets").remove([item.storage_path]);
    }
    setMessage("QR Code excluído.");
    load(companyId);
  }

  return (
    <main className="premium-shell qr-page">
      <header className="premium-nav">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark"><Wifi size={17}/></span>
          <span>NFC<span>SMART</span></span>
        </Link>
        <Link href="/dashboard/actions" className="premium-btn"><ArrowLeft size={15}/> Ações</Link>
      </header>

      <section className="subpage">
        <div className="section-kicker"><span className="live-dot"/> QR CODES</div>
        <div className="hub-title">
          <div>
            <h1>Seus QR Codes. <span>Suas imagens.</span></h1>
            <p>Envie os QR Codes que sua empresa já possui. O NFC SMART armazena e exibe o arquivo exatamente como você enviou.</p>
          </div>
        </div>

        <div className="upload-showcase">
          <div className="upload-art">
            <div className="upload-icon"><ImagePlus size={28}/></div>
            <div className="qr-floating"><QrCode size={34}/></div>
          </div>
          <h2>Central de QR Codes</h2>
          <p>PNG, JPG, JPEG ou WEBP · até 6 MB</p>
          <label className="premium-btn" style={{cursor:"pointer"}}>
            <ImagePlus size={15}/> {uploading ? "Enviando..." : "Enviar QR Code"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              disabled={uploading}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) uploadQr(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <div className="info-row"><ShieldCheck size={15}/> Não geramos, decodificamos ou modificamos o conteúdo do QR.</div>
          {message && <div className="notice">{message}</div>}
        </div>

        {!loading && items.length > 0 && (
          <div className="qr-list">
            {items.map(item => (
              <div className="qr-item" key={item.id}>
                <img src={item.image_url} alt={item.name} />
                <div>
                  <strong>{item.name}</strong>
                  <small>Disponível em Ações → PIX → QR Code</small>
                </div>
                <button className="premium-btn danger" onClick={() => removeQr(item)}>
                  <Trash2 size={15}/> Excluir
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="empty">Você ainda não enviou nenhum QR Code.</div>
        )}

        <div className="qr-next">
          <p><strong>Depois de enviar:</strong> vá em <b>Ações</b>, escolha <b>PIX</b> e selecione o QR Code no campo “Sem QR Code”.</p>
          <Link href="/dashboard/actions" className="premium-btn">Ir para Ações <ArrowRight size={15}/></Link>
        </div>
      </section>
    </main>
  );
}
