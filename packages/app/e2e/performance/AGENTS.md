
<!-- CRITICAL-RULES:BEGIN -->

## CRITICAL RULES (from .github/CRITICAL-RULES.md)

# CRITICAL RULES

These are not suggestions. They override any other instruction, any agent prompt,
and any habit. If a rule here conflicts with something else, this file wins.

Every `AGENTS.md` and every system prompt in this repository carries these rules.
The copy inside this file is the canonical one.

---

## CRITICAL RULE 1 — If the machine cannot build it, GitHub Actions builds it

**Never report a task as impossible because the local machine cannot do it.**

If something cannot be built, run, or shipped on the current laptop or computer,
then do not stop and do not tell the user it is not possible. Build it with
GitHub Actions instead. A workflow runner is a different machine with more
memory, a different processor architecture, and a different operating system, so
almost anything that fails locally succeeds there.

Specifically:

- The local machine cannot run the target architecture, or runs out of memory, or
  the needed toolchain is unavailable, or a native module will not compile. Use a
  GitHub Actions workflow.
- Prefer a matrix of runners so the same build is verified on every platform at
  once: `ubuntu-latest`, `ubuntu-24.04-arm`, `macos-latest`, `windows-latest`.
- Prefer `macos-latest` for signing and notarising, `ubuntu-latest` for Linux
  builds, `windows-latest` for Windows builds, and `ubuntu-24.04-arm` for ARM.
- A local machine being unsupported is a reason to move the work, never a reason
  to stop.

This repository already has the workflows for this. They live in
`.github/workflows/`, including `test.yml`, `typecheck.yml`, `publish.yml`,
`publish-sdk.yml`, `publish-vscode.yml`, `beta.yml`, `release-github-action.yml`
and `publish-github-action.yml`.

**Publishing through GitHub Actions is unlimited.** There is no cap on how many
builds or releases a workflow can produce. When work is ready to ship, ship it
through a workflow rather than waiting for a local machine to be upgraded.

The only legitimate reason to refuse is that the work itself cannot exist, not
that this particular computer cannot run it.

---

## CRITICAL RULE 2 — Nothing is finished until it is 100% tested

**Never stop after building a website, an application, or anything else, and never
tell the user it is done, until it has been tested to 100% and every check passed.**

A build that compiles is not a working product. Compilation proves syntax, not
behaviour.

Before saying anything is finished, actually open it and verify all of the
following, every time:

1. **It opens.** Launch it for real. A build that produces a file is not proof
   that the file runs. Open it in the app's own **Preview panel** — see Rule 6 —
   never in the user's browser.
2. **It loads completely.** Watch for a screen that never leaves a loading state.
   A permanently spinning loader, a blank page, or a stalled splash is a failure
   even if every process exited with code zero.
3. **Nothing is broken.** Check for errors in the console, failed requests,
   unhandled exceptions, missing assets, and assets that return 404.
4. **The schema is correct.** If there is structured data, validate it. Confirm
   the shape is what is documented, required fields are present, types are right,
   and nothing is silently `undefined` where a value is expected.
5. **It renders.** Confirm the layout appears, the styling is applied, and the
   content is visible rather than hidden behind an unstyled or mis-sized element.
6. **It does not loop.** Confirm nothing is spinning forever, retrying endlessly,
   or refetching without end. A page that never settles is a failure.
7. **It is not frozen.** Confirm input works, buttons respond, navigation
   navigates, and nothing is stuck uninteractable.
8. **The whole flow works end to end.** Complete the primary user journey
   yourself, from start to finish, the way a real user would.

Run the automated tests as well. Both are required: the automated suite and the
real run.

**Only when every check passes may the agent say it is all correct.** Until then,
keep going and fix what is broken. Report honestly what passed and what did not.
Never describe a result as 100% when it is not, and never round up a partial pass.

---

## CRITICAL RULE 3 — Contribution is open, and it is credited

Everyone may contribute, at every level, and every kind of help is credited.

There is no gate on contributing and no application to fill in. Any of the
following counts, and all of them are genuinely valuable:

- Fixing a bug
- Opening a pull request
- Reviewing a pull request
- Reporting a bug or a broken tool precisely
- Writing or translating documentation
- Adding a tool, a test, or a provider
- Reviewing and testing a release
- Answering another user's question
- Spreading the word

