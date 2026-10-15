# ADR 0001: Meeting format and meeting mode replace the `meetingType` placeholder

Date: 2026-10-14
Status: Accepted

## Context

The ingestion pipeline carried a `meetingType` RequestContext key — free text seeded from a Studio preset and rendered into the classify and transcript-index prompts as one framing sentence. It was a placeholder for the original intent: judging what kind of meeting a transcript holds so the notes could be shaped accordingly. Free text cannot drive that shaping — code cannot branch on `"greenfield product design and planning sync"` — and the pipeline is meant to infer, not ask: ingestion requires nothing but the transcript.

## Decision

Split the placeholder into two inferred concepts (GLOSSARY.md), judged by the classifier in its existing structured call — no new step, model call, or renumbering:

- **Meeting format** describes: the ritual the meeting follows, from a closed list — standup, planning, retrospective, one-on-one, brainstorm, workshop, other. Prompts use it as framing only.
- **Meeting mode** drives: the classifier scores the three modes — status, discussion, learning — from 0 to 1, and code resolves the primary mode by argmax with a fixed tie-break toward `status`, preserving today's prompt behavior as the default on a blanket tie. The mode selects emphasis guidance rendered into the distill and transcript-index prompts via a `{{modeGuidance}}` placeholder; the guidance strings live in code (`src/mastra/workflows/meeting-mode.ts`), not in per-type prompt files.

Mixed meetings (long-running sessions, brainstorms that produce decisions and tasks) are handled by the scores plus **emphasis, never structure**: guidance reorders what the prompts hunt for first, while schemas, citation validation, and the index renderer's fixed sections stay identical across modes. A misjudged mode costs a slightly weaker note, never a broken one. A mode per topic — a long planning meeting mixing modes across topics — is a deliberate future step, not built here.

The RequestContext keeps only `meetingContext` (series background); the context card gates on that key alone. The user provides nothing about the meeting's kind.

## Consequences

- The `meetingType` key, its `'general'` default, and the card's series-type line are gone. Presets still carrying the old key are ignored harmlessly.
- One classifier call now also returns format and mode scores; code owns the resolution, per the repo rule that everything trust-worthy is decided in code, never by prompt compliance.
- A new emphasis profile costs one string per mode, not one prompt file per meeting type; new rituals require widening the format enum — a deliberate, reviewable act.
- Meeting metadata (date, time, attendees, title, description) remains unbuilt and is tracked as its own issue.
