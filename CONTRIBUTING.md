# Contributing

Thanks for helping improve Sleeper Draft Assistant.

## Before opening a change

- Search existing issues and pull requests.
- Use an issue for behavior changes or larger features.
- Keep pull requests focused and avoid unrelated dependency or design churn.
- Never include real league exports, provider tokens, private diagnostics, or third-party ranking datasets.

## Local setup

```bash
git clone https://github.com/itsreverence/sleeper-draft-assistant.git
cd sleeper-draft-assistant
npm ci
npm run dev
```

Use **Load demo draft** for development that does not require a live league.

## Quality gates

Before submitting:

```bash
npm run check
npm test
npm run build
git diff --check
```

Add regression tests for behavior and security-boundary changes. Desktop changes should include the relevant package/runtime smoke evidence described in `docs/WORKFLOW.md`.

## Pull requests

Explain what changed, why, user-visible impact, verification performed, and remaining limitations. Screenshots must use synthetic data and be checked for usernames, league IDs, paths, tokens, and other private information.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
