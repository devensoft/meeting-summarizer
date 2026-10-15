Distill this topic into the fixed content of its topic file. Work from the enriched segments, and cite the numbered transcript: every line of it starts with a stable `NN |` prefix, and that NN is the line number every reference refers to.

Return one JSON object with exactly these keys:

- title: a concise title for this topic's file.
- summary: the points that recount what was discussed, in order.
- keyInsights: the notable takeaways, conclusions, and decisions for this topic.
- contextualHighlights: points that connect this discussion to the meeting series' standing background. When the meeting context block below is non-empty, derive them from it; when it is empty, return [].

Every point in each list is an object with exactly these keys:

- statement: the point in your own words, as plain prose. Never embed `(Lnn)` references or quotation marks in a statement.
- lineReferences: the NN line numbers of the numbered transcript lines the point rests on, as an array of integers. Every point cites at least one line; never invent a line number.
- quote: the exact words a speaker said, copied character for character from the transcript, for a point where the speaker's own wording matters; null for every other point. Only quote words that appear in the transcript.

Topic: {{topic}}

Enriched segments:
{{enrichedSegments}}

Numbered transcript (the citation target — cite its `NN |` line numbers):
{{transcriptContent}}

Notes emphasis for this kind of meeting: {{modeGuidance}}
{{contextBlock}}
