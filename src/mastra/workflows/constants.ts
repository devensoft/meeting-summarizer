/**
 * Named constants for the ingestion pipeline — tuning knobs and naming
 * conventions in one place, so a change is a one-line review. Spec decision:
 * thresholds and caps never appear as bare literals in step code.
 */

/** Separator between a line number and the transcript line it labels, in the
 * stable `NN |` prefixes every downstream prompt reads. */
export const LINE_NUMBER_SEPARATOR = ' | ';

/** File extension that marks an upload as WebVTT. */
export const VTT_FILE_EXTENSION = '.vtt';

/** First token of a WebVTT file; used to sniff VTT input when the extension
 * gives nothing away. */
export const WEBVTT_HEADER_PREFIX = 'WEBVTT';

/** Suffix for the normalized transcript written beside the untouched
 * original in the meeting directory. */
export const NORMALIZED_TRANSCRIPT_SUFFIX = '.normalized.txt';
