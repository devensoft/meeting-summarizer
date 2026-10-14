Read this topic's discussion and propose the concepts it mentions only casually or informally — practices, methods, frameworks, or ideas referenced by nickname, shorthand, or in passing that are worth grounding in their formal foundations (for example, a team saying "five whys" deserves grounding in the root-cause-analysis practice). Propose only concepts a participant might want to study independently after the meeting: skip everything the discussion already treated formally or in depth, and everything internal to this team. Order candidates by how valuable independent discovery would be.

Return one JSON object with exactly these keys:

- concepts: the proposed candidates. There is no required count — propose only what genuinely qualifies; a discussion with no casual concepts returns an empty array.

Every entry is an object with exactly these keys:

- informalMention: the phrase as the discussion used it, kept searchable — it doubles as the web-search query for the concept.

Topic: {{topic}}

Numbered transcript (the discussion the candidates come from):
{{transcriptContent}}