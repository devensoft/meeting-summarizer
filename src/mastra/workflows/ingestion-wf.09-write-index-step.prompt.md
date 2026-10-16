The attached material describes a {{format}} meeting whose notes were already written as one file per topic. Write the meeting's transcript index — the overview document a participant who missed the meeting reads first.

Topic files (a JSON array; fileName is the file's name without extension, content is its full markdown):
{{topicFiles}}

Topics deliberately omitted from the notes, with the transcript line ranges where they appeared (a JSON array):
{{omittedTopics}}

Transcript, rendered as numbered lines — every line starts with a stable `NN |` prefix followed by the line's text:
{{transcriptContent}}

The omitted topics are listed only so your summary and themes account for everything the meeting contained; they are rendered from that data, so do not return them. The wikilinked topic index is also built by code from the run's actual files, so return no field for it.

Notes emphasis for this kind of meeting: {{modeGuidance}}
{{metadataSection}}
Fill every field of the JSON response:

- title: a descriptive title for the whole meeting — not a list of its topics.
- executiveSummary: one prose paragraph that lets someone who missed the meeting catch up in one read. Never embed "(Lnn)" references or quotation marks.
- recurringThemes: only subjects that surface in two or more of the topic files above — a cross-cutting concern, not itself a topic. For each, list the exact fileName values of the files where it surfaces under topicFileNames: at least two, and only names that appear above. A subject confined to a single topic file is not a recurring theme.
- decisions: each concrete decision the meeting reached. In statement, give the decision in plain prose — never embed "(Lnn)" references or quotation marks. lineReferences lists the numbered transcript lines that support the decision. quote is the speaker's exact words copied from the transcript when the wording itself matters, null otherwise.
- actionItems: every task someone was assigned. All four fields are required: assigner (who assigned it in the meeting), assignee (who is responsible), dueDate as YYYY-MM-DD, or the literal string "unstated" when the meeting set no date, and deliverable (the concrete deliverable or outcome).
- unresolvedItems: each open question or unsettled matter, with the numbered transcript lines where it was raised or left open. Do not list matters the meeting already settled — a decision is not an unresolved item.
