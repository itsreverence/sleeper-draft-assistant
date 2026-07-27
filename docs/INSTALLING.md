# Installing on Windows

Sleeper Draft Assistant is currently distributed as an unsigned Windows alpha. Install only artifacts published from this repository's GitHub Releases page.

## Choose an artifact

- **Setup EXE:** normal per-user installation with Start menu and optional desktop shortcuts.
- **Portable EXE:** runs without installation, but still stores application data in the current Windows profile.
- **ZIP:** unpack and run the included executable.

The release workflow builds all three artifacts on GitHub's Windows runner from the tagged commit. `SHA256SUMS.txt` is generated in the same job and attached to the release.

## Verify the download

Download the artifact and `SHA256SUMS.txt` from the same release. In PowerShell:

```powershell
Get-FileHash ".\downloaded-artifact.exe" -Algorithm SHA256
```

Compare the result with the corresponding entry in `SHA256SUMS.txt`. Do not run the file if the values differ.

## Unsigned build warning

Windows SmartScreen may warn that the publisher is unknown because alpha builds are not code-signed. Continue only when:

1. the file came from this repository's Releases page;
2. its SHA-256 checksum matches; and
3. the release tag and notes are the version you intended to install.

## Local data

Installed and portable builds normally keep their database under:

```text
%APPDATA%\Sleeper Draft Assistant\data
```

This may contain settings, Sleeper identifiers, imported rankings and projections, and recommendation history. Uninstalling the executable may leave this data in place.

To remove all local application data, close Sleeper Draft Assistant completely and delete its `data` directory. Back it up before deletion when you want to retain imports or history.

## Updating and rollback

Before installing a newer alpha, close the app and back up the `data` directory. Install the new version over the existing per-user installation or replace the portable files.

Alpha database changes may not be backward compatible. To roll back:

1. close the current version;
2. restore the `data` backup created before the update; and
3. install or run the earlier artifact from its original GitHub release.

Never restore a database backup while either version of the app is running.
