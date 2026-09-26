---
name: verify-sleeper
description: Verify Sleeper Draft Assistant changes using repository tests, isolated browser journeys, and platform-specific smoke checks. Use when validating UI changes or investigating verification failures in this repository.
---

# Verify Sleeper

Read [the verification guide](../../../docs/VERIFICATION.md) for commands, feature entrypoints, proof owners and artifact privacy. Read [WORKFLOW.md](../../../docs/WORKFLOW.md) for canonical gates and remaining manual scenarios; desktop or release work also requires [RELEASING.md](../../../docs/RELEASING.md).

Select the narrowest check that reaches the changed behavior, run it, inspect failures, and then run the applicable full gates. Use `npm run test:browser` for real-browser checks: it owns isolated data and servers. The harness's interactive browser is optional for exploration, not required by the suite.

Before adding or removing tests, apply the guide's contract/regression/overlap criteria. Preserve security and platform proof. Keep production boundaries intact rather than adding test-only bypasses.

Report executed checks and actual outcomes. Distinguish Chromium evidence from packaged Windows evidence and mocked/provider-free flows from live Codex. Missing platform/tools are explicit gaps, not passes. Do not publish artifacts or change real user data as part of verification.
