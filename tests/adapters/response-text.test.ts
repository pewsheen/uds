import { describe, expect, it } from "vitest";
import {
  PayloadTooLargeError,
  isTextWithinByteLimit,
  readResponseTextLimited,
} from "../../src/adapters/response-text";

describe("bounded response text", () => {
  it("reads a response within the byte limit", async () => {
    await expect(
      readResponseTextLimited(new Response("caption"), 7),
    ).resolves.toBe("caption");
  });

  it("rejects an oversized declared content length before reading", async () => {
    const response = new Response("ok", {
      headers: { "content-length": "100" },
    });
    await expect(readResponseTextLimited(response, 10)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it("rejects a streamed body once its actual bytes exceed the limit", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5, 6]));
          controller.close();
        },
      }),
    );
    await expect(readResponseTextLimited(response, 5)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it("counts UTF-8 bytes rather than UTF-16 code units", () => {
    expect(isTextWithinByteLimit("字幕", 6)).toBe(true);
    expect(isTextWithinByteLimit("字幕", 5)).toBe(false);
  });

  it("rejects invalid limits", async () => {
    await expect(
      readResponseTextLimited(new Response("caption"), 0),
    ).rejects.toThrow(/positive integer/);
  });
});
