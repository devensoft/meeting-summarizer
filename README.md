# Meeting Summarizer

Turn raw meeting transcripts into structured, topic-organized notes — automatically.

Meeting Summarizer is an AI pipeline built on [Mastra](https://mastra.ai) that ingests a meeting transcript — a plain-text export or a WebVTT (`.vtt`) recording — figures out what the meeting was actually about, and produces a clean written summary for each topic it finds — ready to drop into your team's wiki.

## How it works

```
transcript ──▶ read ──▶ classify topics ──▶ ┌─ single theme ──▶ summarize ──┐
                                           └─ many topics ──▶ per-topic pipeline (×4 parallel)
                                                                    │
                                                                    ▼
                                             consolidate ▶ extract ▶ enrich ▶ distill ▶ write
                                                                    │
                                                                    ▼
                                             collect run ─▶ write transcript index (multi-topic runs only)
                                                                    │
                                                                    ▼
                                                     .workspace/meetings/<meeting>/
```

1. **Read & normalize** the transcript (plain text or WebVTT — see below).
2. **Classify** it: one overarching theme, or several distinct topics.
3. **Per topic**, a subworkflow consolidates the relevant content, extracts key segments, enriches them, and distills everything into a structured topic file — assembled by code, never free-form model markdown (see below).
4. **Collect** the run — all topic documents are written to a per-meeting output folder with their paths and sizes, together with the run-level data (normalized transcript, recorded omissions) the index step needs.
5. **Write the transcript index** — multi-topic runs only; it ties the topic files together (see below).

The whole flow is observable: every run is traced and spans are persisted, so you can inspect exactly what the model did in Mastra Studio.

## Transcript formats and the citation target

Every meeting directory holds two files: the **untouched original upload** and the **normalized transcript** (`<name>.normalized.txt`) — the line-numbered plain-text rendering every generated note cites.

- **WebVTT (`.vtt`)** — detected by extension, with a `WEBVTT` header sniff as backstop. A hand-rolled parser (no extra dependency) turns the recording into one line per cue: speakers come from voice tags or leading `Name:` markers when present, inline formatting tags are stripped, `NOTE`/`STYLE` blocks are skipped, and consecutive duplicate cues (rolling captions) are dropped. The meeting's duration is computed from cue timestamps and recorded on the run.
- **Plain text** — passes through verbatim, line for line, and *is* its own citation target. Plain-text runs record no duration.

Both formats share one line-numbering scheme: every citable line is prefixed with a stable `NN | ` number, and all downstream prompts (classification and per-topic) read the numbered normalized text — so a reference like `(L42)` or a quoted line can be verified against `<name>.normalized.txt` in the meeting directory.

## Topic file structure

Every topic file follows one fixed structure — **Title, Summary, Key Insights, Contextual Highlights, Enriched Concepts** — assembled by code from structured model output:

- Every `(Lnn)` reference is validated against the transcript; out-of-range references are stripped.
- Direct quotes are verified against the normalized transcript (whitespace/case-insensitive) and render as quotations; unverifiable ones render unquoted.
- **Contextual Highlights** appears only when meeting-series context was provided for the run; the section is omitted entirely otherwise.
- **Enriched Concepts** appears only when the topic proposed candidates. A structured call proposes casually-mentioned concepts (capped at ten per topic by code), each is searched through the provider chain, and a second structured call writes the blurb tying the informal mention to its formal foundation and picks one to three links. Every concept carries a provenance label: `Grounding: web search` when the chain found results (only pages the chain actually returned can be linked), or `Grounding: model-suggested (unverified)` when it found nothing — the one case where model-proposed links are accepted, so the formal term stands even without search.
- File names are slugified from the title by code, with `-2`, `-3`, … suffixes when a same-run file already holds the name.

## Transcript index

A meeting classified into **two or more topics** gets a transcript index written beside its topic files — the overview document a participant who missed the meeting reads first. Single-topic runs (a natural one or one collapsed by topic dominance) produce no index, and their recorded omissions stay data.

One structured agent call reads the written topic files (from disk), the recorded topic omissions, and the normalized transcript; **code assembles the markdown and assigns every number**. Sections render in fixed order:

1. **Title** — the file is named from its code-slugified title, with the same `-2`, `-3`, … collision suffixes topic files use.
2. **Executive summary** — one paragraph to catch up in a single read.
3. **Topic index** — every topic file of the run, wikilinked `[[slug]]`, so the links resolve in your notes tool.
4. **Recurring themes** — only subjects the model backed with two or more of the run's actual topic files; code drops anything less.
5. **Decision log** — numbered by code; each decision carries its `(Lnn)` references and a quote verified exactly like topic files (unverifiable quotes render unquoted).
6. **Action items** — a table with all four fields schema-required: Assigner, Assignee, Due (`YYYY-MM-DD` or `unstated`), Deliverable.
7. **Unresolved items** — open matters with the lines where they were left.
8. **Topic omissions** — the first place omissions render: numbered, each with its transcript line ranges.

Every empty section is omitted entirely — no empty headers. The workflow's run report distinguishes the two document kinds with a `kind` discriminator on each entry: `topic` for topic files, `index` for the transcript index.

## Quickstart

Prerequisites: [Bun](https://bun.sh) ≥ 1.2 and Node ≥ 22.13.

```bash
bun install

# configure your model provider key
cp .env.example .env        # then add your ZHIPU_API_KEY

# run the dev server (Studio + API on http://localhost:4111)
bun run dev
```

Then trigger the `ingestionWorkflow` with a transcript path — `samples/standup-notes.txt` is included for a quick spin.

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Dev server with hot reload (agent prompts included) |
| `bun run start` | Production: builds, then serves |
| `bun test` | Run the test suite |
| `bun run typecheck` | Strict TypeScript check |

## Stack

- **[Mastra](https://mastra.ai)** — workflow + agent framework, Studio, observability
- **Bun** — runtime, package manager, test runner
- **Z.ai GLM** — the LLM doing the reading and writing
- **LibSQL + DuckDB** — app storage and trace/metrics storage
- **[Composio](https://composio.dev)** (`@composio/core`) — web search via the Tavily and Exa toolkits

## Web search

Enriched Concepts are grounded with live web search through one provider
chain, called in-process via the Composio Platform SDK (a Mastra tool,
`web-search`, wraps it — there is no MCP client and no model-facing meta
tool: sessions run the direct-tools preset with a fixed allowlist of exactly
`TAVILY_SEARCH` and `EXA_SEARCH` under one stable service identity).

### Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `COMPOSIO_API_KEY` | — (unset) | Composio project API key (`ak_…`). **When unset, search is disabled**: callers receive an explicit empty result, never an error. Tavily and Exa must also be connected in the Composio project dashboard. |
| `WEB_SEARCH_PROVIDERS` | `composio:tavily,composio:exa` | Provider chain order, comma-separated `composio:<toolkit>` entries. Unknown entries are ignored (recorded); set to empty to disable search explicitly. Duplicate entries keep their first occurrence. |

### Behavior and thresholds

- Queries run in **bounded waves**; results normalize to a common
  `{title, url, snippet}` shape, links validated for well-formedness only.
- Each provider attempt has a **per-search timeout**; a provider that returns
  nothing hands off to the next entry in the chain.
- **429 responses back off exponentially** (base × 2ⁿ) up to a retry cap,
  then the chain fails over to the next provider.
- **No key or an exhausted chain yields an explicit empty result** — search
  problems never fail a meeting run.
- All thresholds (wave concurrency, timeout, backoff/retry caps, per-query
  result count, per-call query cap) live as named constants in
  `src/mastra/search/search-thresholds.ts`:

  | Constant | Value |
  |---|---|
  | `SEARCH_WAVE_CONCURRENCY` | 3 |
  | `SEARCH_TIMEOUT_MS` | 15 000 |
  | `RATE_LIMIT_MAX_RETRIES` | 2 |
  | `RATE_LIMIT_BACKOFF_BASE_MS` | 1 000 |
  | `RATE_LIMIT_BACKOFF_FACTOR` | 2 |
  | `SEARCH_RESULTS_PER_QUERY` | 3 |
  | `MAX_WEB_SEARCH_QUERIES` | 25 |

### Optional live smoke search

The test suite never touches the network (it runs on mock providers). To
verify a real Composio connection by hand — requires `COMPOSIO_API_KEY` plus
active Tavily/Exa connections in your Composio project:

```bash
bun scripts/web-search-smoke.ts "a formal concept name"
```

The script prints normalized results with the supplying provider, or an
explicit empty result (with the reason) when search is unavailable. Exit code
is non-zero when nothing came back, so it can drive a manual checklist.

## License

[MIT](LICENSE)
