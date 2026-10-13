The provided text is a transcript of a {{meetingType}} meeting. Identify each distinct topic the meeting is about, including topics discussed in multiple non-contiguous sections. Return each unique topic once as a concise label. Do not impose a maximum number of topics.
{{contextBlock}}
Transcripts often also contain material the meeting is not about: small talk, side anecdotes, scheduling and logistics asides. Omit such a topic only when the transcript itself makes that clear — the discussion is brief, and no decision, question, or insight elsewhere in the transcript depends on it. When uncertain, keep the topic. Every omission must stay on record: return each omitted topic's label under omittedTopics. If every topic would be omitted, omit none.

Transcript:
{{transcriptContent}}