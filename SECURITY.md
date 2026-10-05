<!--
  Copyright (c) 2026 onelpawarai. All rights reserved.
  SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-->

# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. A public issue
tells everyone about the flaw before anyone can fix it.

Report it privately through GitHub's security advisory form:

**[Report a vulnerability](https://github.com/onelpawarai-X/ZYRAXON-AI/security/advisories/new)**

Choose "Report a vulnerability" from the **Security** tab on the repository, or
follow the link above. You will get an acknowledgement within a few days.

If GitHub's advisory flow is unavailable to you, open an issue that says only
"security report available on request" with no technical detail, and we will
reach out for a private channel.

### What to include

- What the flaw allows
- The exact steps to reproduce it, or a proof of concept
- Which version or commit you tested
- Your platform and architecture

Please do not include third-party credentials, real customer data, or anything
you are not authorised to test. We will work with you to scope a safe test case
if you are unsure.

### What to expect

| Stage | Target |
|---|---|
| Acknowledgement | 3 days |
| Initial assessment and severity | 7 days |
| Fix or mitigation plan | 14 days |
| Release, for confirmed critical issues | As soon as a fix exists, no date |

We will keep you informed throughout, and we will credit you in the advisory
unless you would rather we did not.

## Supported versions

Security fixes land on the current release line. When a release is superseded,
the previous line receives fixes for a short overlap window announced in the
release notes.

| Version | Supported |
|---|---|
| 19.0.x | Yes |
| < 19.0 | No |

## Scope

### In scope

Anything that lets an attacker affect a machine running ZYRAXON, or the data on
it. In practice that means:

- Code execution through a crafted input, prompt, repository or MCP payload
- Path traversal or arbitrary file read/write outside the intended workspace
- Command injection through a shell tool, task scheduler or hook
- Credential or token exposure in logs, configuration or generated files
- Deserialisation of untrusted input
- Sandbox or permission bypass — reaching a path or capability the user did not grant
- Remote code execution in the desktop shell or its preload bridge
- OAuth token mishandling for connected MCP accounts
- The task daemon firing something other than what the user scheduled

### Out of scope

- Findings that require an attacker to already hold local administrative rights
- Denial of service through deliberate resource exhaustion
- Missing hardening headers with no demonstrated impact
- Reports against the upstream projects this engine builds on, unless the flaw
  is introduced or made reachable by ZYRAXON's own code
- Social engineering of a maintainer, and physical access to an unlocked machine
- Anything already covered by a published advisory that has not been patched

If you believe something is in scope and we disagree, say so in the thread. We
would rather argue about scope than dismiss a real problem.

## Threat model in brief

ZYRAXON is designed for a **single trusted operator on their own machine**. It
executes commands and edits files with the permissions of whoever started it.
Trust boundaries that matter:

- **Workspace scope.** File tools are meant to stay inside the project the user
  opened. Escaping it is a finding.
- **Permission prompts.** A tool that the user did not approve must not run.
  Bypassing the prompt is a finding.
- **Connected accounts.** MCP servers run code the user chose to connect. Their
  responses are treated as untrusted input, and anything that changes that is a
  finding.
- **The model is untrusted.** Content a model produces — including instructions
  that arrive inside a file or a tool result — must never be able to escalate
  privileges on its own.

The opencode provider remains available because it is a genuinely free option
and remains supported. Its presence is a provider choice, not the architecture:
the engine has no dependency on any single vendor.

## Hardening notes for operators

- Run it as a normal user, not as root or an administrator, unless you fully
  understand what the tools can reach.
- Review the permissions you grant when connecting an MCP server. A connected
  server can call any tool you have enabled.
- Treat a repository you did not write as untrusted input.
- Keep the version current; fixes land on the supported line only.

## Contact

[sayidilxs@gmail.com](mailto:sayidilxs@gmail.com) · [@ZYRAXONAI](https://www.youtube.com/@ZYRAXONAI)

---

<p align="center">
  <sub>Built by <a href="https://onelpawarai.lovable.app/">Zyraxon Labs</a> — Bangladesh, operating globally.</sub>
</p>