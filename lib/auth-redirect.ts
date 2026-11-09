/** Accept only local destinations, including when a caller supplies encoded input. */
export function safeAuthPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  let decoded = value;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return fallback;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return fallback;
    }
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return fallback;
  return value;
}
