# Codex web search for injury news

Research date: 2026-09-24

Implementation follow-up: the user chose AI-controlled lookup rather than a separate search button. The adapter now exposes `check_player_news`, disables direct search on main threads, and uses bounded isolated research threads with live search. See [current behavior](../AI_PROVIDERS.md#ai-controlled-news-lookup). A local Codex 0.156.1 smoke accepted thread-level configuration and emitted two completed `webSearch` events, returning an ESPN URL. It also returned an old article, motivating rejection of reports without a valid date within seven days. The findings below describe the pre-change investigation, not current implementation.

## Recommendation

Enable an explicit, opt-in **Check latest news** workflow, initially in Team Manager. Use live search for time-sensitive injury reporting, and give Codex dated, attributed news as a separate evidence category. Do not silently enable unrestricted search on every automatic draft recommendation. This is a proposed design, not implemented behavior.

The value is filling a real evidence gap: the current [Team Manager prompt](../../apps/api/src/ai/prompt.ts) distinguishes Sleeper injury/practice/depth-chart metadata from actual reporting and expressly prohibits treating `newsUpdatedAt` as an article. Current projections and season value rankings still remain necessary; news supplements them rather than replacing them. [Architecture](../ARCHITECTURE.md), [AI providers](../AI_PROVIDERS.md).

## Current repository behavior

The [local app-server adapter](../../apps/api/src/ai/codex-app-server-provider.ts) launches plain `codex app-server`. Threads use `ephemeral: true`, `approvalPolicy: "never"`, and `sandbox: "read-only"`. Its base instructions prohibit browsing, but **there is no explicit `web_search: "disabled"` configuration override**. Consequently, repository code establishes an instruction-level prohibition, not removal of the built-in tool; effective availability can depend on inherited Codex configuration. This investigation did not inspect personal configuration or test actual search availability.

The adapter collects agent-message text deltas and handles its own dynamic fantasy tools. It does not consume web-search item lifecycle events or expose structured news citations. Its six-call ceiling counts `item/tool/call` requests, not hosted web searches. Turns are serialized, have a default 60-second timeout, and reuse ephemeral draft/team threads; a turn error closes the client and clears those threads. These are important integration and latency constraints. [Adapter source](../../apps/api/src/ai/codex-app-server-provider.ts).

## Documented search controls

Current official configuration documents four modes:

| Mode | Behavior | Injury-news fit |
| --- | --- | --- |
| `disabled` | Removes search | Explicit ordinary-workflow boundary |
| `cached` | OpenAI-maintained index; no live external retrieval | No guarantee of breaking-news freshness |
| `indexed` | External access gated by the search index | Intermediate option, version compatibility needs checking |
| `live` | Live retrieval | Appropriate for an explicit latest-news request |

Cached is the documented normal default. `tools.web_search.allowed_domains` can restrict search domains; managed `allowed_web_search_modes` can constrain modes. Legacy `features.web_search*` toggles are deprecated. [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Hosted web search is separate from sandboxed-command networking and does not use its proxy/domain allowlist. A read-only local sandbox is therefore not a web-search denial. Cached results reduce, but do not eliminate, prompt-injection exposure; all retrieved material remains untrusted. [Web search](https://learn.chatgpt.com/docs/web-search), [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security).

For an app-owned process, the documented CLI override mechanism avoids changing the user's global settings: illustrative Node spawn arguments are `['app-server', '-c', 'web_search="live"']`, or the same with `"disabled"`. Local `codex app-server --help` confirmed support for `-c` and TOML values during this investigation. CLI overrides have higher precedence than ordinary project/user configuration, but do not bypass managed requirements. [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic), [Developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

## Events and citations

App-server documents `webSearch` items containing `id`, `query`, and optional `action`; actions cover search, opening pages, and finding text. `item/started` and `item/completed` provide lifecycle state. These can support a visible search-in-progress indicator, but are not by themselves claim-to-source citations. The public app-server guide does not establish a Responses-style URL-annotation contract for this adapter. Before implementation, verify the supported installed protocol/schema and capture a consented synthetic search fixture. Do not assume ChatGPT citation markers will render correctly in Sleeper's UI. [App-server protocol](https://learn.chatgpt.com/docs/app-server).

## Proposed safety and product constraints

- Keep ordinary strategy search explicitly disabled. Prefer a separate ephemeral research context containing only validated public player identity, NFL team, date, and a narrow news question—not league IDs, imported rankings, roster history, credentials, local paths, or raw user instructions. This reduces query-disclosure risk without changing who owns strategic judgment.
- Restrict sources to an approved set, prioritizing official team/league reports. Return a bounded evidence record with player identity, claim, source URL/title, reported date, retrieval time, and uncertainty. Validate structure and URLs deterministically; that cannot prove the reporting is true. Distinguish confirmed status from speculation and surface conflicting reports.
- Keep news advisory. It must not override authoritative Sleeper roster/availability state, lineup feasibility, unsupported-format restrictions, or AI-response validation. Retain safe shell/file restrictions and explicitly constrain unrelated tools; a prompt alone is not a capability boundary.
- Show source links and an “as of” time. The current [Electron shell](../../apps/desktop/src/main.cjs) only allows external HTTPS links to `www.fantasypros.com`; source links need deliberate policy and renderer work, not a broad navigation/CSP relaxation.
- Use bounded lookup latency, cancellation, and short-lived evidence reuse; show unavailable/stale news honestly. Search adds retrieval work, so additional latency and quota pressure are expected, but neither exact timing nor account-specific search charges were established here. Avoid blocking every draft turn on a fresh search.
- Update settings, shared evidence contracts, provider/parser tests, UI attribution, and [privacy documentation](../PRIVACY.md) together. Turning search off, switching teams/providers, clearing data, and resetting must invalidate pending research and any retained evidence. Keep query/response content out of support reports.

## Method and limits

Used official OpenAI documentation, repository source, and local CLI help only. No model/provider requests, authentication inspection, settings changes, ranking downloads, or injury-news retrieval were performed. Only this research note was added; no application implementation or full application validation gates were run.
