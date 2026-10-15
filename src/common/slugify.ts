/**
 * Shared string helpers for file and directory naming.
 */

/** Kebab-cases a value into a file-name slug: lowercase, runs of
 * non-alphanumeric characters collapsed to one dash, no leading or trailing
 * dash. Pass a `fallback` to substitute it when nothing usable remains;
 * without one, an empty string is returned so callers can decide. */
export function slugify(value: string, fallback?: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug !== '' || fallback === undefined) {
    return slug;
  }
  return fallback;
}
