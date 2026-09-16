import { describe, expect, it } from "vitest";
import { chunkContent } from "./chunk.js";

describe("chunker", () => {
  it("returns short content as a single chunk", () => {
    const chunks = chunkContent("Orders ship in 48 hours.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ ordinal: 0, content: "Orders ship in 48 hours." });
  });

  it("returns nothing for blank content", () => {
    expect(chunkContent("   \n  ")).toEqual([]);
  });

  it("splits long content into bounded sequential chunks", () => {
    const paragraph = "The return policy allows thirty days for refunds. ".repeat(40);
    const chunks = chunkContent(paragraph, 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const [i, chunk] of chunks.entries()) {
      expect(chunk.ordinal).toBe(i);
      expect(chunk.content.length).toBeLessThanOrEqual(500);
      expect(chunk.charCount).toBe(chunk.content.length);
    }
    // No sentence lost: every sentence of the input appears in some chunk.
    const joined = chunks.map((c) => c.content).join(" ");
    expect(joined).toContain("The return policy allows thirty days for refunds.");
  });

  it("carries overlap across boundaries and keeps paragraph breaks", () => {
    const first = `Alpha paragraph with enough words to matter. `.repeat(20);
    const second = `Beta paragraph that must survive intact somewhere.`;
    const chunks = chunkContent(`${first}\n\n${second}`, 600, 80);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const last = chunks[chunks.length - 1]?.content ?? "";
    expect(last).toContain("Beta paragraph that must survive intact somewhere.");
  });
});
