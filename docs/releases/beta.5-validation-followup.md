# Beta.5 once-before-stable validation follow-up

The maintainer's Windows report covers published `v0.1.0-beta.5` (`bb3283d`) and `v0.1.0-beta.4`. It ran on October 28, 2026, on Windows 11 Pro 26H2 (OS build 26300.9711) using computer use, with the maintainer clicking wherever automation failed. Both Setup executables matched their release's `SHA256SUMS.txt` before each run. Afterwards, the original profile was restored byte-for-byte (every file hash matched the pre-test backup), and beta.5 was left installed.

This is not stable-release sign-off. News retrieval remains blocked.

## Passed

- **Quit during news research.** While a news question showed Reviewing and a research Codex process had started, Alt+F4 ended every observed app-owned process. Pre-existing unrelated Codex processes kept their PIDs and creation times. Nothing was force-killed, and a normal relaunch worked.
- **Native files, paste, and reselection.** Two user-owned exports were chosen through the Windows picker. Pasting CSV cleared the label to "No file chosen". The pasted import succeeded, and reselecting the same file through the native picker imported again. This confirms the beta.3 file-label fix on Windows.
- **Keyboard demo and dialogs.** Demo entry worked from the keyboard. Tab/Shift+Tab stayed inside the roster dialog, Escape dismissed it, and focus returned to the opener. A native select popup over Settings closed on the first Escape. The second Escape closed Settings and restored its opener.
- **Renderer clear and full reset.** Tested on a disposable profile copy. Clearing ROS removed only ROS imports; weekly imports and history were unchanged. Typed `DELETE` then closed Settings promptly. The connection screen was usable without a restart, the username was blank, and no old context returned after a clean relaunch.
- **Interactive installer.** The beta.4 and beta.5 wizards were run four times between them. Each run showed the same four pages, in order:
  1. Installation options (current user, "Will reinstall/upgrade")
  2. Install location
  3. Installing
  4. Completion, with "Run Sleeper Draft Assistant"

  There was no license or shortcut page. Neither downgrade showed an older-version warning, and no SmartScreen or UAC prompt appeared on this machine.
- **Upgrade and rollback.** A beta.4 profile was seeded with a Sleeper connection and a 415/415-matched ROS import, then backed up while closed (B4) and upgraded to beta.5. The league, the AI-disabled setting and the import (including its original timestamp) were preserved. B4 was then restored with matching hashes and beta.4 installed over beta.5. Beta.4 launched without a compatibility error, and the B4 data was intact.
- **Restore and Codex.** After restoring the real profile and installing beta.5, the original league, settings and import categories returned. Codex answered with the command set to plain `codex`.

## Blocked: news retrieval

Web search was on. The initial question plus three retries produced no verified dated citation. The eight completed lookups ended as follows:

| Outcome | Count | Elapsed |
| --- | --- | --- |
| `timeout` | 5 | 20.0 s each |
| `no_recent_sources` | 2 | 12–13 s |
| `invalid_date` | 1 | 13.9 s |

An earlier session on the same machine recorded one more 20 s timeout and four `no_recent_sources` results at 13–18 s. Together with beta.2's 20 s timeout and longer probes that returned in time, this points to a product defect rather than bad luck:

- The 20-second research budget includes a cold `codex app-server` start.
- One undated or stale source rejects an otherwise usable result.

The fix is tracked in [#63](https://github.com/itsreverence/sleeper-draft-assistant/pull/63). Opening a returned citation in the default browser, and confirming unsafe destinations stay blocked, remain untested because no citation came back.

## Not applicable: two stacked app dialogs

No current UI path opens one app dialog over another. Each dialog traps focus, and every dialog opener lives outside the other dialogs. The shared `modal` action supports stacking: only the top layer handles Escape, and scroll stays locked until the last one closes. `apps/web/src/lib/modal.test.ts` covers this. Repeat a native check if a future flow opens a dialog from inside another.

## Automation notes

Computer use sometimes reported "coordinate input geometry is unavailable" or lost cached element state. The maintainer completed those steps by hand: closing the app and `winver`, opening Settings, the first file-picker pass, and typing the Sleeper username. Automated Alt+F4 on the main window sometimes had no visible effect, but the research-quit check above used Alt+F4 successfully. Profile backups were refused while the app was running, as intended.
