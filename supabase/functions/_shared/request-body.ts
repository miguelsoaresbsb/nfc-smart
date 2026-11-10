/** Read at most the webhook limit, even when the sender omits Content-Length. */
export async function readLimitedBody(request: Request, maxBytes: number): Promise<{ body: string; error?: never; status?: never } | { body?: never; error: string; status: number }> {
  if (Number(request.headers.get("content-length")) > maxBytes) {
    await request.body?.cancel().catch(() => {});
    return { error: "payload_too_large", status: 413 };
  }
  const reader = request.body?.getReader();
  if (!reader) return { body: "" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { error: "payload_too_large", status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { body: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch { return { error: "invalid_body", status: 400 }; }
  finally { reader.releaseLock(); }
}
