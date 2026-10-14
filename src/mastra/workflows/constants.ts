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

/** Minimum air-time share the leading topic must hold for topic dominance
 * (GLOSSARY.md): at or above this share of the transcript's lines, a short,
 * cohesive multi-topic meeting collapses to a single topic file. */
export const TOPIC_DOMINANCE_THRESHOLD = 0.8;

/** Maximum meeting duration in seconds for the dominance collapse — the
 * short-meeting bound. Only enforced when the parsed duration is known;
 * plain-text input carries null and skips the gate. */
export const SHORT_MEETING_MAX_SECONDS = 3600;
