# AGENTS.md

Guidance for AI agents working in this repository.

## Verify your work

The fast loop, run after every change:

```bash
bun test            # colocated *.test.ts files, bun:test runner
bun run typecheck   # tsc --noEmit, strict
```

All commands live in `package.json` — it is the source of truth for scripts. Two scripts behave non-obviously:

- `bun run start` chains `mastra build && mastra start`; the server alone fails without a fresh build. Runtime smoke test: server on `:4111`, `GET /health` returns `200 {"success":true}`.
- `mastra dev` hot-reloads agent system prompts (see file-based agents below), `mastra start` does not.

## Git conventions

- **Always merge with a merge commit**: use `git merge --no-ff` (never fast-forward or rebase) when merging branches into this one.

## Architecture

Two Mastra workflows do all the work, plus one file-based agent that exposes them:

```
src/mastra/
  agents/meeting-master/        file-based agent ("Matt The Meeting Master")
    config.ts                   model + workflow wiring
    instructions.md             the agent's system prompt
  tools/
    web-search/                 web-search tool + its provider-chain engine
  workflows/
    ingestion-wf.ts             top-level pipeline: read → classify → branch → collect → index
    ingestion-wf.NN-*.ts        its steps, numbered in execution order
    ingestion-wf.schemas.ts     zod schemas: the data contract between all steps
    per-topic-subworkflow.ts    runs once per topic (concurrency 4)
    per-topic-subworkflow.NN-*.ts   its steps, numbered in execution order
```

Facts that aren't visible from any single file:

- **File names carry the sequence.** `NN-` prefixes are execution order; renumber existing steps when inserting a new one so the ordering stays readable.
- **The schemas file is the contract.** Each step's `inputSchema` is the previous step's `outputSchema`; the chain reads top-to-bottom in `ingestion-wf.schemas.ts` (`transcriptSchema` → `topicResultSchema` → … → `segmentCreatedSchema`). Change a schema there and every step it feeds.
- **Branch output is keyed by branch id.** `ingestion-wf` branches on single-vs-multiple topics; the `.branch()` step emits an object keyed by path id (`single-topic-path` / `multiple-topics-path`), flattened by `08-collect-segments-step`. A new branch needs a matching key in the collector.
- **Topic files are code-rendered.** The distill step returns structured JSON (`citedTopicContentSchema`: title, summary, key insights, contextual highlights); `citation-validator.ts` strips out-of-range `(Lnn)` references and quote-verifies against the numbered transcript, `topic-file-renderer.ts` assembles the markdown with fixed sections (never model markdown), and `topic-file-name.ts` slugifies the title into the file name with `-2`/`-3` same-run collision suffixes.
- **Enriched Concepts are two agent calls with code in between.** Per-topic step 05 (`05-propose-enriched-concepts-step`) proposes candidates with a structured call, `enriched-concepts.ts` trims/dedupes/caps the list at `ENRICHED_CONCEPTS_MAX_CANDIDATES` (the cap is code, never prompt compliance), then `searchEnrichedConcepts` fans one query per candidate through `executeWebSearch` (`src/mastra/tools/web-search/` — the chain runs the bounded waves; never schedule waves or call providers elsewhere). Step 06 (`06-compose-enriched-concepts-step`) writes each blurb with a second structured call, and `resolveEnrichedConcepts` decides everything trust-worthy in code: provenance is per concept (`items[].results.length > 0` → `Grounding: web search`, links restricted to URLs the chain actually returned; empty → `Grounding: model-suggested (unverified)`, model links allowed but only well-formed http(s)), links capped at `ENRICHED_CONCEPTS_MAX_LINKS`, unmatched proposals/candidates dropped without throwing. Step 04 outputs `distilledTopicSchema` (= `validatedTopicFileSchema` + `transcriptContent`) because the proposal call reads the citation target; the write step is `07-write-segment-file-step` and its input is `composedTopicFileSchema`.
- **The agent is file-based.** The directory name under `agents/` is the registry key; `instructions.ts` is the system prompt, composing the static persona in `instructions.base.md` (re-read per request, so it hot-reloads) with optional run context. Model/provider live in `config.ts` as a provider-id string.
- **Tools auto-wire from `src/mastra/tools/`.** The bundler scans `src/mastra/tools/**` (skipping `*.test.ts`/`*.spec.ts`/`__tests__/`), and at boot every exported `Tool` instance is registered on the Mastra instance by convention — `index.ts` passes no `tools` by hand. `tools/web-search/` holds the one tool: `web-search-tool.ts` exports `webSearchTool` (the only `Tool` in the directory); its siblings are that tool's private chain internals, not tools.
- **Workflow step prompts live in sibling `.prompt.md` files.** Each workflow step's prompt is a file stacked next to its calling module (e.g. `ingestion-wf.02-classify-topics-step.prompt.md`), resolved once at module import with `loadPrompt(import.meta.url, '<file>.prompt.md')` from `src/common/prompts.ts`, which returns a getter that re-reads the file from disk on every render — so edits to a `.prompt.md` apply on the next workflow run without a restart. Fill per call with `renderTemplate(prompt(), {...})` (`{{variable}}` placeholders; missing or malformed placeholders throw). `mastra build` collapses `import.meta.url` to the bundle chunk's URL, so the loader falls back to a search under `src/mastra/` — a prompt file must stay somewhere in that tree to be findable in a built server.
- **Meeting context rides the run's RequestContext.** The optional `meetingContext` key (helpers in `src/mastra/meeting-context.ts`) is seeded from Studio request-context presets: `bun run dev` loads gitignored `presets.json` via `--request-context-presets` (committed template: `presets.example.json`; the CLI throws when the file is missing, so a fresh clone must copy it first, like `.env`). The classify prompt renders a context card from it and the agent's `instructions.ts` appends one; an empty or absent context changes nothing. The key threads through both branch paths into the per-topic pipeline (`topicContextSchema`): the distill step turns it into contextual highlights, and the topic-file renderer omits the Contextual Highlights section entirely when `meetingContext` is absent. The optional `seriesName` workflow input only names the output directory (`.workspace/meetings/<series>/<transcript>`). The classify step emits `omittedTopics` — topic omissions (see `GLOSSARY.md`), each carrying its transcript line ranges — through `topicResultSchema`; the transcript index renders them (numbered, with ranges) for multi-topic runs, and single-topic runs keep them as data. The same step resolves **topic dominance** in pure code (`src/mastra/workflows/topic-dominance.ts`): a multi-topic classification whose leading topic holds ≥ `TOPIC_DOMINANCE_THRESHOLD` air time in a meeting no longer than `SHORT_MEETING_MAX_SECONDS` (gate skipped when duration is unknown) that the classifier judged cohesive collapses to a single topic file, and the demoted topics are reconciled into `omittedTopics` under the omission rules — the collapse fires inside step 02, so no extra branch or step exists for it. The same structured call also judges **meeting format and mode** (see `GLOSSARY.md`; code in `src/mastra/workflows/meeting-mode.ts`, ADR 0001): format is a closed descriptive list, and the three mode scores resolve to one primary mode in code (argmax, fixed tie-break toward `status`) that renders as `{{modeGuidance}}` emphasis into the distill and transcript-index prompts — emphasis only: schemas, citation validation, and the index renderer's sections never change with the mode.
- **The transcript index is code-assembled after the collector.** `ingestion-wf.09-write-index-step` writes it only when `singleTopic === null` — a natural single-topic run and a collapsed one both pass through with no index. Run-level data (normalized transcript, omissions, single-topic gate) threads through BOTH branch paths: `branch-run.ts` builds the per-topic contexts (`topicRunContextSchema` — run-level extras ride on every item, optional in the type so the per-topic pipeline can still consume them) and wraps each branch's files into `branchRunSchema` with `kind: 'topic'` on every entry; the collector flattens the keyed branches into one envelope (`flattenBranchRun`). One structured agent call (sibling `ingestion-wf.09-write-index-step.prompt.md` + `jsonOnly`) reads the written topic files — read back from disk via `resolveProjectRoot`/`resolveWithinDirectory`, never from memory — the omissions, and the transcript; `transcript-index-validator.ts` applies the topic-file citation discipline to the decision log, keeps only recurring themes backed by ≥ 2 real topic files, and `transcript-index-renderer.ts` assembles the fixed sections (title → executive summary → wikilinked topic index → recurring themes → numbered decision log → action-item table → unresolved items → numbered omissions) with every number assigned in code. The workflow's output entries are `runOutputEntrySchema` (`segmentCreatedSchema` + `kind: 'topic' | 'index'`); the index file name is the code-slugified index title (`slugifyTopicTitle` with the `index` fallback + the shared collision-suffix helper).

