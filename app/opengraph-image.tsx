import { ImageResponse } from "next/og";

export const alt = "NFC SMART — Sua empresa, em um toque. Página digital, NFC e QR Code.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#f5f5f0", color: "#172c20", display: "flex", padding: "64px 76px", alignItems: "center", justifyContent: "space-between", fontFamily: "sans-serif" }}>
    <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
      <div style={{ display: "flex", fontSize: 27, fontWeight: 700, letterSpacing: -1, marginBottom: 52 }}>NFC SMART</div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -4 }}><div style={{ display: "flex" }}>Sua empresa,</div><div style={{ display: "flex" }}>em um toque.</div></div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 26, marginTop: 32, color: "#536451", lineHeight: 1.5 }}><div style={{ display: "flex" }}>Contatos, catálogo, localização e PIX.</div><div style={{ display: "flex" }}>Uma página. Muitas conexões.</div></div>
    </div>
    <div style={{ width: 260, height: 330, borderRadius: 34, background: "#172c20", color: "white", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: "rotate(5deg)", boxShadow: "0 24px 60px #172c2029" }}>
      <div style={{ display: "flex", fontSize: 92, fontWeight: 700, marginBottom: 20 }}>N</div>
      <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>NFC SMART</div>
      <div style={{ display: "flex", fontSize: 16, color: "#d3e3cb", marginTop: 14 }}>APROXIME E CONECTE</div>
    </div>
  </div>, size);
}
