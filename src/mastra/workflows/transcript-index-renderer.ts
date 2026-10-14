import type { ClassifiedTopic, ValidatedTopicIndex, ValidatedPoint } from './ingestion-wf.schemas';
import { renderCitedPointBody } from './topic-file-renderer';

/**
 * Transcript-index renderer (spec: "Transcript index").
 *
 * The markdown of a multi-topic meeting's index is assembled here, in code,
 * from validated structured output and run data — no free-form model
 * markdown reaches the file. Sections render in fixed order — title,
 * executive summary, wikilinked topic index, recurring themes, numbered
 * decision log, action-item table, unresolved items, numbered topic
 * omissions — and every number (decision log, omissions) is assigned by
 * code. The topic index is built from the run's actual written files, so
 * every `[[wikilink]]` resolves. Like topic files, any section left empty
 * by validation is omitted entirely; the executive summary renders as the
 * opening paragraph and its absence leaves the topic index directly under
 * the title.
 */

/** One rendered document input: the validated index content, the file names
 * (stems) of the run's written topic files in write order, and the recorded
 * topic omissions with their transcript line ranges. */
export interface TopicIndexDocument {
  index: ValidatedTopicIndex;
  topicFileNames: string[];
  omittedTopics: ClassifiedTopic[];
}

/** Renders the full markdown document for one multi-topic meeting's
 * transcript index. */
export function renderTopicIndex({ index, topicFileNames, omittedTopics }: TopicIndexDocument): string {
  const sections = [
    `# ${index.title}`,
    index.executiveSummary === '' ? null : ['', index.executiveSummary].join('\n'),
    renderSection('Topic Index', topicFileNames.map((fileName) => `- [[${fileName}]]`)),
    renderSection('Recurring Themes', index.recurringThemes.map(renderRecurringTheme)),
    renderSection('Decision Log', index.decisions.map(renderDecision)),
    renderSection('Action Items', renderActionItemTable(index.actionItems)),
    renderSection('Unresolved Items', index.unresolvedItems.map(renderUnresolvedItem)),
    renderSection('Topic Omissions', renderOmissions(omittedTopics)),
  ];

  return `${sections.filter((section) => section !== null).join('\n')}\n`;
}

/** Renders one `##` section, or null when it has no lines — a section left
 * empty by validation never renders. */
function renderSection(heading: string, lines: string[]): string | null {
  if (lines.length === 0) {
    return null;
  }

  return ['', `## ${heading}`, '', ...lines].join('\n');
}

function renderRecurringTheme(theme: ValidatedTopicIndex['recurringThemes'][number]): string {
  const links = theme.topicFileNames.map((fileName) => `[[${fileName}]]`).join(', ');
  return `- ${theme.theme} (${links})`;
}

/** Numbers each decision record (GLOSSARY.md) by code; the supporting quote
 * follows the topic-file rendering — a verified quote is a quotation, an
 * unverified one renders bare. */
function renderDecision(point: ValidatedPoint, position: number): string {
  return `${position + 1}. ${renderCitedPointBody(point)}`;
}

const ACTION_ITEM_COLUMNS = ['Assigner', 'Assignee', 'Due', 'Deliverable'] as const;

function renderActionItemTable(items: ValidatedTopicIndex['actionItems']): string[] {
  // An empty table is a section left empty by validation — nothing renders,
  // not even the header row.
  if (items.length === 0) {
    return [];
  }

  const header = `| ${ACTION_ITEM_COLUMNS.join(' | ')} |`;
  const separator = `| ${ACTION_ITEM_COLUMNS.map(() => '---').join(' | ')} |`;
  const rows = items.map((item) =>
    `| ${[item.assigner, item.assignee, item.dueDate, item.deliverable].map(escapeTableCell).join(' | ')} |`,
  );
  return [header, separator, ...rows];
}

/** Keeps cell text from breaking the table: a literal pipe renders escaped. */
function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function renderUnresolvedItem(item: ValidatedTopicIndex['unresolvedItems'][number]): string {
  const references = item.lineReferences.map((line) => `L${line}`).join(', ');
  return `- ${item.statement} (${references})`;
}

/** Numbers each recorded topic omission by code; every transcript line range
 * renders as `Lstart-Lend`, comma-separated when a topic stretches over
 * several stretches of the meeting. */
function renderOmissions(omittedTopics: ClassifiedTopic[]): string[] {
  return omittedTopics.map((omittedTopic, position) => {
    const ranges = omittedTopic.lineRanges.map(({ startLine, endLine }) => `L${startLine}-L${endLine}`).join(', ');
    return `${position + 1}. ${omittedTopic.topic} (${ranges})`;
  });
}