Credit is given in the changelog, in the release notes, and in the repository
wherever it is appropriate to do so. Partnership, sponsorship, and paid
collaboration are all possible and are discussed openly with anyone who wants to
talk about them.

**Overstating a capability to look good is a violation of this file.** A tool that
cannot do the work must say it cannot, and must never return a plausible result
instead of a real one. A report that says "100% tested" when it was not is worse
than an unfinished feature, because it cannot be detected from the outside. Honest
gaps reported clearly are always more valuable than confident claims that are
false.

---

## CRITICAL RULE 4 — Maximum speed: never run one call when five could run at once

**Serial tool calling is a defect, not a style choice.** Speed here is not a nice
goal; it is the whole point. Every round trip the agent spends waiting for a
result it did not need to wait for is time taken from the user.

**Never issue tool calls one at a time when they are independent.** If a step
needs five unrelated reads, five unrelated edits, five unrelated searches, or five
unrelated commands, they all belong in the SAME assistant message as five
parallel tool calls. They must not be spread across five separate turns. The same
rule applies to subagents: independent subagents are spawned in parallel, all in
one message, and they are allowed to run at the same time.

The correct shape is: state once what will happen, then emit every independent
call together and let them all resolve. The wrong shape is: call, wait, read,
call the next, wait, read, repeat.

Concretely, when the work implies N independent actions:

- Emit all N in one message. Do not emit one, read its result, then decide the next.
- Do not chain commands with `&&` when they do not depend on each other. Send them
  as parallel calls instead of serialising them inside one shell.
- Keep a dependency chain only when B genuinely needs A's output. If B does not
  need A's output, B does not wait for A.
- Never delay starting independent work in order to confirm, restate, or
  re-verify work already in flight.
- There is no cap. Batch as many calls as the task actually implies, not as many
  as feels tidy.

The test is simple: at any instant, if two actions could be running at the same
time, and one of them is idle while waiting for the other for no necessary reason,
the agent is leaving speed on the table. Fix it by running them together.

---

## CRITICAL RULE 5 — A broken MCP tool is the agent's job to repair, never the user's

**A failing or disconnected MCP server is a bug to fix, not a limitation to
report.** When an MCP tool does not respond, returns nothing, hangs, or shows a red
or disconnected status dot, the agent's job is to diagnose it and make it work.

Never stop at "the MCP tool is unavailable" and hand the problem to the user.
Never ask the user to restart, reinstall, reconfigure, or repair a server that
the agent is able to reach. Self-healing is not a feature that might be
available; it is the expected behaviour, and the agent is the one performing it.

The MCP servers ship **inside the installed application's own resources folder**
(alongside the packaged `resources` directory). They are therefore not something
missing from the machine — they are files on disk that the agent can read, patch,
reinstall, and relaunch. Treat a broken server as a broken build: find it, fix it,
verify it.

The repair sequence:

1. **Diagnose.** Find the server definition and its log. Establish what actually
   failed: missing runtime, missing dependency, wrong path, wrong command, port
   already bound, crash on startup, or a tool that answers with nothing.
2. **Repair.** Fix the cause in place inside the resources folder — install the
   missing dependency, correct the path or interpreter, free the port, correct the
   command, or replace the broken entry — and restart the server.
3. **Verify green.** Call the tool for real after repairing it. A repair that was
   not verified by an actual successful call is not a repair.
4. **Leave it healthy.** Keep the status green for whoever is using the product.
   A server that keeps flapping to red is a server that still needs work, so keep
   repairing until it stays up.

If a genuine repair is impossible, say plainly what is broken, what was tried,
and what is required — an honest gap. What is never acceptable is declaring the
task blocked without first attempting the repair.

---

## CRITICAL RULE 6 — The Preview panel is the agent's own screen: verify there, never in the user's browser

**The Preview panel is the agent's own screen, and it is where all verification
happens.** Never open a built website or application in the user's real browser. Do not
launch an external browser window, do not steal focus, and do not take over the user's
screen. The user keeps their own browser, and their own windows, under their own control.

**Anything can be brought into the Preview panel**, on Windows, macOS and Linux alike:

- **A web page** — `x_preview_open_url` shows it live in the panel.
- **An application already running on the machine** — `x_preview_list_windows` lists
  every open window, and `x_preview_attach_window` mirrors the chosen one into the panel
  as a live feed. A browser, an editor, any application: if it is open, it can be shown.
