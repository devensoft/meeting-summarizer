import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { createStep, createWorkflow } from '@mastra/core/workflows';

const inputFileSchema = z.object({
  filePath: z.string().min(1).describe('Path to a plain-text transcript on the Mastra server.'),
});
const transcriptSchema = z.object({
  isValidTranscript: z.boolean(),
  transcriptContent: z.string(),
  meetingType: z.string(),
});
const topicResultSchema = z.object({
  transcriptContent: z.string(),
  topics: z.array(z.string()),
  singleTheme: z.string().nullable(),
});
const topicContextSchema = z.object({
  transcriptContent: z.string(),
  topic: z.string(),
});
const segmentSchema = z.object({
  topic: z.string(),
  content: z.string(),
});
const segmentFileSchema = z.object({
  topic: z.string(),
  filePath: z.string(),
  content: z.string(),
});
const consolidatedTopicSchema = topicContextSchema.extend({
  consolidatedContent: z.string(),
});
const extractedTopicSchema = consolidatedTopicSchema.extend({
  segments: z.array(segmentSchema),
});
const enrichedTopicSchema = extractedTopicSchema.extend({
  enrichedSegments: z.array(segmentSchema),
});

function resolveWithinDirectory(directory: string, relativePath: string) {
  const resolvedDirectory = path.resolve(directory);
  const resolvedPath = path.resolve(resolvedDirectory, relativePath);
  const relativeResolvedPath = path.relative(resolvedDirectory, resolvedPath);

  if (relativeResolvedPath === '' ||
    relativeResolvedPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeResolvedPath)) {
    throw new Error('Path must remain within the allowed directory.');
  }

  return resolvedPath;
}

const readTranscriptStep = createStep({
  id: 'read-transcript',
  description: 'Read and validate the uploaded transcript.',
  inputSchema: inputFileSchema,
  outputSchema: transcriptSchema,
  execute: async ({ inputData: { filePath } }) => {
    const resolvedFilePath = resolveWithinDirectory(process.cwd(), filePath);
    const file = new File([await readFile(resolvedFilePath)], path.basename(resolvedFilePath), {
      type: 'text/plain',
    });

    if (file.type !== 'text/plain') {
      throw new Error('Invalid file type. Only plain text files are supported.');
    }

    const transcriptContent = await file.text();

    return {
      isValidTranscript: transcriptContent.trim().length > 0,
      transcriptContent,
      meetingType: 'general',
    };
  },
});

const classifyTopicsStep = createStep({
  id: 'classify-topics',
  description: 'Identify unique topics and preserve the transcript for downstream processing.',
  inputSchema: transcriptSchema,
  outputSchema: topicResultSchema,
  execute: async ({ inputData: { transcriptContent, isValidTranscript, meetingType }, mastra }) => {
    if (!isValidTranscript) {
      throw new Error('Invalid transcript');
    }

    const response = await mastra.getAgent('zaiAgent').generate(
      `The provided text is a transcript of a ${meetingType} meeting. Identify each distinct topic, including topics discussed in multiple non-contiguous sections. Return each unique topic once as a concise label.\n\nTranscript:\n${transcriptContent}`,
      {
        structuredOutput: {
          schema: z.object({ topics: z.array(z.string()) }),
        },
      },
    );
    const topics = Array.from(new Set(response.object.topics));

    if (topics.length === 0) {
      throw new Error('Failed to extract topics from the transcript.');
    }

    return {
      transcriptContent,
      topics,
      singleTheme: topics.length === 1 ? topics[0] : null,
    };
  },
});

const consolidateTopicStep = createStep({
  id: 'consolidate-topic',
  description: 'Consolidate all transcript passages related to one topic.',
  inputSchema: topicContextSchema,
  outputSchema: consolidatedTopicSchema,
  execute: async ({ inputData, mastra }) => {
    const response = await mastra.getAgent('zaiAgent').generate(
      `Find and consolidate every passage related to the topic "${inputData.topic}". The passages may be scattered throughout the transcript. Preserve important details and chronology.\n\nTranscript:\n${inputData.transcriptContent}`,
      {
        structuredOutput: {
          schema: z.object({ consolidatedContent: z.string() }),
        },
      },
    );

    return { ...inputData, ...response.object };
  },
});

