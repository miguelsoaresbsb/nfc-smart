import { Buffer } from "node:buffer";
import QRCode from "qrcode";

export type PrintKitInput = { companyName: string; publicUrl: string };

export const PRINT_KIT_LAYOUT = {
  width: 595.28,
  height: 841.89,
  qrLeft: 157.64,
  qrBottom: 270,
  qrSize: 280,
  quietModules: 4,
} as const;

const winAnsi = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

// Standard Helvetica metrics in 1/1000 em, used to wrap actual printed text.
const regularWidths = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const boldWidths = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function cleanText(value: string, limit: number): string {
  return value.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function ansiBytes(value: string): Buffer {
  return Buffer.from(Array.from(value, character => {
    const code = character.codePointAt(0)!;
    return (code >= 32 && code <= 126) || (code >= 160 && code <= 255) ? code : winAnsi.get(code) ?? 63;
  }));
}

function measure(value: string, size: number, font: "F1" | "F2" | "F3"): number {
  if (font === "F3") return ansiBytes(value).length * size * 0.6;
  const widths = font === "F2" ? boldWidths : regularWidths;
  return Array.from(value).reduce((total, character) => {
    const base = character.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const code = base.codePointAt(0) || 63;
    return total + (widths[code - 32] ?? 1000) * size / 1000;
  }, 0);
}

function wrapText(value: string, size: number, width: number, font: "F1" | "F2" | "F3"): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(" ")) {
    if (line && measure(line + " " + word, size, font) <= width) { line += " " + word; continue; }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (line && measure(line + character, size, font) > width) { lines.push(line); line = ""; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const number = (value: number) => Number(value.toFixed(4)).toString();

/** A single-page vector PDF. No remote assets, PDF scripts or arbitrary URLs. */
export function createPrintKitPdf(input: PrintKitInput): Uint8Array {
  const companyName = cleanText(input.companyName, 160);
  if (!companyName) throw new Error("A empresa precisa ter um nome para gerar o material.");
  if (typeof input.publicUrl !== "string" || input.publicUrl.length > 512) throw new Error("O endereço da página é inválido.");
  const url = new URL(input.publicUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error("O endereço da página é inválido.");
  const publicUrl = url.href;
  const qr = QRCode.create(publicUrl, { errorCorrectionLevel: "H" });
  const layout = PRINT_KIT_LAYOUT;
  const commands: string[] = [];
  const text = (value: string, x: number, y: number, size: number, font: "F1" | "F2" | "F3" = "F1", color = "0.09 0.17 0.12") => {
    commands.push(`BT /${font} ${number(size)} Tf ${color} rg 1 0 0 1 ${number(x)} ${number(y)} Tm <${ansiBytes(value).toString("hex")}> Tj ET`);
  };
  const centered = (value: string, y: number, size: number, font: "F1" | "F2" | "F3" = "F1", color?: string) => text(value, (layout.width - measure(value, size, font)) / 2, y, size, font, color);
  const rectangle = (x: number, y: number, width: number, height: number, color: string) => commands.push(`${color} rg ${number(x)} ${number(y)} ${number(width)} ${number(height)} re f`);

  rectangle(0, 0, layout.width, layout.height, "1 1 1");
  commands.push("0.82 0.87 0.81 RG 0.8 w 37 37 521.28 767.89 re S");
  text("NFC SMART", 59, 775, 13, "F2");
  text("MATERIAL PARA O SEU NEGÓCIO", 59, 751, 9, "F1", "0.36 0.43 0.33");
  commands.push("0.82 0.87 0.81 RG 59 733 m 536.28 733 l S");

  let nameSize = 30;
  let nameLines = wrapText(companyName, nameSize, 470, "F2");
  for (const candidate of [30, 28, 26, 24, 22, 20, 18, 16]) {
    const lines = wrapText(companyName, candidate, 470, "F2");
    if (lines.length * candidate * 1.2 <= 118) { nameSize = candidate; nameLines = lines; break; }
  }
  nameLines.forEach((line, index) => centered(line, 690 - index * nameSize * 1.2, nameSize, "F2"));
  centered("CONTATOS E SERVIÇOS EM UMA SÓ PÁGINA", 570, 10, "F2", "0.36 0.43 0.33");

  // Four empty modules surround the symbol. Adjacent dark runs remain vectors.
  rectangle(layout.qrLeft, layout.qrBottom, layout.qrSize, layout.qrSize, "1 1 1");
  commands.push("% QR-BEGIN", "0 g");
  const scale = layout.qrSize / (qr.modules.size + layout.quietModules * 2);
  for (let row = 0; row < qr.modules.size; row++) {
    for (let column = 0; column < qr.modules.size;) {
      if (!qr.modules.get(row, column)) { column++; continue; }
      const start = column;
      while (column < qr.modules.size && qr.modules.get(row, column)) column++;
      const x = layout.qrLeft + (start + layout.quietModules) * scale;
      const y = layout.qrBottom + (qr.modules.size - row - 1 + layout.quietModules) * scale;
      commands.push(`${number(x)} ${number(y)} ${number((column - start) * scale)} ${number(scale)} re f`);
    }
  }
  commands.push("% QR-END");
  centered("Aproxime o celular da plaquinha NFC", 243, 16, "F2");
  centered("ou escaneie o QR Code com a câmera.", 220, 15);
  centered("NFC requer aparelho compatível. A página precisa de internet.", 196, 10, "F1", "0.36 0.43 0.33");

  const urlLines = wrapText(publicUrl, 9, 460, "F3");
  const visibleUrlLines = urlLines.slice(0, 5);
  if (urlLines.length > visibleUrlLines.length) visibleUrlLines[4] = visibleUrlLines[4].slice(0, -3) + "...";
  centered("VOCÊ TAMBÉM PODE ABRIR PELO LINK", 162, 9, "F2", "0.36 0.43 0.33");
  visibleUrlLines.forEach((line, index) => centered(line, 143 - index * 12, 9, "F3"));
  commands.push("0.82 0.87 0.81 RG 59 70 m 536.28 70 l S");
  centered("IMPRESSÃO A4 · TAMANHO REAL (100%) · QR CODE DA PÁGINA", 52, 8, "F1", "0.36 0.43 0.33");

  const content = commands.join("\n") + "\n";
  const titleUtf16 = Buffer.from("Material NFC SMART - " + companyName, "utf16le");
  titleUtf16.swap16();
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${layout.width} ${layout.height}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
    `<< /Title <feff${titleUtf16.toString("hex")}> /Creator (NFC SMART) /Producer (NFC SMART) >>`,
  ];
  const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "ascii");
    chunks.push(chunk); length += chunk.length;
  });
  const xrefOffset = length;
  const xref = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f ", ...offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n `), "trailer", `<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>`, "startxref", String(xrefOffset), "%%EOF", ""].join("\n");
  chunks.push(Buffer.from(xref, "ascii"));
  return new Uint8Array(Buffer.concat(chunks));
}

export function printKitFilename(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "empresa";
  return `nfc-smart-material-${safe}.pdf`;
}
