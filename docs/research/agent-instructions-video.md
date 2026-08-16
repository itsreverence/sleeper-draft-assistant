# Agent-instruction lessons from Theo's AGENTS.md walkthrough

Research date: 2026-08-16

## Question

Which ideas from Theo's video, [My AGENTS.md & SKILLS.md Breakdown (Don't copy them)](https://www.youtube.com/watch?v=e1snsuY4lTI), should influence this repository's `AGENTS.md` and proposed `docs/agents/` setup?

## Sources and method

- Primary source: the video's YouTube description and English caption track. Timestamp links below point to the relevant passage. The captions are machine-generated, so recommendations are paraphrased rather than quoted.
- First-party cross-check: OpenAI's [AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and [skill-authoring documentation](https://learn.chatgpt.com/docs/build-skills).
- Repository comparison: [`AGENTS.md`](../../AGENTS.md), [`README.md`](../../README.md), [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), and [`docs/WORKFLOW.md`](../WORKFLOW.md).

## Conclusion

The repository should not copy Theo's file. Its current `AGENTS.md` already gets the most important part right: it records project-specific security and product boundaries. The strongest improvements are to correct one stale architectural instruction, make cross-surface completeness explicit, keep a single glossary in `CONTEXT.md`, and distinguish targeted iteration checks from final gates.

The proposed GitHub issue-tracker, triage-label, and single-context domain files are sensible. They are project wayfinding rather than ideas taken directly from the video.

## Adopt

### 1. Correct the stale deterministic-recommendation instruction

Theo recommends deriving instructions from real failures and revisiting them when they become stale, rather than treating an old template as permanent ([09:31](https://www.youtube.com/watch?v=e1snsuY4lTI&t=571s), [19:53](https://www.youtube.com/watch?v=e1snsuY4lTI&t=1193s), [23:25](https://www.youtube.com/watch?v=e1snsuY4lTI&t=1405s)).

`AGENTS.md` currently says, "Keep deterministic recommendations as the default." That no longer precisely matches the documented product contract: normal draft advice requires Codex, while deterministic code supplies evidence normalization, availability and feasibility safeguards, and response validation. Replace that line with the current boundary instead of letting an agent rebuild a parallel local strategist.

Suggested intent:

> Keep evidence normalization, availability checks, roster feasibility, unsupported-format checks, and AI-response validation deterministic. Codex is the strategist for the normal assistant experience; do not grow a parallel deterministic recommendation product.

### 2. Add one applicable-surfaces reminder

The video's strongest repository-level example is a checklist for changes that work on one tested surface but omit another: clients, shared contracts, adapters, reverse actions, and documentation ([32:37](https://www.youtube.com/watch?v=e1snsuY4lTI&t=1957s)). That maps directly to this monorepo.

A short root instruction or workflow link should require checking every applicable surface:

- shared schemas and engine contracts;
- API routes, persistence, imports, and provider adapters;
- Svelte renderer and Electron shell;
- reverse paths such as clear, reset, disconnect, cancellation, and migration;
- user-facing and maintainer documentation.

This should be an applicability check, not a demand to change every workspace on every task.

### 3. Put project vocabulary in one root `CONTEXT.md`

Theo separates README content from agent-operating guidance and uses a compact glossary so agents speak in the project's domain language ([24:18](https://www.youtube.com/watch?v=e1snsuY4lTI&t=1458s), [25:05](https://www.youtube.com/watch?v=e1snsuY4lTI&t=1505s)). The proposed single-context layout fits this product better than immediately creating workspace-specific context files.

Keep definitions in one `CONTEXT.md` and link to it from `AGENTS.md`; do not duplicate the glossary in both places. Add `CONTEXT.md` to required reading once it exists. Useful terms include draft snapshot, evidence source, provider, living draft plan, user guidance, emergency board-only mode, capability token, and active data generation.

OpenAI confirms that Codex layers root and nested `AGENTS.md` files and gives closer files higher precedence. It also imposes a combined instruction budget, which favors a concise root file and domain references over copying architecture prose into every workspace ([official AGENTS.md docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md)). Nested overrides can wait until a workspace has genuinely different rules.

### 4. Stage verification without weakening the final gates

Theo advocates type checking, linting, and focused tests during iteration before broad builds ([05:13](https://www.youtube.com/watch?v=e1snsuY4lTI&t=313s)); he also warns against unfocused test accumulation ([07:11](https://www.youtube.com/watch?v=e1snsuY4lTI&t=431s)).

For this repository, clarify the sequence rather than removing safeguards:

1. During implementation, run the narrowest relevant checks first.
2. Before completion, run the mandatory repository gates.
3. Run the applicable real-client, security, storage, packaging, or release smoke steps from the workflow docs.

Also align the root summary with `docs/WORKFLOW.md`, which currently includes `npm audit` and `git diff --check` in canonical validation in addition to check, test, and build.

### 5. Treat agent instructions as a reviewed failure-mode log

The video repeatedly emphasizes inspecting actual correction history, asking why an agent made a wrong or slow choice, and promoting only recurring problems into durable instructions ([19:53](https://www.youtube.com/watch?v=e1snsuY4lTI&t=1193s), [22:53](https://www.youtube.com/watch?v=e1snsuY4lTI&t=1373s)). This repository's recent draft smoke test is a good model: observed timing and strategy-conflict failures became tests and narrow code changes.

Use issues, review findings, and repeated agent corrections to evolve `AGENTS.md`. Do not add rules merely because another repository has them.

## Keep as-is

- **Security and local-first boundaries:** These are concrete product invariants, exactly the kind of non-negotiable qualities the video recommends stating ([26:34](https://www.youtube.com/watch?v=e1snsuY4lTI&t=1594s)). They should remain hard constraints, not soft preferences.
- **Required-reading links:** These efficiently route agents to architecture and workflow details without turning `AGENTS.md` into a second README.
- **GitHub tracker and triage documents:** They provide unambiguous wayfinding. The video neither requires nor argues against them.
- **Single-context domain layout:** Appropriate now. Add nested context or `AGENTS.md` files only after an actual workspace-specific need appears.
- **Installed skill descriptions:** The video's advice that descriptions should express trigger conditions is confirmed by OpenAI: implicit activation matches the skill description, so descriptions should front-load scope, boundaries, and trigger words ([video at 12:31](https://www.youtube.com/watch?v=e1snsuY4lTI&t=751s); [official skill docs](https://learn.chatgpt.com/docs/build-skills)). The installed skills already generally follow that form.

## Do not adopt

- Do not copy Theo's model-specific complaints, preferred libraries, visual taste, machine inventory, PR automation, or command-center workflow. They encode his environment rather than this product.
- Do not weaken this app's security boundaries based on the video's advice not to over-engineer security for Theo's local development server. Sleeper Draft Assistant handles provider access, imported rankings, league data, local persistence, and an Electron-to-loopback trust boundary.
- Do not duplicate README or architecture prose inside `AGENTS.md`. Keep the agent file operational and link to the authoritative documents.
- Do not add nested instruction files simply because the repository is a monorepo. OpenAI supports nesting, but more layers are useful only when their rules truly differ.
- Do not make every preference a hard rule. Product security and privacy boundaries are hard constraints; style and workflow guidance are defaults that user instructions may supersede when safe.

## Minimal setup adjustment

Proceed with the proposed `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md`. Before finalizing `AGENTS.md`, make four small adjustments:

1. Replace the stale deterministic-recommendation line with the current AI-strategist/deterministic-safeguards boundary.
2. Add `CONTEXT.md` to required reading once present and keep the glossary there only.
3. Add one applicable-surfaces reminder or link to a checklist in `docs/WORKFLOW.md`.
4. State that targeted checks come first during iteration while the full canonical gates remain required before completion.
