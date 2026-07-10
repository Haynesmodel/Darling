const CURLY_PUNCTUATION = /[\u2018\u2019\u201A\u201B]/g;
const CURLY_QUOTES = /[\u201C\u201D\u201E\u201F]/g;

export function normalizeSearchText(value: unknown): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(CURLY_PUNCTUATION, "'")
    .replace(CURLY_QUOTES, '"')
    .toLowerCase()
    .replace(/[^a-z0-9'.+\-\s]/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSearchText(value: unknown): string[] {
  return normalizeSearchText(value).split(' ').filter(Boolean);
}

export function orderedSubsequence(query: string, target: string): boolean {
  let cursor = 0;
  for (const char of target) {
    if (char === query[cursor]) cursor += 1;
    if (cursor === query.length) return true;
  }
  return query.length === 0;
}
