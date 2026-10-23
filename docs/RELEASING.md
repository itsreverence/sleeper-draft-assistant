# Releasing

## Versioning

The project uses semantic versions with prerelease labels. The current public line is `0.1.0-beta.x`. Beta releases may contain breaking changes and are not automatically promoted to stable.

## Release gates

From a clean checkout of the intended commit:

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Then:

1. Confirm CI passes on Linux and the Windows packaged API/desktop startup smoke job succeeds. The desktop check waits for the local database and a smoke-only marker. The marker proves the renderer app mounted (`#app` has content) after the packaged page loaded. It does not verify every UI interaction.
2. Run `npm run desktop:package` on Windows.
3. Use a clean Windows user profile to verify launch, demo mode, Sleeper connection, import, settings, diagnostics, data permissions/ACL location, shutdown, relaunch, and uninstall.
4. Confirm API binding/authentication with the smoke test in `WORKFLOW.md`.
5. Inspect packaged contents for source maps, local paths, credentials, test data, ranking exports, and unneeded build files.
6. Scan the release commit and reachable history with Gitleaks or an equivalent dedicated scanner.
7. Review screenshots and release notes for private information and third-party attribution.
8. Build distributable targets with `npm run desktop:make`.
9. Confirm the package version is unused, then merge the release commit to `master`.
10. Create and push the matching tag, such as `v0.1.0-beta.1`.
11. Confirm the tag-triggered release workflow publishes the installer, portable executable, ZIP, and `SHA256SUMS.txt`. Tags with a prerelease suffix publish as GitHub prereleases; stable version tags publish as regular releases.

The release workflow rejects tags that do not exactly match the root package version. Artifacts and checksums are produced in the same GitHub-hosted Windows job from the tagged commit. Do not replace a published artifact manually without also replacing its checksum.

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

Do not claim Windows readiness based only on Linux packaging or CI. A real clean-profile Windows launch remains the final distribution gate.

A maintainer may explicitly authorize a beta testing candidate before manual Windows sign-off so testers can download it. Such a candidate must remain a prerelease, pass the automated gates, and state in its release notes which manual checks are pending. This exception does not apply to stable releases.
