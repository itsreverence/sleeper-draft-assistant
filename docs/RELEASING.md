# Releasing

## Versioning

The project uses semantic versions with prerelease labels. The first public line is `0.1.0-alpha.x`. Alpha releases may contain breaking changes and are not automatically promoted to stable.

## Release gates

From a clean checkout of the intended commit:

```bash
npm ci
npm run check
npm test
npm run build
npm audit
```

Then:

1. Confirm CI passes on Linux and the Windows packaging smoke job succeeds.
2. Run `npm run desktop:package` on Windows.
3. Use a clean Windows user profile to verify launch, demo mode, Sleeper connection, import, settings, diagnostics, data permissions/ACL location, shutdown, relaunch, and uninstall.
4. Confirm API binding/authentication with the smoke test in `WORKFLOW.md`.
5. Inspect packaged contents for source maps, local paths, credentials, test data, ranking exports, and unneeded build files.
6. Scan the release commit and reachable history with Gitleaks or an equivalent dedicated scanner.
7. Review screenshots and release notes for private information and third-party attribution.
8. Build distributable targets with `npm run desktop:make`.
9. Publish checksums with the artifacts.

## Release notes

State plainly:

- alpha status and breaking-change risk;
- supported operating systems actually tested;
- that artifacts are unsigned and may trigger SmartScreen;
- Sleeper-only support and tokenless read-only behavior;
- requirement to supply your own rankings export;
- deterministic default and optional local Codex dependency;
- local-data location/deletion guidance;
- known limitations and rollback instructions.

Do not claim Windows readiness based only on Linux packaging or CI. A real clean-profile Windows launch remains the final distribution gate.
