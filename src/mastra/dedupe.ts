/**
 * Deduplicates entries by a trimmed, lowercased key: the first entry with a
 * key wins, later duplicates are dropped, and entries whose key trims to
 * nothing are dropped outright. The one home of that rule — topic labels,
 * concept mentions, and theme file names all dedupe the same way.
 */
export function dedupeByTrimmedLowerCaseKey<T>(entries: readonly T[], keyOf: (entry: T) => string): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const entry of entries) {
    const key = keyOf(entry).trim().toLowerCase();
    if (key === '' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}
