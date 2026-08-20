const named: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes one entity, or leaves it alone if it is not one we know. */
function decode(entity: string, code: string): string {
  if (code.startsWith('#')) {
    const point = code.startsWith('#x')
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);

    // fromCodePoint throws on anything outside the unicode range
    if (Number.isInteger(point) && point >= 0 && point <= 0x10ffff) {
      return String.fromCodePoint(point);
    }

    return entity;
  }

  return named[code.toLowerCase()] ?? entity;
}

/**
 * The readable text of stored note HTML, for searching.
 *
 * Notes are saved as HTML, so searching the markup itself matches tag names -
 * "strong" would find every bolded note. This is what the note says instead.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decode)
    .replace(/\s+/g, ' ')
    .trim();
}
