import { describe, expect, it } from 'bun:test';
import { appendMeetingMetadata, renderMeetingContextCard, renderMeetingMetadataBlock } from './meeting-context';
import { consolidatedTopicSchema, enrichedTopicSchema, extractedTopicSchema, topicContextSchema, topicRunContextSchema } from './workflows/ingestion-wf.schemas';

const metadata = { date: '2026-03-01', time: '09:30', attendees: ['Dana', 'Ari'], title: 'Q3 sync', description: 'Quarterly planning' };

const context = {
  transcriptContent: '1 | hi',
  topic: 'T',
  isSegment: false,
  durationSeconds: null,
  lineCount: 1,
  meetingDirectoryName: 'm',
  format: 'planning',
  mode: 'status',
  meetingContext: null,
};

describe('renderMeetingMetadataBlock', () => {
  it('renders every supplied field as caller-provided context', () => {
    const block = renderMeetingMetadataBlock(metadata);
    expect(block).toContain('supplied by the caller');
    expect(block).toContain('- Title: Q3 sync');
    expect(block).toContain('- Date: 2026-03-01');
    expect(block).toContain('- Time: 09:30');
    expect(block).toContain('- Attendees: Dana, Ari');
    expect(block).toContain('- Description: Quarterly planning');
    expect(block).toContain('Never invent speakers, decisions');
  });

  it('omits absent fields', () => {
    const block = renderMeetingMetadataBlock({ title: 'Only title' });
    expect(block).toContain('- Title: Only title');
    expect(block).not.toContain('Date:');
    expect(block).not.toContain('Attendees:');
  });

  it('is empty when nothing usable is supplied', () => {
    expect(renderMeetingMetadataBlock(undefined)).toBe('');
    expect(renderMeetingMetadataBlock({})).toBe('');
    expect(renderMeetingMetadataBlock({ attendees: [] })).toBe('');
  });
});

describe('appendMeetingMetadata', () => {
  it('returns the context block byte-for-byte when metadata is absent', () => {
    const card = renderMeetingContextCard({ meetingContext: 'Weekly sync' });
    expect(appendMeetingMetadata(card, undefined)).toBe(card);
    expect(appendMeetingMetadata(card, {})).toBe(card);
    expect(appendMeetingMetadata('', undefined)).toBe('');
  });

  it('appends the block after the context card, or stands alone without one', () => {
    const card = renderMeetingContextCard({ meetingContext: 'Weekly sync' });
    expect(appendMeetingMetadata(card, metadata)).toBe(`${card}${renderMeetingMetadataBlock(metadata)}`);
    expect(appendMeetingMetadata('', metadata)).toBe(renderMeetingMetadataBlock(metadata));
  });
});

describe('meetingMetadata propagation through per-topic schemas', () => {
  it('survives topicContextSchema and the schemas extending it', () => {
    expect(topicContextSchema.parse({ ...context, meetingMetadata: metadata }).meetingMetadata).toEqual(metadata);
    expect(topicRunContextSchema.parse({ ...context, meetingMetadata: metadata }).meetingMetadata).toEqual(metadata);
    const consolidated = consolidatedTopicSchema.parse({ ...context, meetingMetadata: metadata, consolidatedContent: 'c' });
    expect(consolidated.meetingMetadata).toEqual(metadata);
    const extracted = extractedTopicSchema.parse({ ...consolidated, segments: [] });
    expect(enrichedTopicSchema.parse({ ...extracted, enrichedSegments: [] }).meetingMetadata).toEqual(metadata);
  });

  it('stays absent when not supplied', () => {
    expect('meetingMetadata' in topicContextSchema.parse(context)).toBe(false);
  });
});
