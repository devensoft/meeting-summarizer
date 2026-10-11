# Meeting Summarizer

Turn raw meeting transcripts into structured, topic-organized notes — automatically.

Meeting Summarizer is an AI pipeline built on [Mastra](https://mastra.ai) that ingests a meeting transcript (e.g. a `.vtt` export), figures out what the meeting was actually about, and produces a clean written summary for each topic it finds — ready to drop into your team's wiki.

## How it works

```
transcript ──▶ read ──▶ classify topics ──▶ ┌─ single theme ──▶ summarize ──┐
                                           └─ many topics ──▶ per-topic pipeline (×4 parallel)
                                                                    │
                                                                    ▼
                                             consolidate ▶ extract ▶ enrich ▶ distill ▶ write
                                                                    │
                                                                    ▼
                                                     .workspace/meetings/<meeting>/
```

1. **Read & validate** the transcript file.
2. **Classify** it: one overarching theme, or several distinct topics.
3. **Per topic**, a subworkflow consolidates the relevant content, extracts key segments, enriches them, and distills everything into a polished topic document.
4. **Collect** — all topic documents are written to a per-meeting output folder and reported back with their paths and sizes.

The whole flow is observable: every run is traced and spans are persisted, so you can inspect exactly what the model did in Mastra Studio.

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

## License

[MIT](LICENSE)