const extractSegmentsStep = createStep({
  id: 'extract-segments',
  description: 'Extract coherent segments from the consolidated topic material.',
  inputSchema: consolidatedTopicSchema,
  outputSchema: extractedTopicSchema,
  execute: async ({ inputData, mastra }) => {
    const response = await mastra.getAgent('zaiAgent').generate(
      `Extract the meaningful segments from this consolidated material. Return concise, non-overlapping segments with the topic label and supporting content.\n\nTopic: ${inputData.topic}\n\nMaterial:\n${inputData.consolidatedContent}`,
      {
        structuredOutput: {
          schema: z.object({ segments: z.array(segmentSchema) }),
        },
      },
    );

    return { ...inputData, ...response.object };
  },
});

const enrichSegmentsStep = createStep({
  id: 'enrich-segments',
  description: 'Enrich each extracted segment with its relevant context.',
  inputSchema: extractedTopicSchema,
  outputSchema: enrichedTopicSchema,
  execute: async ({ inputData, mastra }) => {
    const response = await mastra.getAgent('zaiAgent').generate(
      `Enrich these meeting segments without inventing facts. Preserve the topic and content while improving clarity and context.\n\nSegments:\n${JSON.stringify(inputData.segments)}`,
      {
        structuredOutput: {
          schema: z.object({ enrichedSegments: z.array(segmentSchema) }),
        },
      },
    );

    return { ...inputData, ...response.object };
  },
});

const distillTopicStep = createStep({
  id: 'distill-topic',
  description: 'Distill enriched segments into the file content for this topic.',
  inputSchema: enrichedTopicSchema,
  outputSchema: segmentFileSchema,
  execute: async ({ inputData, mastra }) => {
    const response = await mastra.getAgent('zaiAgent').generate(
      `Distill these enriched meeting segments into a clear Markdown document. Return a filesystem-safe short filename without an extension and the final Markdown content.\n\nTopic: ${inputData.topic}\n\nSegments:\n${JSON.stringify(inputData.enrichedSegments)}`,
      {
        structuredOutput: {
          schema: z.object({ fileName: z.string(), content: z.string() }),
        },
      },
    );
    const fileName = response.object.fileName.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'segment';

    return {
      topic: inputData.topic,
      filePath: path.join('src', 'mastra', 'public', 'segments', `${fileName}.md`),
      content: response.object.content,
    };
  },
});

const writeSegmentFileStep = createStep({
  id: 'write-segment-file',
  description: 'Write the distilled topic document to the public segments directory.',
  inputSchema: segmentFileSchema,
  outputSchema: segmentFileSchema,
  execute: async ({ inputData }) => {
    const outputDirectory = path.resolve(process.cwd(), 'src', 'mastra', 'public', 'segments');
    const outputFilePath = resolveWithinDirectory(outputDirectory, path.basename(inputData.filePath));
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(outputFilePath, inputData.content, 'utf8');
    return {
      ...inputData,
      filePath: path.relative(process.cwd(), outputFilePath),
    };
  },
});

const perTopicSubworkflow = createWorkflow({
  id: 'per-topic-subworkflow',
  inputSchema: topicContextSchema,
  outputSchema: segmentFileSchema,
})
  .then(consolidateTopicStep)
  .then(extractSegmentsStep)
  .then(enrichSegmentsStep)
  .then(distillTopicStep)
  .then(writeSegmentFileStep)
  .commit();

const singleTopicPath = createWorkflow({
  id: 'single-topic-path',
  inputSchema: topicResultSchema,
  outputSchema: z.array(segmentFileSchema),
})
  .map(async ({ inputData }) => ({
    transcriptContent: inputData.transcriptContent,
    topic: inputData.singleTheme!,
  }))
  .then(perTopicSubworkflow)
  .map(async ({ inputData }) => [inputData])
  .commit();

const multipleTopicsPath = createWorkflow({
  id: 'multiple-topics-path',
  inputSchema: topicResultSchema,
  outputSchema: z.array(segmentFileSchema),
})
  .map(async ({ inputData }) =>
    inputData.topics.map(topic => ({
      transcriptContent: inputData.transcriptContent,
      topic,
    })),
  )
  .foreach(perTopicSubworkflow, { concurrency: 4 })
  .commit();

const ingestionWorkflow = createWorkflow({
  id: 'ingestionWorkflow',
  inputSchema: inputFileSchema,
  outputSchema: z.array(segmentFileSchema),
})
  .then(readTranscriptStep)
  .then(classifyTopicsStep)
  .branch([
    [async ({ inputData }) => inputData.singleTheme !== null, singleTopicPath],
    [async ({ inputData }) => inputData.singleTheme === null, multipleTopicsPath],
  ])
  .commit();

export { ingestionWorkflow };
