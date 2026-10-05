import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata={title:"NFC Smart",description:"Plataforma inteligente para páginas NFC e QR Code"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}