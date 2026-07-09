# Alpha Release Checklist

Use this before tagging or sharing a build. The goal is to prove the first-run path works without local developer context.

## 1. Code quality

Run from the repository root:

```powershell
npm run check
npm test
npm run build
```

Expected result: all workspaces pass with no TypeScript, Svelte, or unit-test failures.

## 2. Desktop package

Build the Windows package:

```powershell
npm run desktop:package
```

If packaging fails with a locked file under `apps/desktop/out-builder`, close every running `Sleeper AI Team Manager` process and retry.

Expected result: `apps/desktop/out-builder/win-unpacked/Sleeper AI Team Manager.exe` launches.

## 3. Packaged backend smoke test

Launch the packaged app and check the backend:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
Invoke-RestMethod http://127.0.0.1:8787/diagnostics
```

Expected result:

- `ok` is `true`.
- `capabilities.sqliteStorage` is `true`.
- diagnostics include `diagnosticsVersion`, redacted settings, storage counts, and runtime information.
- diagnostics do not include auth tokens, bearer strings, refresh tokens, or raw local secrets.

## 4. First-run user flow

Use a clean profile or clear local app state, then verify:

1. App opens on `Connect your Sleeper draft`.
2. Setup guide explains the three required steps.
3. Enter a Sleeper username. For new predraft leagues, paste the Sleeper league URL or league ID.
4. League and draft picker show the expected league.
5. Opening a draft collapses the connect panel and expands player-value import.
6. The setup strip marks Sleeper and draft as ready, team as matched or clearly unmatched, and player values as import needed.

## 5. FantasyPros draft-rankings import

Use a real FantasyPros draft-rankings CSV export. Verify:

1. `Open FantasyPros` opens `https://www.fantasypros.com/nfl/rankings/consensus-cheatsheets.php`.
2. Uploading the CSV produces a match summary.
3. Matched count is high enough to trust the board for the selected format.
4. Recommendation cards no longer show the Sleeper placeholder warning.
5. Imported rank, tier, bye, and ECR-vs-ADP signals appear in candidate reasoning where present.
6. Reloading the app reapplies the saved import for the same draft.

## 6. AI manager smoke test

Verify all configured provider modes that are intended for the release:

- `Deterministic fallback`: returns a draft-context answer without external AI.
- `Experimental Codex backend`: if enabled, login completes from Settings and answers use the connected backend.
- `Codex app-server`: if enabled, local Codex prerequisites are documented and failures are readable.

Ask at least:

- `What roster need matters most?`
- `Compare the top three options.`
- `What if I draft the recommended player?`

Expected result: answers reference imported rankings when present and clearly call out placeholder values when rankings are missing.

## 7. Diagnostics support path

Open Settings and click `Copy diagnostics`. Verify:

- The button completes and shows a copied confirmation.
- Clipboard contains valid JSON.
- JSON is redacted and can be shared for support.

## 8. Release notes

For the first alpha, call out these limitations clearly:

- Sleeper is the only supported platform.
- FantasyPros draft rankings CSV import is the expected real player-value source.
- Sleeper placeholder ranks are low-confidence setup scaffolding.
- Weekly projections and in-season projection imports are planned after export data is available.
- Codex subscription-backed integration is experimental and isolated behind the AI provider boundary.
