# Domain docs

These rules describe how engineering skills consume this repository's domain documentation.

## Before exploring

- Read `CONTEXT.md` at the repository root when it exists.
- Read decisions under `docs/adr/` that affect the area being changed.
- If either location does not exist, proceed without treating its absence as a defect.

## Layout

This repository uses a single-context layout:

```text
/
|-- CONTEXT.md
`-- docs/adr/
```

The API, renderer, desktop shell, engine, and shared schemas are technical boundaries within one Sleeper Draft Assistant product domain. Do not create workspace-specific context files or nested `AGENTS.md` files unless genuinely different terminology or operating rules emerge.

## Vocabulary and decisions

- Use terms as defined in `CONTEXT.md`; avoid drifting to synonyms it explicitly rejects.
- If a required concept is missing, reconsider whether new terminology is necessary before adding it through domain-modeling work.
- Surface conflicts with an existing ADR explicitly instead of silently overriding the recorded decision.
- Create domain documents lazily from resolved terminology and architectural decisions, not merely to fill an empty directory.
