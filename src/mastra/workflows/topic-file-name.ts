/**
 * Topic file names (GLOSSARY.md): every topic file is named by code, never
 * by the model. The name is the slug of the distilled title, and same-run
 * collisions — two topics distilled to the same title — are resolved with
 * ascending `-2`, `-3`, … suffixes so nothing already written this run is
 * overwritten.
 */

import { slugify } from '../slugify';

/** Fallback slug when a title contains nothing alphanumeric. */
const FALLBACK_SLUG = 'topic';

/** Topic file extension, kept here so the collision suffix always lands
 * before it. */
const FILE_EXTENSION = '.md';

/** Kebab-cases a distilled title into a file-name slug (see `slugify`),
 * falling back to `fallbackSlug` (default `topic`) when nothing usable
 * remains. The transcript index passes its own fallback so an untitled index
 * never collides with topic-file naming. */
export function slugifyTopicTitle(title: string, fallbackSlug: string = FALLBACK_SLUG): string {
  return slugify(title, fallbackSlug);
}

/** Returns the topic file name for `slug` — `slug.md`, or `slug-2.md`,
 * `slug-3.md`, … when earlier suffixes are already taken. Taken names are
 * compared case-insensitively, matching case-insensitive file systems. */
export function resolveTopicFileName(slug: string, takenFileNames: Iterable<string>): string {
  const taken = new Set([...takenFileNames].map((name) => name.toLowerCase()));
  let candidate = `${slug}${FILE_EXTENSION}`;
  let suffix = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${slug}-${suffix}${FILE_EXTENSION}`;
    suffix += 1;
  }
  return candidate;
}
