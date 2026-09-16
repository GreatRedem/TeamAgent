/**
 * Deterministic synchronous chunker. Ingestion chunks inline so the stored
 * chunks are exactly what retrieval can return — no background pipeline to
 * lag behind the access check, and no re-chunking drift between what was
 * reviewed and what a run reads.
 */

export interface TextChunk {
  ordinal: number;
  content: string;
  charCount: number;
}

export const CHUNK_MAX_CHARS = 1000;
export const CHUNK_OVERLAP_CHARS = 100;

function splitSentences(paragraph: string): string[] {
  const parts = paragraph.match(/[^.!?]+[.!?]+["'”’)]?|\S[^.!?]*$/g);
  if (parts === null) return [paragraph];
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

function hardSplit(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    out.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

/**
 * Pack paragraphs, then sentences, then hard slices into chunks of at most
 * maxChars. Each chunk after the first carries the tail of the previous one
 * so a boundary never severs a fact from its context.
 */
export function chunkContent(
  content: string,
  maxChars: number = CHUNK_MAX_CHARS,
  overlapChars: number = CHUNK_OVERLAP_CHARS,
): TextChunk[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= maxChars) {
    return [{ ordinal: 0, content: normalized, charCount: normalized.length }];
  }

  const units: string[] = [];
  for (const paragraph of normalized.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length <= maxChars) {
      units.push(trimmed);
      continue;
    }
    for (const sentence of splitSentences(trimmed)) {
      if (sentence.length <= maxChars) units.push(sentence);
      else units.push(...hardSplit(sentence, maxChars));
    }
  }

  const chunks: TextChunk[] = [];
  let current = "";
  const flush = (): void => {
    if (current.length === 0) return;
    chunks.push({ ordinal: chunks.length, content: current, charCount: current.length });
  };
  for (const unit of units) {
    const candidate = current.length === 0 ? unit : `${current}\n\n${unit}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      flush();
      const tail = current.slice(Math.max(0, current.length - overlapChars));
      const overlap = tail.length > 0 ? `${tail}\n\n` : "";
      current = `${overlap}${unit}`;
      if (current.length > maxChars) {
        // Overlong unit plus overlap: emit the unit alone rather than
        // looping forever; the overlap is best-effort, not a guarantee.
        current = unit;
      }
    }
  }
  flush();
  return chunks.map((chunk, ordinal) => ({ ...chunk, ordinal }));
}
