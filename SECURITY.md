# Security policy

## Supported versions

Sleeper Draft Assistant is pre-release alpha software. Security fixes are applied to the latest code on the default branch; older commits and local builds are not supported.

## Reporting a vulnerability

Please do **not** open a public issue for a suspected vulnerability or include credentials, private league data, imported rankings, or unredacted diagnostics in public posts.

Use GitHub's private vulnerability-reporting feature on this repository. Include:

- affected commit or release;
- operating system and installation method;
- minimal reproduction steps;
- expected and observed behavior;
- impact assessment;
- redacted logs or diagnostics, if useful.

You should receive an acknowledgement within seven days. Please allow a reasonable remediation window before public disclosure.

## Security model

The desktop application runs a loopback-only API protected by a random per-launch capability token. The token is an application boundary, not a defense against malware or another process already executing as the same operating-system user. Local files are protected with owner-only POSIX modes where supported; Windows relies on profile ACLs.

The project does not claim to secure a compromised host, malware or another process running as the same operating-system user, a compromised Codex installation, or a malicious imported file beyond documented parser limits. Filesystem symlink checks reject links observed before access but are not a race-proof boundary against same-user path replacement.
