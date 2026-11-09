export function getPublicPageUrl(slug: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || "https://nfc-smart-one.vercel.app";
  return configured.replace(/\/+$/, "") + "/p/" + encodeURIComponent(slug);
}
