# Meeting Summarizer

Turns meeting transcripts into structured, high-signal notes: topics are identified, distilled, enriched, and written out as per-topic segments.

## Language

**Topic**:
A distinct subject identified within a single transcript. A transcript yields one or more topics.
_Avoid_: theme

**Topic omission**:
A topic the classifier judged the meeting not to be about — a tangent or small talk — and therefore excluded from downstream processing. Every omission is recorded as data, even while nothing renders it.
_Avoid_: low-signal filtering, topic pruning

**Meeting series**:
An ongoing set of related meetings sharing one purpose; named when a transcript is ingested so its shared context can apply.
_Avoid_: theme
