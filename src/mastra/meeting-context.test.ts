import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { RequestContext } from '@mastra/core/request-context';
import type { ClassifiedTopic, LineRange } from './workflows/ingestion-wf.schemas';
import { meetingContextSchema, readMeetingContext, reconcileTopics, renderMeetingContextCard } from './meeting-context';

describe('meetingContextSchema', () => {
  it('accepts the meeting-context keys from the example preset', () => {
    const examplePresets = JSON.parse(readFileSync(new URL('../../presets.example.json', import.meta.url), 'utf8'));
    const exampleContext = examplePresets['greenfield-design-sync'];

    expect(meetingContextSchema.parse(exampleContext)).toEqual(exampleContext);
  });

  it('rejects a non-string meetingType and identifies the field', () => {
    expect(() => meetingContextSchema.parse({ meetingType: 42 })).toThrow(/meetingType/);
  });
});

describe('readMeetingContext', () => {
  it('returns no context when there is no RequestContext', () => {
    expect(readMeetingContext(undefined)).toEqual({ meetingContext: undefined });
  });

  it('reads the string value from the context', () => {
    const requestContext = new RequestContext();
    requestContext.setRaw('meetingContext', 'Ongoing greenfield planning series.');

    expect(readMeetingContext(requestContext)).toEqual({
      meetingContext: 'Ongoing greenfield planning series.',
    });
  });

  it('ignores blank values and stale preset keys such as meetingType', () => {
    const requestContext = new RequestContext();
    requestContext.setRaw('meetingContext', '   ');
    requestContext.setRaw('meetingType', 42);

    expect(readMeetingContext(requestContext)).toEqual({ meetingContext: undefined });
  });
});

describe('renderMeetingContextCard', () => {
  it('renders nothing without meeting context', () => {
    expect(renderMeetingContextCard({})).toBe('');
    expect(renderMeetingContextCard({ meetingContext: '   ' })).toBe('');
  });

  it('renders the card with the series background', () => {
    const card = renderMeetingContextCard({ meetingContext: 'Ongoing greenfield planning series.' });

    expect(card).toContain('Meeting context');
    expect(card).toContain('Ongoing greenfield planning series.');
  });

  it('never renders a series-type line — meetingType is gone', () => {
    const card = renderMeetingContextCard({ meetingContext: 'Ongoing greenfield planning series.' });

    expect(card).not.toContain('belongs to');
  });
});

describe('reconcileTopics', () => {
  const topic = (topic: string, ...lineRanges: LineRange[]): ClassifiedTopic => ({ topic, lineRanges });

  it('dedupes and trims kept topics, keeping the first entry of a duplicate', () => {
    expect(
      reconcileTopics([topic('Budget', { startLine: 1, endLine: 4 }), topic('  Budget ', { startLine: 5, endLine: 6 }), topic('Roadmap', { startLine: 7, endLine: 9 })], []),
    ).toEqual({
      topics: [topic('Budget', { startLine: 1, endLine: 4 }), topic('Roadmap', { startLine: 7, endLine: 9 })],
      omittedTopics: [],
    });
  });

  it('keeps every candidate when the classifier would omit all of them', () => {
    expect(reconcileTopics([], [topic('Dogs', { startLine: 2, endLine: 3 }), topic('Weather')])).toEqual({
      topics: [topic('Dogs', { startLine: 2, endLine: 3 }), topic('Weather')],
      omittedTopics: [],
    });
  });

  it('never lets an omission shadow a kept topic, matching labels case-insensitively', () => {
    expect(reconcileTopics([topic('Budget', { startLine: 1, endLine: 4 })], [topic('budget', { startLine: 2, endLine: 3 }), topic('Weather', { startLine: 8, endLine: 9 })])).toEqual({
      topics: [topic('Budget', { startLine: 1, endLine: 4 })],
      omittedTopics: [topic('Weather', { startLine: 8, endLine: 9 })],
    });
  });

  it('drops omissions whose label is blank, even when they carry ranges', () => {
    expect(reconcileTopics([topic('Budget', { startLine: 1, endLine: 4 })], [topic('', { startLine: 5, endLine: 6 }), topic('   ')])).toEqual({
      topics: [topic('Budget', { startLine: 1, endLine: 4 })],
      omittedTopics: [],
    });
  });

  it('reports an empty result when the classifier returned nothing at all', () => {
    expect(reconcileTopics([], [])).toEqual({ topics: [], omittedTopics: [] });
  });
});
