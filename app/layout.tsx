import "./globals.css";
import "./experience.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://nfc-smart-one.vercel.app"),
  title: { default: "NFC SMART | Sua empresa, em um toque", template: "%s | NFC SMART" },
  description: "Reúna WhatsApp, catálogo, localização, avaliações e PIX em uma página da sua empresa. Abra por NFC, QR Code ou link e atualize pelo painel.",
  applicationName: "NFC SMART",
  formatDetection: { telephone: false },
  openGraph: { locale: "pt_BR", type: "website", siteName: "NFC SMART" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f5f2" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