## Filesystem rules

- **All output paths are anchored to the project root**, resolved by `resolveProjectRoot` in `src/common/utils.ts` (the tests in `utils.test.ts` pin its contract). Resolution is identical under `mastra dev` and `mastra start`: (1) a `PROJECT_ROOT` override is honored when it names an existing directory containing a `package.json` — anything else fails fast at boot with an error naming the variable; (2) otherwise a walk-up from `process.cwd()` finds the nearest `package.json`, skipping any directory whose path contains a `.mastra` segment (its `package.json` is build-generated, so `mastra start` would otherwise anchor inside the build output). The server logs the resolved root at boot; if dev and start disagree, look there.
- **Every path built from user/workflow input goes through `resolveWithinDirectory`**, which rejects traversal outside its base directory. Route new file-handling through the helpers in `src/common/utils.ts` — the tests in `utils.test.ts` pin their behavior.
- Workflow outputs land in `.workspace/meetings/<meetingDirectoryName>/` (gitignored). Local databases live in `.mastra/data/` (also gitignored): LibSQL for app data, DuckDB for observability. Both are disposable local state; treat `.mastra/` and `.workspace/` as never-commit.

## Dependency alignment

The `@mastra/*` packages must stay peer-compatible: `@mastra/libsql`, `@mastra/duckdb`, and `@mastra/observability` each require a minimum `@mastra/core`. Mismatches surface late — as `SyntaxError: ... does not provide an export named ...` when the built server boots, not at install time. The build logs a "Peer dependency version mismatch" warning first; treat that warning as the failure it predicts and bump `@mastra/core` to match.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on this repo's remote (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
