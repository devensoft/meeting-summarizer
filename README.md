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
                                                     .workspace/meetings/<meeting>/
```

1. **Read & normalize** the transcript (plain text or WebVTT — see below).
2. **Classify** it: one overarching theme, or several distinct topics.
3. **Per topic**, a subworkflow consolidates the relevant content, extracts key segments, enriches them, and distills everything into a polished topic document.
4. **Collect** — all topic documents are written to a per-meeting output folder and reported back with their paths and sizes.

The whole flow is observable: every run is traced and spans are persisted, so you can inspect exactly what the model did in Mastra Studio.

## Transcript formats and the citation target

Every meeting directory holds two files: the **untouched original upload** and the **normalized transcript** (`<name>.normalized.txt`) — the line-numbered plain-text rendering every generated note cites.

- **WebVTT (`.vtt`)** — detected by extension, with a `WEBVTT` header sniff as backstop. A hand-rolled parser (no extra dependency) turns the recording into one line per cue: speakers come from voice tags or leading `Name:` markers when present, inline formatting tags are stripped, `NOTE`/`STYLE` blocks are skipped, and consecutive duplicate cues (rolling captions) are dropped. The meeting's duration is computed from cue timestamps and recorded on the run.
- **Plain text** — passes through verbatim, line for line, and *is* its own citation target. Plain-text runs record no duration.

Both formats share one line-numbering scheme: every citable line is prefixed with a stable `NN | ` number, and all downstream prompts (classification and per-topic) read the numbered normalized text — so a reference like `(L42)` or a quoted line can be verified against `<name>.normalized.txt` in the meeting directory.

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
