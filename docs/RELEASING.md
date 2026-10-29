# Releasing

## Versioning

The project uses semantic versions with prerelease labels. The current public line is `0.1.0-beta.x`. Beta releases may contain breaking changes and are not automatically promoted to stable.

## Every release

### Automated gates

From a clean checkout of the intended commit:

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev --audit-level=high
git diff --check
```

Require Linux CI and the `windows-package-smoke` job to pass. The Windows job and the release workflow both run these checks before publication:

- Unpacked API startup, unauthenticated health, authenticated diagnostics, and rejection without a capability token.
- One exact candidate artifact set, defined in `scripts/candidate-artifacts.mjs`. Unexpected executables or ZIPs fail the build. CI records hashes and uploads the installer, portable executable, and checksums before either smoke runs a binary. The release build uploads its installer, portable executable, ZIP, and hash manifest before smoke runs on a fresh runner. A third runner verifies the build manifest before generating release checksums and publishing. Smoke uploads nothing consumed by publication.
- Download of the highest semantic version among published, non-draft releases, including prereleases. PR and master CI use that release even when the candidate has the same package version. Tag pushes select only versions strictly lower than the built version, including re-runs and backports. The selected tag is logged. Its NSIS installer must match its own `SHA256SUMS.txt` before execution.
- Release build and smoke jobs have only `contents: read`. Only the fresh publish runner has `contents: write`, and it never executes an app or installer. Release checkouts disable persisted credentials. Build and publish explicitly disable setup-node package-manager caching and restore no shared caches. The installer script removes `GITHUB_TOKEN` and `GH_TOKEN` from its environment immediately after download and verification, before any installer or app runs.
- A clean-profile candidate installation, launch, renderer/API readiness check, and clean close before the separate upgrade test. CI uninstalls this copy and removes only its disposable profile before installing the baseline.
- Silent per-user installation of the baseline, offline seeding through its authenticated API, clean close, and installation of the candidate over it. Checks compare persisted settings, guidance IDs/text/timestamps, import counts/timestamps, ranking and projection/ADP values, and decision snapshot IDs/timestamps. Added JSON fields and key order do not affect these comparisons. The demo draft supplies synthetic data without Sleeper, FantasyPros, or Codex requests. Old-release readiness uses health, authenticated diagnostics, and the database because older builds lack the renderer-ready marker. Every close waits for that launched process's visible main window.
- Candidate renderer mount, default `%APPDATA%\Sleeper Draft Assistant` data placement, IPv4 loopback binding, and API authentication. Private ACL checks on the data directory and database permit only the current user, SYSTEM, and Administrators. Hosted-runner ACLs do not prove every standard-user profile configuration.
- Diagnostics and support-report redaction with populated private data. Checks exclude the launch capability, profile path, username, AppData path and literal `%APPDATA%`, configured executable path, seeded player, guidance, and snapshot identifiers, imported names, and guidance text. Leak checks normalize Windows, forward-slash, and JSON-escaped paths. The support report must retain the safe configured `timeoutMs` value of `75000`.
- A saved-guidance category clear, relaunch, and proof that unrelated settings, imports, and history remain. Rankings, season projections, ADP, decision snapshots, and strategy instructions must each be populated before clear and reset. A full reset followed by relaunch must restore defaults and empty all five seeded categories. The renderer must mount and settings must remain writable. This tests the API reset, not the renderer's typed-confirmation and preference cleanup flow.
- An occupied port with the actual native Retry/Exit dialog driven through Windows UI Automation. Retry must recover after releasing the disposable listener. Exit must stop all app processes while retaining the unrelated listener. No production dialog bypass is used.
- Clean shutdown without owned API processes or listeners, silent uninstall with shortcut and HKCU-registration removal, unchanged database and retained profile marker, then portable renderer startup with retained settings.

Set the optional repository Actions variable `SMOKE_BASELINE_TAG` only after reviewing the selected release. Both workflows pass it to the script. An override selects exactly that published tag and still verifies its installer against that release's own `SHA256SUMS.txt`. A missing tag fails clearly. On tag pushes, an override must also select a strictly older semantic version. Override use and upgrade skips produce GitHub warning annotations. Without an override and without an eligible published baseline, the script reports `UPGRADE SKIPPED` and runs the candidate checks, so a first release can proceed. Keep the offline seed requests compatible with the previous release. If a future change breaks seeding, update the seed or review an explicit baseline override rather than silently picking an older release. Remove `SMOKE_BASELINE_TAG` once the default baseline works again.

The smoke does not assert reset coverage for ROS rankings, weekly projections, or draft plans. The first two require live Sleeper state through their authenticated import routes. Draft-plan persistence requires a real AI response and excludes the offline no-provider mode. Verify these categories with populated real data during the fuller desktop pass.

The scripts require disposable hosted Windows runners. The installer script refuses to run without both `CI=true` and `RUNNER_OS=Windows`. A launch retries once if another process takes its reserved port. Renderer readiness means `#app` has content. It does not prove interactive UI flows.

