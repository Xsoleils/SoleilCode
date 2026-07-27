# Security Policy

## Supported versions

SoleilCode is currently pre-1.0. Security fixes are applied to the latest release
on the `main` branch.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could expose API
tokens, execute commands unexpectedly, escape the workspace boundary, or disclose
private source code.

Instead, use GitHub's private vulnerability reporting feature:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected version, reproduction steps, impact, and any suggested fix.

Do not include real credentials in the report. Use clearly fake fixture values.

## Security boundaries

SoleilCode is designed to:

- restrict file tools to the selected project directory;
- block common secret and internal files;
- require approval for writes and command execution by default;
- keep API keys out of prompts and ordinary terminal output;
- use only local models in `private` mode.

The token vault currently uses a user-profile JSON file with restrictive file
permissions. It is not yet backed by the operating-system keychain. Device
encryption and a protected user account are recommended.
