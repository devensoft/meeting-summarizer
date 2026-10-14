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
  workflows/
    ingestion-wf.ts             top-level pipeline: read → classify → branch → collect
    ingestion-wf.NN-*.ts        its steps, numbered in execution order
    ingestion-wf.schemas.ts     zod schemas: the data contract between all steps
    per-topic-subworkflow.ts    runs once per topic (concurrency 4)
    per-topic-subworkflow.NN-*.ts   its steps, numbered in execution order
```

Facts that aren't visible from any single file:

- **File names carry the sequence.** `NN-` prefixes are execution order; renumber existing steps when inserting a new one so the ordering stays readable.
- **The schemas file is the contract.** Each step's `inputSchema` is the previous step's `outputSchema`; the chain reads top-to-bottom in `ingestion-wf.schemas.ts` (`transcriptSchema` → `topicResultSchema` → … → `segmentCreatedSchema`). Change a schema there and every step it feeds.
- **Branch output is keyed by branch id.** `ingestion-wf` branches on single-vs-multiple topics; the `.branch()` step emits an object keyed by path id (`single-topic-path` / `multiple-topics-path`), flattened by `08-collect-segments-step`. A new branch needs a matching key in the collector.
- **The agent is file-based.** The directory name under `agents/` is the registry key; `instructions.ts` is the system prompt, composing the static persona in `instructions.base.md` (re-read per request, so it hot-reloads) with optional run context. Model/provider live in `config.ts` as a provider-id string.
- **Workflow step prompts live in sibling `.prompt.md` files.** Each workflow step's prompt is a file stacked next to its calling module (e.g. `ingestion-wf.02-classify-topics-step.prompt.md`), resolved once at module import with `loadPrompt(import.meta.url, '<file>.prompt.md')` from `src/common/prompts.ts`, which returns a getter that re-reads the file from disk on every render — so edits to a `.prompt.md` apply on the next workflow run without a restart. Fill per call with `renderTemplate(prompt(), {...})` (`{{variable}}` placeholders; missing or malformed placeholders throw). `mastra build` collapses `import.meta.url` to the bundle chunk's URL, so the loader falls back to a search under `src/mastra/` — a prompt file must stay somewhere in that tree to be findable in a built server.
- **Meeting context rides the run's RequestContext.** Optional keys `meetingType` and `meetingContext` (helpers in `src/mastra/meeting-context.ts`) are seeded from Studio request-context presets: `bun run dev` loads gitignored `presets.json` via `--request-context-presets` (committed template: `presets.example.json`; the CLI throws when the file is missing, so a fresh clone must copy it first, like `.env`). The classify prompt renders a context card from it and the agent's `instructions.ts` appends one; an empty or absent context changes nothing. The optional `seriesName` workflow input only names the output directory (`.workspace/meetings/<series>/<transcript>`). The classify step emits `omittedTopics` — topic omissions (see `GLOSSARY.md`) — through `topicResultSchema` as recorded-but-unrendered data; surfacing it belongs to a future index/TOC effort.

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
