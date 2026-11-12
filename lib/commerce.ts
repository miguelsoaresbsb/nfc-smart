// Display prices mirror the existing commercial terms. Payment validation stays
// in the authenticated Cakto receiver; these values never grant access.
export const MONTHLY_PRICE_CENTS = 2990;
export const NFC_TAG_PRICE_CENTS = 4990;
export const CHECKOUT_URL = process.env.NEXT_PUBLIC_CAKTO_CHECKOUT_URL || "https://pay.cakto.com.br/396w5rm_1175861";

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatBRL(cents: number): string {
  return reais.format(cents / 100);
}
