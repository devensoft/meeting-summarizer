import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { branchRunSchema, runOutputEntrySchema, topicIndexContentSchema, type RunOutputEntry } from './ingestion-wf.schemas';
import { loadPrompt, renderTemplate } from '../prompts';
import { resolveProjectRoot, resolveWithinDirectory } from '../paths';
import { resolveModelSelection } from '../models/model-selection';
import { INDEX_FILE_FALLBACK_SLUG } from './constants';
import { meetingModeGuidance } from './meeting-mode';
import { renderTopicIndex } from './transcript-index-renderer';
import { validateTopicIndexContent } from './transcript-index-validator';
import { resolveTopicFileName, slugifyTopicTitle } from './topic-file-name';

const writeIndexPrompt = loadPrompt(import.meta.url, 'ingestion-wf.09-write-index-step.prompt.md');

export const writeIndexStep = createStep({
  id: 'write-index',
  description:
    "Write the transcript index beside a multi-topic run's topic files: one structured agent call reads the topic files, the omissions, and the transcript, and code assembles the markdown, assigns every number, and names the file.",
  inputSchema: branchRunSchema,
  outputSchema: runOutputEntrySchema.array(),
  execute: async ({ mastra, requestContext, inputData }) => {
    const { files, transcriptContent, omittedTopics, singleTopic, meetingDirectoryName, lineCount, format, mode } = inputData;

    // Single-topic runs — natural or collapsed — produce no index (spec: out
    // of scope), and their recorded omissions stay data, never rendered. The
    // file-count guard is defensive: a multi-topic classification always
    // carries at least two topics.
    if (singleTopic !== null || files.length === 0) {
      return files;
    }

    const workspace = mastra.getWorkspace()?.filesystem;
    if (!workspace) {
      throw new Error('Mastra workspace is not configured.');
    }

    // The written topic files are the source of truth: they are read back
    // from disk, not reconstructed from memory, and each entry's path is
    // kept inside the project root.
    const projectRoot = resolveProjectRoot(process.cwd());
    const topicFiles: Array<{ fileName: string; content: string }> = [];
    for (const file of files) {
      const content = await readFile(resolveWithinDirectory(projectRoot, file.filePath), 'utf8');
      topicFiles.push({ fileName: path.basename(file.filePath, path.extname(file.filePath)), content });
    }
    const topicFileNames = topicFiles.map((topicFile) => topicFile.fileName);

    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(writeIndexPrompt(), {
        format,
        modeGuidance: meetingModeGuidance(mode),
        topicFiles: JSON.stringify(topicFiles),
        omittedTopics: JSON.stringify(omittedTopics),
        transcriptContent,
      }),
      {
        ...resolveModelSelection(requestContext).profile.callOptions({
          schema: topicIndexContentSchema,
          shapeExample:
            '{"title":"Q3 product sync: decisions and follow-ups","executiveSummary":"One paragraph a participant who missed the meeting can catch up from.","recurringThemes":[{"theme":"Rollout timing","topicFileNames":["launch-plan","budget-review"]}],"decisions":[{"statement":"Ship Friday","lineReferences":[1],"quote":null}],"actionItems":[{"assigner":"Dana","assignee":"Ari","dueDate":"2026-03-01","deliverable":"Draft rollout plan"}],"unresolvedItems":[{"statement":"Does the budget cover hiring?","lineReferences":[2]}]}',
          intent: 'high',
        }),
        requestContext,
      },
    );

    const validatedIndex = validateTopicIndexContent(response.object, { lineCount, transcriptContent }, topicFileNames);
    const markdown = renderTopicIndex({ index: validatedIndex, topicFileNames, omittedTopics });

    const meetingDirectory = path.join('meetings', meetingDirectoryName);
    // The file name comes from code, never the model: the slug of the
    // validated title, suffixed when a same-run file already holds it.
    const takenFileNames = (await workspace.readdir(meetingDirectory)).map((entry) => entry.name);
    const fileName = resolveTopicFileName(slugifyTopicTitle(validatedIndex.title, INDEX_FILE_FALLBACK_SLUG), takenFileNames);
    const outputFilePath = path.join(meetingDirectory, fileName);

    await workspace.writeFile(outputFilePath, markdown);
    const { size } = await workspace.stat(outputFilePath);

    const indexEntry: RunOutputEntry = {
      kind: 'index',
      topic: validatedIndex.title,
      filePath: path.join('.workspace', outputFilePath),
      fileSize: size,
      isSegment: false,
    };
    return [...files, indexEntry];
  },
});
