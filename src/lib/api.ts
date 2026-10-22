export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readJson(request: Request, maxBytes = 8192): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new Error("Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Request body is empty.");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error("Request body is too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text) as unknown;
}

export function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

export function rateLimitResponse() {
  return jsonError("Too many requests. Please wait and try again.", 429);
}

