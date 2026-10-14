import type {
  ActionItem,
  TopicIndexContent,
  ValidatedTopicIndex,
  ValidatedUnresolvedItem,
} from './ingestion-wf.schemas';
import { INDEX_TITLE_FALLBACK } from './constants';
import { stripInlineReferences, validateCitedPoints, validateLineReferences } from './citation-validator';

/**
 * Citation and honesty discipline for the transcript index (spec: "Transcript
 * index"), as deterministic code — the index-side counterpart of
 * `validateCitedTopic`.
 *
 * The decision log is validated exactly like topic-file sections: inline
 * `(Lnn)` tokens are stripped from statements, references are kept only
 * in range, quotes are verified against the normalized transcript, and a
 * decision left with no surviving reference is dropped — an uncited claim
 * must not render. Recurring themes are kept only when the model backed them
 * with at least two of the run's real topic files (matched case-insensitively,
 * `.md` suffix tolerated); the survivors carry the run's canonical file names
 * so the renderer's wikilinks always resolve. Action items pass through with
 * every field trimmed, and a row whose ownership trims to nothing is dropped —
 * GLOSSARY.md defines an action item by all four of assigner, assignee, due
 * date, and deliverable.
 */

/** Validates the index agent's structured output for one multi-topic run. */
export function validateTopicIndexContent(
  content: TopicIndexContent,
  citationTarget: { lineCount: number; transcriptContent: string },
  topicFileNames: string[],
): ValidatedTopicIndex {
  return {
    title: content.title.trim() || INDEX_TITLE_FALLBACK,
    executiveSummary: stripInlineReferences(content.executiveSummary),
    recurringThemes: validateRecurringThemes(content.recurringThemes, topicFileNames),
    decisions: validateCitedPoints(content.decisions, citationTarget),
    actionItems: validateActionItems(content.actionItems),
    unresolvedItems: validateUnresolvedItems(content.unresolvedItems, citationTarget),
  };
}

/** Keeps themes backed by at least two distinct, real topic files; the
 * survivors carry the run's canonical names for wikilink rendering. */
function validateRecurringThemes(
  themes: TopicIndexContent['recurringThemes'],
  topicFileNames: string[],
): ValidatedTopicIndex['recurringThemes'] {
  const known = new Map(topicFileNames.map((name) => [name.toLowerCase(), name]));

  const validated: ValidatedTopicIndex['recurringThemes'] = [];
  for (const theme of themes) {
    const text = theme.theme.trim();
    if (text === '') {
      continue;
    }
    const resolvedFileNames = resolveThemeFiles(theme.topicFileNames, known);
    if (resolvedFileNames.length < 2) {
      continue;
    }
    validated.push({ theme: text, topicFileNames: resolvedFileNames });
  }
  return validated;
}

/** Matches the theme's file references against the run's real topic files —
 * case-insensitively, tolerating a `.md` suffix — and returns the canonical
 * names, deduplicated, in first-mentioned order. */
function resolveThemeFiles(referencedFileNames: string[], known: Map<string, string>): string[] {
  const resolved = new Set<string>();
  for (const referencedName of referencedFileNames) {
    const stem = referencedName.trim().replace(/\.md$/i, '');
    const canonical = known.get(stem.toLowerCase());
    if (canonical !== undefined) {
      resolved.add(canonical);
    }
  }
  return [...resolved];
}

function validateActionItems(items: ActionItem[]): ActionItem[] {
  const validated: ActionItem[] = [];
  for (const item of items) {
    const assigner = item.assigner.trim();
    const assignee = item.assignee.trim();
    const dueDate = item.dueDate.trim();
    const deliverable = item.deliverable.trim();
    if (assigner === '' || assignee === '' || dueDate === '' || deliverable === '') {
      continue;
    }
    validated.push({ assigner, assignee, dueDate, deliverable });
  }
  return validated;
}

function validateUnresolvedItems(
  items: TopicIndexContent['unresolvedItems'],
  citationTarget: { lineCount: number; transcriptContent: string },
): ValidatedUnresolvedItem[] {
  const validated: ValidatedUnresolvedItem[] = [];
  for (const item of items) {
    const statement = stripInlineReferences(item.statement);
    const lineReferences = validateLineReferences(item.lineReferences, citationTarget.lineCount);
    if (statement === '' || lineReferences.length === 0) {
      continue;
    }
    validated.push({ statement, lineReferences });
  }
  return validated;
}
