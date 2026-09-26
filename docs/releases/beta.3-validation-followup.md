# Beta.3 validation follow-up

The supplied Windows report validates published `v0.1.0-beta.3` (`10c349e`), not later source changes. It reports successful upgrade preservation, normal lifecycle, sampled dialog/scaling checks, CSV handling, basic AI with search off, settings persistence, and shutdown during an observed active request. It is not unconditional stable-release approval.

## File-picker feedback

Confirmed in Chromium: selecting a weekly CSV then pasting replacement CSV cleared the application's parsed selection but left the native file input populated. The regression failed with the old filename still in the input. Clearing the native input when paste becomes active fixes the label without changing parser or import precedence. Browser coverage checks empty value/FileList, successful pasted import, and selecting the same file again at desktop and compact sizes.

This fix is not in the published beta.3 installer. Windows should repeat files → paste → import → reselect after a new testing build is published.

## Draft-plan changes: still unconfirmed

The report found matching plan content immediately after upgrade, but different content after interactive testing. It did not capture the action that caused the change.

Code inspection identifies an intentional writer: the successful `/drafts/:draftId/strategy` route saves the validated living plan for the selected draft/team and non-noop provider. Ordinary draft-question and Team Manager question routes do not save draft plans. Completed drafts do not automatically request strategy in the renderer. These facts narrow the investigation; they do not establish which request ran during the Windows session.

For a controlled follow-up, use an isolated profile and a closed-app backup. Compare the scoped plan before/after each action separately: Team Manager question, draft question, context switch, and strategy refresh. Correlate any content change with the same draft/team's `ai-strategy` decision-history entry. A valid strategy refresh may change the living plan; a question alone should not. Keep identifiers, text, and raw database contents local. Do not restore an open database or change persistence behavior merely to make file hashes stable.

## Remaining release evidence

- Successful packaged Windows news retrieval and opening an actual returned approved source link remain unverified; timeout and rejected-source outcomes are not retrieval passes.
- Interactive installer and full clean-profile release coverage remain subject to `RELEASING.md`; silent upgrade and Linux browser tests do not replace those gates.
- The portable browser suite covers synthetic data and selected UI/reset races, not live upstream schemas, every dialog, or exhaustive Windows process timing.

PR #33 added the portable verification baseline and passed browser, validation, Windows packaging smoke, and CodeQL checks before merging. No new release was cut for those test/documentation changes.