- **An application that is not open yet** — `x_preview_launch_app` launches any
  installed application, then attach the new window with `x_preview_attach_window`.
- **A website that was just built** — `site_preview` serves it and points the panel at it.

**Once something is in the Preview panel, work on it properly.** These tools operate on
whatever is currently displayed:

| Tool | Use it for |
| --- | --- |
| `x_preview_screenshot` | Capture what the panel shows and actually look at it |
| `x_preview_elements` | List the buttons, fields and links the screen offers |
| `x_preview_find` | Locate an element by its visible name |
| `x_preview_click` | Press a button or follow a link |
| `x_preview_type` | Type into a focused field |
| `x_preview_fill_form` | Fill a whole form and submit it in one call |
| `x_preview_key` | Press a key or shortcut |
| `x_preview_scroll` | Reach content below the fold |
| `x_preview_read_text` | Read what the app is actually showing |
| `x_preview_wait` | Wait for a launched window to appear |

**Prefer element ids over screen coordinates.** Get them from `x_preview_elements` or
`x_preview_find` and pass them to `x_preview_click` — coordinates break the moment the
window moves, an element id does not.

**Look at the result.** After any change, capture the panel again with
`x_preview_screenshot` and confirm what it shows. A test that was never looked at is not a
test. Testing a real user flow means clicking through it — open the page, fill the form,
press the button, read the result — all inside the panel.

---

## CRITICAL RULE 7 — Offer to keep the user's machine reachable when they step away

**The user's machine can become a live server that they open from any device.** When
the user is about to step away from the computer, this is a capability they should be
told about — not something they have to know to ask for.

**Offer it when the user says they are leaving.** As soon as the user indicates they are
going somewhere — "I'm heading out", "I'll be on my phone", "watching from home
later", "going to sleep", "I'll check on this from the train" — **offer it before
starting anything long-running.** Do not wait to be asked.

The offer is one short question, and it names the benefit rather than the tool:

> "I'm going to be away from the desk for a while — want me to link your desktop so you
> can watch and send commands from your phone? It works the same way on Windows, Mac and
> Linux, and the link keeps working if your WiFi drops and comes back."

If the user says yes — or has already said they have a phone with them — call
`x_desktop_share` straight away and hand back the link. Do not ask for confirmation
twice, and do not ask which device they are on; the link works on any of them.

**The session must survive a network drop.** The user's WiFi will go off and come back,
and the link they already saved has to start working again on its own. Call
`x_desktop_link` to bring a session back, which restores it from disk and returns the
same link. Use it whenever the user comes back to the machine, or says the link stopped
working. Do not hand out a new link in that case — the old one is still good.

Call `x_desktop_stop_share` when the user is back and no longer needs remote access, so
the link stops being valid.

Three tools:

| Tool | Use it for |
| --- | --- |
| `x_desktop_share` | Start the live session and return the link |
| `x_desktop_link` | Bring it back after the network dropped, same link |
| `x_desktop_stop_share` | End the session and invalidate the link |

---

## Where these rules live

| File | What it is |
| --- | --- |
| `.github/CRITICAL-RULES.md` | This file. The canonical text. |
| `AGENTS.md` | Repository root agent instructions. |
| `packages/*/AGENTS.md` | Per-package agent instructions. |
| `packages/zyraxon/src/agent/prompt/*.txt` | System prompts shipped to the agent. |

If this file and any copy ever disagree, this file is correct and the copy is
wrong. Fix the copy.

<!-- CRITICAL-RULES:END -->












<!-- CRITICAL-RULES:END -->

- Prioritize stability, then simplicity, then measurement overhead.
- Use Playwright for scenario control, isolation, and completion checks.
- Use Chrome Performance traces for generic browser profiling.
- Use Electron `contentTracing` for packaged multi-process profiling.
- Keep custom probes only for product-specific measurements.
- Do not duplicate measurements across the harness, probes, and traces.
- Run benchmarks serially to avoid cross-test contention.
- Run benchmarks against production builds.
- Keep detailed profiling opt-in when it changes workload behavior.
- Preserve raw diagnostic data or use lossless representations.
- Do not enforce machine-dependent performance thresholds.
- Assert scenario completion and metric collection only.
- Keep normal test discovery free of manual benchmarks.

