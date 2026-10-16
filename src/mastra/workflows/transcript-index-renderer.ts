import type { ClassifiedTopic, MeetingMetadata, ValidatedTopicIndex, ValidatedPoint } from './ingestion-wf.schemas';
import { renderCitedPointBody } from './topic-file-renderer';

/**
 * Transcript-index renderer (spec: "Transcript index").
 *
 * The markdown of a multi-topic meeting's index is assembled here, in code,
 * from validated structured output and run data — no free-form model
 * markdown reaches the file. All eight section headers always render, in
 * fixed order — title, executive summary, wikilinked topic index, recurring
 * themes, numbered decision log, action-item table, unresolved items,
 * numbered topic omissions — and every number (decision log, omissions) is
 * assigned by code. The topic index is built from the run's actual written
 * files, so every `[[wikilink]]` resolves. A section with no validated
 * content shows an explicit `_None recorded._` marker under its header
 * instead of disappearing — the reader can tell an empty section from a
 * missing one.
 */

/** The absence marker under an empty section's header. */
const NOTHING_RECORDED = '_None recorded._';

/** One rendered document input: the validated index content, the file names
 * (stems) of the run's written topic files in write order, and the recorded
 * topic omissions with their transcript line ranges. */
export interface TopicIndexDocument {
  index: ValidatedTopicIndex;
  topicFileNames: string[];
  omittedTopics: ClassifiedTopic[];
  meetingMetadata?: MeetingMetadata;
}

/** The index title: a caller-supplied title wins over the model's. */
export function resolveIndexTitle(modelTitle: string, metadata: MeetingMetadata | undefined): string {
  return metadata?.title?.trim() || modelTitle;
}

/** Caller-supplied facts rendered under the title; empty when none apply, so
 * runs without metadata render unchanged. The title is already the heading. */
function renderMetadataLines(metadata: MeetingMetadata | undefined): string[] {
  if (!metadata) {
    return [];
  }

  const attendees = (metadata.attendees ?? []).map((name) => name.trim()).filter((name) => name.length > 0);
  const lines = [
    metadata.date && `- **Date:** ${metadata.date}`,
    metadata.time && `- **Time:** ${metadata.time}`,
    attendees.length > 0 && `- **Attendees:** ${attendees.join(', ')}`,
    metadata.description?.trim() && `- **Description:** ${metadata.description.trim()}`,
  ].filter((line): line is string => typeof line === 'string');

  return lines.length === 0 ? [] : ['', ...lines];
}

/** Renders the full markdown document for one multi-topic meeting's
 * transcript index. */
export function renderTopicIndex({ index, topicFileNames, omittedTopics, meetingMetadata }: TopicIndexDocument): string {
  const sections = [
    `# ${resolveIndexTitle(index.title, meetingMetadata)}`,
    ...renderMetadataLines(meetingMetadata),
    renderSection('Executive Summary', index.executiveSummary === '' ? [] : [index.executiveSummary]),
    renderSection('Topic Index', topicFileNames.map((fileName) => `- [[${fileName}]]`)),
    renderSection('Recurring Themes', index.recurringThemes.map(renderRecurringTheme)),
    renderSection('Decision Log', index.decisions.map(renderDecision)),
    renderSection('Action Items', renderActionItemTable(index.actionItems)),
    renderSection('Unresolved Items', index.unresolvedItems.map(renderUnresolvedItem)),
    renderSection('Topic Omissions', renderOmissions(omittedTopics)),
  ];

  return `${sections.join('\n')}\n`;
}

/** Renders one `##` section of the fixed document skeleton. Every section
 * renders — the document's contract is all eight headers, in order — and a
 * section with no lines shows the absence marker under its header instead
 * of disappearing. */
function renderSection(heading: string, lines: string[]): string {
  if (lines.length === 0) {
    return ['', `## ${heading}`, '', NOTHING_RECORDED].join('\n');
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
  // An empty table contributes no rows; its section header still renders,
  // carrying the absence marker.
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
