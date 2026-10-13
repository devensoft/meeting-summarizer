import { describe, expect, it } from 'bun:test';
import { RequestContext } from '@mastra/core/request-context';
import { readMeetingContext, reconcileTopics, renderMeetingContextCard } from './meeting-context';

describe('readMeetingContext', () => {
  it('returns no context when there is no RequestContext', () => {
    expect(readMeetingContext(undefined)).toEqual({ meetingType: undefined, meetingContext: undefined });
  });

  it('reads string values from the context', () => {
    const requestContext = new RequestContext();
    requestContext.setRaw('meetingType', 'design sync');
    requestContext.setRaw('meetingContext', 'Ongoing greenfield planning series.');

    expect(readMeetingContext(requestContext)).toEqual({
      meetingType: 'design sync',
      meetingContext: 'Ongoing greenfield planning series.',
    });
  });

  it('ignores blank and non-string values', () => {
    const requestContext = new RequestContext();
    requestContext.setRaw('meetingType', '   ');
    requestContext.setRaw('meetingContext', 42);

    expect(readMeetingContext(requestContext)).toEqual({ meetingType: undefined, meetingContext: undefined });
  });
});

describe('renderMeetingContextCard', () => {
  it('renders nothing without meeting context', () => {
    expect(renderMeetingContextCard({})).toBe('');
    expect(renderMeetingContextCard({ meetingType: 'design sync' })).toBe('');
  });

  it('renders the card with the series type when both keys exist', () => {
    const card = renderMeetingContextCard({
      meetingType: 'design sync',
      meetingContext: 'Ongoing greenfield planning series.',
    });

    expect(card).toContain('Meeting context');
    expect(card).toContain('"design sync"');
    expect(card).toContain('Ongoing greenfield planning series.');
  });

  it('renders the card without a series line when only the context exists', () => {
    const card = renderMeetingContextCard({ meetingContext: 'Ongoing greenfield planning series.' });

    expect(card).toContain('Ongoing greenfield planning series.');
    expect(card).not.toContain('belongs to');
  });
});

describe('reconcileTopics', () => {
  it('dedupes and trims kept topics', () => {
    expect(reconcileTopics(['Budget', '  Budget ', 'Roadmap'], [])).toEqual({
      topics: ['Budget', 'Roadmap'],
      omittedTopics: [],
    });
  });

  it('keeps every candidate when the classifier would omit all of them', () => {
    expect(reconcileTopics([], ['Dogs', 'Weather'])).toEqual({ topics: ['Dogs', 'Weather'], omittedTopics: [] });
  });

  it('never lets an omission shadow a kept topic', () => {
    expect(reconcileTopics(['Budget'], ['budget', 'Weather'])).toEqual({
      topics: ['Budget'],
      omittedTopics: ['Weather'],
    });
  });

  it('drops blank omission labels', () => {
    expect(reconcileTopics(['Budget'], ['', '   '])).toEqual({ topics: ['Budget'], omittedTopics: [] });
  });

  it('reports an empty result when the classifier returned nothing at all', () => {
    expect(reconcileTopics([], [])).toEqual({ topics: [], omittedTopics: [] });
  });
});
