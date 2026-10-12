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
- **The agent is file-based.** The directory name under `agents/` is the registry key; `instructions.md` is the system prompt. Model/provider live in `config.ts` as a provider-id string.
- **Workflow step prompts live in sibling `.prompt.md` files.** Each workflow step's prompt is a file stacked next to its calling module (e.g. `ingestion-wf.02-classify-topics-step.prompt.md`), resolved once at module import with `loadPrompt(import.meta.url, '<file>.prompt.md')` from `src/common/prompts.ts`, which returns a getter that re-reads the file from disk on every render — so edits to a `.prompt.md` apply on the next workflow run without a restart. Fill per call with `renderTemplate(prompt(), {...})` (`{{variable}}` placeholders; missing or malformed placeholders throw). `mastra build` collapses `import.meta.url` to the bundle chunk's URL, so the loader falls back to a search under `src/mastra/` — a prompt file must stay somewhere in that tree to be findable in a built server.

## Filesystem rules

- **All output paths are anchored to the project root**, found by walking up from `process.cwd()` until a `package.json` appears (`resolveProjectRoot` in `src/common/utils.ts`). This keeps output locations stable regardless of where the server was started.
- **Every path built from user/workflow input goes through `resolveWithinDirectory`**, which rejects traversal outside its base directory. Route new file-handling through the helpers in `src/common/utils.ts` — the tests in `utils.test.ts` pin their behavior.
- Workflow outputs land in `.workspace/meetings/<meetingDirectoryName>/` (gitignored). Local databases live in `.mastra/data/` (also gitignored): LibSQL for app data, DuckDB for observability. Both are disposable local state; treat `.mastra/` and `.workspace/` as never-commit.

## Dependency alignment

The `@mastra/*` packages must stay peer-compatible: `@mastra/libsql`, `@mastra/duckdb`, and `@mastra/observability` each require a minimum `@mastra/core`. Mismatches surface late — as `SyntaxError: ... does not provide an export named ...` when the built server boots, not at install time. The build logs a "Peer dependency version mismatch" warning first; treat that warning as the failure it predicts and bump `@mastra/core` to match.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on this repo's remote (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
