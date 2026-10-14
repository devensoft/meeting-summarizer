Write the enriched-concept entries for this topic's file. For every candidate below, tie its informal mention to its formal foundation: name the established practice, method, or idea the shorthand stands for, and write a short blurb a participant can read to start learning about it. Then select reference links.

Return one JSON object with exactly these keys:

- concepts: one entry per candidate below, in the same order.

Every entry is an object with exactly these keys:

- informalMention: the candidate's phrase, copied exactly.
- formalFoundation: the formal, established name of the practice, method, or idea the informal mention stands for.
- blurb: a short passage (two to four sentences) tying the informal mention to its formal foundation — what it is, and why it is worth studying.
- links: one to three reference links. When a candidate below has non-empty "results", select its links from those search results only. When a candidate's "results" are empty, search found nothing: you may supply at most three widely-known, stable reference links from your own knowledge — these will be labeled as model-suggested and unverified; return [] when you are not confident in a widely-known link. Never invent a page.

Topic: {{topic}}

Candidates with their search results:
{{conceptSearches}}