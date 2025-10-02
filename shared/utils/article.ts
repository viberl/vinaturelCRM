export function normalizeArticleNumber(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const asString = String(value).replace(/\uFEFF/g, '').trim();
  if (!asString) {
    return null;
  }

  const cleaned = asString
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return cleaned.length > 0 ? cleaned : null;
}
