# Meeting Summarizer

Turns meeting transcripts into structured, high-signal notes: topics are identified, distilled, enriched, and written out as per-topic segments.

## Language

**Topic**:
A distinct subject identified within a single transcript. A transcript yields one or more topics.
_Avoid_: theme

**Topic omission**:
A topic the classifier judged the meeting not to be about — a tangent, small talk, or a non-central subject demoted when a meeting resolves to a single topic — and therefore excluded from downstream processing. Every omission is recorded as data and rendered, numbered with transcript line references, in the transcript index of multi-topic meetings.
_Avoid_: low-signal filtering, topic pruning

**Air time**:
The portion of a meeting's discussion devoted to a topic, measured over the lines of the normalized transcript. Non-central topics are those whose air time is very low relative to the leading topic.
_Avoid_: coverage, share of voice

**Topic dominance**:
The degree to which one leading topic holds nearly all the air time in a transcript. High dominance in a short, cohesive meeting resolves a multi-topic classification to a single topic file, demoting the other topics to omissions.
_Avoid_: single-theming, collapsing

**Normalized transcript**:
The line-numbered plain-text rendering of an ingested transcript — one line per cue for VTT input, verbatim lines for plain text. It is the citation target for every reference and quote in generated notes; the original upload is kept alongside it unmodified.
_Avoid_: cleaned transcript, flattened transcript

**Transcript index**:
The overview document generated for a multi-topic meeting: descriptive title, executive summary, wikilinked topic index, recurring themes, decision log, action items, unresolved items, and numbered topic omissions. Distinct from the per-topic topic files it links to.
_Avoid_: table of contents, TOC, summary file

**Recurring theme**:
A subject or thread surfacing across two or more topic files of one meeting — a cross-cutting concern, not itself a topic.
_Avoid_: theme (unqualified — reserve for this cross-topic sense only)

**Decision record**:
A concrete decision captured in the transcript index's decision log, numbered, with a supporting quote and transcript line reference.
_Avoid_: decision item

**Action item**:
A task captured in the transcript index defined by four things: assigner, assignee, due date (or explicitly unstated), and a clear deliverable or outcome.
_Avoid_: todo, follow-up

**Unresolved item**:
A question, doubt, or open-ended matter recorded in the transcript index to be discussed or settled later.
_Avoid_: open question, blocker

**Enriched concept**:
A concept a topic mentions casually or informally, grounded to its formal foundation — a short blurb plus reference links — so meeting participants can pursue independent discovery and learning. Links come from live web search when available; without search, the formal term stands on its own rather than invented URLs.
_Avoid_: learned concept, external link

**Meeting series**:
An ongoing set of related meetings sharing one purpose; named when a transcript is ingested so its shared context can apply.
_Avoid_: theme