### Real Windows smoke

Run this smoke **before tagging**, using CI's pre-smoke `windows-candidate` artifact from a passing run of the exact commit to be tagged. That artifact contains the installer, portable executable, and `SHA256SUMS.txt`, and expires after 7 days. If it expires or the commit changes, run CI again and repeat this smoke.

Find the run in GitHub Actions and confirm its full commit SHA. Open the Windows job's **Log candidate identity before executing smoke binaries** step. Copy its pre-smoke artifact ID and ZIP SHA-256 digest. Download that exact ID with the API, rather than selecting the artifact by name. Let `curl.exe` write the file itself. Shell redirection such as `> candidate.zip` corrupts the ZIP in Windows PowerShell 5.1, which re-encodes binary output as UTF-16 text. The same command works in PowerShell and Bash:

```powershell
gh run list --workflow ci.yml --commit <full-commit-sha>
curl.exe -fL -H "Authorization: Bearer $(gh auth token)" -o candidate.zip https://api.github.com/repos/itsreverence/sleeper-draft-assistant/actions/artifacts/<logged-artifact-id>/zip
```

Type `curl.exe`, not `curl`. Windows PowerShell 5.1 maps `curl` to `Invoke-WebRequest`.

The logged `artifact-digest` hashes the uploaded ZIP bytes, not the individual executables. The default archived upload uses the [artifact toolkit's ZIP stream and SHA-256 hash](https://github.com/actions/toolkit/blob/main/packages/artifact/src/internal/upload/blob-upload.ts). In PowerShell, verify the downloaded archive against the digest from that pre-smoke log before extracting it:

```powershell
$expectedZipHash = "<logged-pre-smoke-zip-sha256>"
if ((Get-FileHash -LiteralPath candidate.zip -Algorithm SHA256).Hash -ine $expectedZipHash) {
  throw "Candidate ZIP does not match the pre-smoke upload."
}
Expand-Archive -LiteralPath candidate.zip -DestinationPath windows-candidate
Get-Content windows-candidate/SHA256SUMS.txt | ForEach-Object {
  $expected = $_.Substring(0, 64)
  $file = Join-Path windows-candidate $_.Substring(66)
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $expected) {
    throw "Candidate checksum mismatch."
  }
}
```

Use a real desktop session and a clean Windows user profile. Install this candidate and keep a closed-app backup of any data you add. CI covers both the clean first run and the separate previous-release upgrade. This desktop pass checks the clean first run and the interactive flows below.

1. Launch the installed candidate and confirm the connection screen is usable.
2. Connect to live Sleeper and open your league or draft.
3. Import a user-owned FantasyPros file through the native file picker.
4. Configure the local Codex CLI and ask one question. Check the response and its loading/error presentation.
5. Record SmartScreen and unsigned-download behavior for the downloaded candidate, including whether a warning appeared.

Do not claim Windows readiness based only on Linux packaging or CI. A real clean-profile Windows launch remains the final distribution gate.

A maintainer may explicitly authorize a beta testing candidate before manual Windows sign-off so testers can download it. Such a candidate must remain a prerelease, pass the automated gates, and state in its release notes which manual checks are pending. This exception does not apply to stable releases.

### Publish the verified commit

1. Inspect packaged contents for source maps, local paths, credentials, test data, ranking exports, and unneeded build files.
2. Scan the release commit and reachable history with Gitleaks or an equivalent dedicated scanner.
3. Review screenshots and release notes for private information and third-party attribution.
4. Confirm the package version is unused, then merge the release commit to `master`.
5. Wait for CI on the exact commit to be tagged and complete the real Windows smoke above using its `windows-candidate` artifact.
6. Create and push the matching tag, such as `v0.1.0-beta.5`, at that verified commit.
7. Confirm the tag-triggered release workflow passes and publishes the installer, portable executable, ZIP, and `SHA256SUMS.txt`.

The release workflow builds distributables with `npm run desktop:make`. It rejects tags that do not exactly match the root package version. Published binaries come from the tagged release build of that same commit. The manual smoke uses CI's pre-smoke artifact. Separate build, smoke, and publish jobs use fresh runners. Publish selects the build job's immutable artifact ID and downloads only its artifacts and hash manifest, verifies the exact set, and creates `SHA256SUMS.txt` with GitHub's dotted download names. A rerun checks every existing release asset against its new SHA-256 before uploading anything. Matching assets keep their published bytes, and missing assets can be added. Any changed asset, including `SHA256SUMS.txt`, fails publication. Rebuilt binaries can differ, so publish changed bytes under a new version and tag instead of replacing existing assets. `scripts/publish-release.ps1 -Tag <tag> -DryRun` runs the same guard without changing a release. Prerelease tags publish as GitHub prereleases. Stable tags publish as regular releases.

## Once before the first stable release

Repeat this fuller real-desktop pass only after major shell, installer, or storage changes. CI cannot prove native interaction, live-provider recovery, display behavior, or restoration of a real profile backup.

Already passed on real Windows 11 Pro. These carry forward until a major shell, installer, or storage change:

- Display scaling at 100%, 125%, and 150% and a short window; Tab/Shift+Tab containment, Escape, and opener focus restoration (beta.3, [report summary](releases/beta.3-validation-followup.md)).
- Quit during an active AI question with only app-owned processes exiting, and web-search setting persistence (beta.3).
- Backup, reset, and restore; uninstall/reinstall with the silent installer; a basic AI question (beta.2, [report summary](releases/beta.2-validation-followup.md)).
- Codex recovery guidance after correcting a CLI failure (beta.5 candidate smoke, recorded on [#57](https://github.com/itsreverence/sleeper-draft-assistant/pull/57)).
- Quit during news research with only app-owned processes exiting; native file selection, paste, and same-file reselection; keyboard demo entry and dialog focus; renderer category clear and typed full reset; the interactive installer wizard; closed-app backup restore and rollback from beta.5 to beta.4 (beta.5, [report summary](releases/beta.5-validation-followup.md)).

Still required:

- Get a successful news lookup with web search on, then open a returned citation in the default external browser. Check that unsafe destinations remain blocked. Beta.5 lookups timed out or were rejected, so this needs a build with the news-lookup fix.

No current UI path stacks two app dialogs; `modal.test.ts` covers the shared stacking behavior. Check it natively if a future flow opens a dialog from inside another.

Use [WORKFLOW.md](WORKFLOW.md) for detailed scenarios and [INSTALLING.md](INSTALLING.md) for backup and rollback steps. Record the candidate version, Windows version, and outcomes.

## Stable candidate handoff

Shared Linux verification and Windows distribution sign-off are separate. Use
[the stable-readiness report](releases/stable-readiness.md) for current evidence
and the remaining candidate checks. Keep prerelease versioning until Windows
sign-off and the final release gates pass. Re-run gates on the exact release
commit after the stable version change; older beta CI is not candidate evidence.

The first stable release may remain unsigned, as long as installation guidance
and release notes disclose that fact and SmartScreen expectations. Signing is
follow-up work, not a substitute for the Windows distribution gate.

## Release notes

State plainly:

- beta status and breaking-change risk;
- supported operating systems actually tested;
- that artifacts are unsigned and may trigger SmartScreen;
- Sleeper-only support and tokenless read-only behavior;
- requirement to supply your own rankings export;
- the local Codex requirement for the normal assistant workflow and active-draft emergency board-only recovery;
- local-data location/deletion guidance;
- known limitations and rollback instructions.
