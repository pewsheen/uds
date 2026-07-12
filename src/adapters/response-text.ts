export const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;

export class PayloadTooLargeError extends Error {
  constructor(limit: number) {
    super(`Response exceeds ${limit} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

export async function readResponseTextLimited(
  response: Response,
  limit = MAX_CAPTURE_BYTES,
): Promise<string> {
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new TypeError("limit must be a positive integer");

  const declaredLength = response.headers.get("content-length");
  if (/^\d+$/.test(declaredLength ?? "") && Number(declaredLength) > limit)
    throw new PayloadTooLargeError(limit);

  if (!response.body) {
    const text = await response.text();
    if (!isTextWithinByteLimit(text, limit))
      throw new PayloadTooLargeError(limit);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => {});
        throw new PayloadTooLargeError(limit);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

export function isTextWithinByteLimit(text: string, limit: number): boolean {
  return new TextEncoder().encode(text).byteLength <= limit;
}
