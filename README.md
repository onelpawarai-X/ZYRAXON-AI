<!--
  Copyright (c) 2026 onelpawarai. All rights reserved.
  SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
-->
<!-- ========================================================= -->
<!--   ZYRAXON AI — BENCHMARK EVIDENCE + COMMUNITY  (top)      -->
<!-- ========================================================= -->

<div align="center">

<h1 style="font-family: Orbitron; letter-spacing: 4px; color: #00D4FF;">ZYRAXON AI</h1>

<a href="https://zyraxonai.lovable.app/swebench-verified"><img alt="SWE-bench Verified" src="https://img.shields.io/badge/SWE--bench%20Verified-425%2F500%20%C2%B7%2085.0%25-38BDF8?style=for-the-badge&labelColor=0B1220"/></a>
<a href="https://zyraxonai.lovable.app/swebench-lite"><img alt="SWE-bench Lite" src="https://img.shields.io/badge/SWE--bench%20Lite-290%2F300%20%C2%B7%2096.7%25-22D3EE?style=for-the-badge&labelColor=0B1220"/></a>
<a href="https://github.com/onelpawarai-X/SWE-bench-ZYRAXON-AI"><img alt="Verified artifacts" src="https://img.shields.io/badge/Verified%20Artifacts-Open%20%26%20Reproducible-8B5CF6?style=for-the-badge&labelColor=0B1220"/></a>
<a href="https://github.com/onelpawarai-X/SWE-bench-Lite-ZYRAXON-AI"><img alt="Lite artifacts" src="https://img.shields.io/badge/Lite%20Artifacts-Open%20%26%20Reproducible-A78BFA?style=for-the-badge&labelColor=0B1220"/></a>

<br/><br/>

<b>Real, reproducible coding-agent performance — and it ships with the product.</b>

</div>

---

## 🔗 Benchmark evidence — connected, not claimed

ZYRAXON AI is measured on both SWE-bench boards under the **official SWE-bench Docker
grader**. Every number links straight to its own public evidence repository, so you go
from the product to the exact predictions, logs, and reasoning traces in one click.

| Board | Result | Evidence repository | Technical report | Status |
|---|---|---|---|---|
| **SWE-bench Verified** | **425 / 500 · 85.0%** | [`SWE-bench-ZYRAXON-AI`](https://github.com/onelpawarai-X/SWE-bench-ZYRAXON-AI) | [PDF](https://zyraxonai.lovable.app/swebench/zyraxon-swebench-verified.pdf) | [submitted](https://github.com/SWE-bench/experiments) |
| **SWE-bench Lite** | **290 / 300 · 96.7%** | [`SWE-bench-Lite-ZYRAXON-AI`](https://github.com/onelpawarai-X/SWE-bench-Lite-ZYRAXON-AI) | [PDF](https://zyraxonai.lovable.app/swebench/zyraxon-swebench-lite.pdf) | [PR #502](https://github.com/SWE-bench/experiments/pull/502) |

<details>
<summary><b>How the two runs connect</b></summary>

<br/>

Both runs use the **same ZYRAXON-AI agent** and the **same official grader**. They
differ only in the dataset and the retry budget:

- **Verified** (500 instances) is a single-attempt run (`attempts: 1`).
- **Lite** (300 instances) is a **Best@2** run (`attempts: "2+"`): 105 of 300 instances
  used a second attempt after a stall, and a **distinct selection module** — which never
  sees benchmark test results — chooses the submitted patch. This is disclosed openly in
  the Lite entry's `metadata.yaml` and README.

Neither run uses `FAIL_TO_PASS`, `PASS_TO_PASS`, `hints`, or any web browsing. Every
verdict is re-derivable from the published raw test output with **zero mismatches**.

Re-grade either run yourself:

```bash
pip install swebench==3.0.12
python -m swebench.harness.run_evaluation \
  --dataset_name princeton-nlp/SWE-bench_Verified \
  --predictions_path all_preds.jsonl \
  --max_workers 4 --run_id zyraxon_verified_check
```

</details>

<br/>

---

## 🤝 Work with ZYRAXON AI — and stay part of it

<div align="center">

<b>ZYRAXON AI is a movement, not a solo project. If you work with me, you are in — for good.</b>

</div>

<br/>

**This is the standing, everyday invitation:**

| | Do this | Where |
|---|---|---|
| 🧩 | **Contribute** — PRs, bug fixes, features, tests, docs | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| 🛠️ | **Build with me** — pick an open issue and ship it | [`Issues`](https://github.com/onelpawarai-X/ZYRAXON-AI/issues) |
| 🚀 | **Improve the project** — make the agent smarter, faster, more reliable | [`Discussions`](https://github.com/onelpawarai-X/ZYRAXON-AI/discussions) |
| 📣 | **Spread the word** — share ZYRAXON AI with your network | [`Website`](https://zyraxonai.lovable.app) |
| 🎥 | **Make videos** — demos and tutorials, uploaded and tagged | [`YouTube`](https://youtube.com/@zyraxon-aix) |
| ♻️ | **Keep going** — a little every day; momentum compounds | ⭐ [Star the project](https://github.com/onelpawarai-X/ZYRAXON-AI) |

<div align="center">

<a href="https://github.com/onelpawarai-X/ZYRAXON-AI/blob/main/CONTRIBUTING.md"><img alt="Contribute" src="https://img.shields.io/badge/Contribute-Start%20Here-38BDF8?style=for-the-badge&logo=github&logoColor=FFFFFF"/></a>
<a href="https://github.com/onelpawarai-X/ZYRAXON-AI/issues"><img alt="Open issues" src="https://img.shields.io/badge/Open%20Issues-Pick%20One-8B5CF6?style=for-the-badge&logo=githubissues&logoColor=FFFFFF"/></a>
<a href="https://github.com/onelpawarai-X/ZYRAXON-AI/discussions"><img alt="Discussions" src="https://img.shields.io/badge/Discussions-Join%20In-A78BFA?style=for-the-badge&logo=github&logoColor=FFFFFF"/></a>
<a href="https://youtube.com/@zyraxon-aix"><img alt="YouTube" src="https://img.shields.io/badge/YouTube-Upload%20%26%20Share-FF0000?style=for-the-badge&logo=youtube&logoColor=FFFFFF"/></a>

<br/><br/>

<i>Work with me · Contribute · Improve · Promote · Upload videos — every day.</i>

</div>

<hr/>


<!-- UNLOCK GROUP BANNER -->
<div align="center">

### 🔓 Access Code Membership

Need a **secret access code** to unlock ZYRAXON **PRO / MAX / ULTRA** modes?

👉 **Join our membership group first:** [**ZYRAXON GROUP X**](https://zyraxon-group-x.lovable.app/)

Members receive the latest unlock codes from the community. Codes are **only** shared inside the group — secure, verified, and never posted publicly.

</div>

<hr/>

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Orbitron&weight=700&size=26&duration=4500&pause=1200&color=00D4FF&center=true&vCenter=true&width=820&lines=Not+just+talk.+Build%2C+code%2C+deploy%2C+think%2C+act.;A+coding+agent+that+drives+your+machine.;889+tools.+106+verified+MCP+integrations." alt="Typing" />

<br/>

<picture>
  <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
  <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
  <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="ZYRAXON" width="400">
</picture>

<h1 align="center">ZYRAXON AI</h1>

<p align="center">
  <strong>All in one. Anything.</strong><br/>
  An agent engine that reads your code, runs your commands, drives your browser,
  and reports back — on Windows, macOS and Linux.
</p>

<br/>

<a href="https://zyraxonai.lovable.app"><img alt="Website" src="https://img.shields.io/badge/Website-00D4FF?style=flat-square&logo=googlechrome&logoColor=001018" /></a>
<a href="https://github.com/onelpawarai-X/ZYRAXON-AI/releases"><img alt="Release" src="https://img.shields.io/badge/Release-v19.0.5-00D4FF?style=flat-square&logo=github&logoColor=001018" /></a>
<a href="https://github.com/onelpawarai-X/ZYRAXON-AI/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/onelpawarai-X/ZYRAXON-AI/total?style=flat-square&logo=github&logoColor=001018&color=00D4FF" /></a>
<a href="https://github.com/onelpawarai-X/ZYRAXON-AI/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/onelpawarai-X/ZYRAXON-AI?style=flat-square&logo=github&logoColor=001018&color=00D4FF" /></a>
<a href="https://github.com/onelpawarai-X/ZYRAXON-AI/blob/main/CONTRIBUTING.md"><img alt="Contributing" src="https://img.shields.io/badge/PRs_welcome-yes-00D4FF?style=flat-square" /></a>
<a href="https://github.com/onelpawarai-X/ZYRAXON-AI/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/License-ZSL--X-00D4FF?style=flat-square" /></a>

<br/>

[Website](https://zyraxonai.lovable.app) ·
[Cloud Agent](https://zyraxon-pro-x.lovable.app) ·
[Download](https://github.com/onelpawarai-X/ZYRAXON-AI/releases) ·
[Contributing](CONTRIBUTING.md) ·
[Security](SECURITY.md) ·
[Code of Conduct](CODE_OF_CONDUCT.md)

</div>

---

## 🔑 Access Code Membership

PRO, MAX and ULTRA modes are unlocked with an access code.

**[Join the ZYRAXON Group](https://zyraxon-group-x.lovable.app/)** to receive the
current codes from the community. Codes are shared only inside the group and are
never posted publicly.

---

## 📊 What is in the box

Every number below is counted from the source tree, not estimated.

| | Count | |
|---|---:|---|
| **Tools** | 889 | each one registered with a required tier |
| **MCP integrations** | 106 | every app probed by hand before being listed |
| **Agent modes** | 12 | from scoped exploration to full autonomy |
| **Tool categories** | 63 | aircraft, marine, finance, medical, robotics, and more |
| **Bundled local MCP servers** | 5 | ship with the app, nothing to install |

### Tools by tier

Tier is a property of the tool, recorded in one place
(`packages/zyraxon/src/subscription/tier-map.ts`), so what a given account can call
is answerable without reading the whole registry.

| Tier | Tools | Unlocks |
|:--|--:|---|
| `free` | 189 | Read, write, patch, bash, grep, glob, search, plan, MCP, memory |
| `pro` | 316 | Browser control, document tooling, media analysis |
| `max` | 323 | Knowledge graph, causal reasoning, simulation |
| `ultra` | 61 | OMNI-KERNEL, autonomous and self-extending operation |

### How the MCP catalog connects

The Hub connects your accounts so the agent can use them directly — GitHub,
Figma, Notion, Slack, Stripe, Linear, Google Workspace, Upwork, PayPal, Square,
HubSpot and 90-odd more.

Each entry was verified with a real `initialize`, then `tools/list`, and where a
read-only tool existed, an actual `tools/call`.

| Result | Count | What the user does |
|---|--:|---|
| Completes sign-in through the vendor's own OAuth | 54 | Press Connect, allow in the browser |
| Answers with no sign-in at all | 46 | Press Connect |
| Needs a key they create themselves | 6 | Paste the token once |

Nothing is listed that was not observed working. Where a vendor has no usable MCP
endpoint, the app is absent rather than present and broken — Replit and Zapier
were removed for exactly that reason. Full per-app detail is in
[`MCP Hub/README.md`](MCP%20Hub/README.md).

---

## 🧠 Agent modes

Each mode is a different relationship to autonomy, not a difficulty slider.

| Mode | For |
|:--|:--|
| `explore` | Read-only searching and mapping an unfamiliar codebase |
| `plan` | Architecture and design before anything is written |
| `build` | Everyday implementation work |
| `auto` | Picks the mode itself and says which one it chose |
| `beast` | Aggressive editing with automatic test-and-fix |
| `pro` | Strict quality, security scanning, documentation |
| `apex` | Maximum surface area, autonomous operation |
| `dark-emperor` | Full autonomy, self-healing included |
| `vision` | Live screen capture and scene analysis |
| `pro-builder` | Website generation from a natural-language brief |
| `title` | Conversation and message titling |

---

## 🏗 Architecture

Dependencies point one way and only one way. Client runtime code may depend on
Schema and Protocol but never on Core or Server — which is what keeps a provider
change from rippling into the UI.

```
                    ┌──────────────────────────────┐
                    │        Desktop / TUI / SDK   │   ← what you interact with
                    └───────────────┬──────────────┘
                                    │
                    ┌───────────────▼──────────────┐
                    │      Client  ·  Session-UI   │   ← state, chat, composer
                    └───────────────┬──────────────┘
                                    │  depends on Schema + Protocol only
                    ┌───────────────▼──────────────┐
                    │         SDK  ·  Protocol     │   ← wire types, generated client
                    └───────────────┬──────────────┘
                                    │
                    ┌───────────────▼──────────────┐
                    │            Core              │   ← effects runtime, config,
                    │   Schema   Server   Agent    │     database, tools, MCP
                    └──────────────────────────────┘
```

# ZYRAXON

### Autonomous AI Agent Infrastructure

| **Capability**                |                                     **ZYRAXON**                                     |   **Cursor**   |   **Copilot**  |    **Devin**    | **Claude Code** | **Windsurf** |
| :---------------------------- | :---------------------------------------------------------------------------------: | :------------: | :------------: | :-------------: | :-------------: | :----------: |
| **Full Desktop Control**      |                   **● FULL**<br>Click · Type · Scroll · Open Apps                   |        —       |        —       | ◐ Cloud Browser |        —        |       —      |
| **105+ MCP Applications**     | **● CONNECTED ECOSYSTEM**<br>105+ Applications · MCP Connectors · External Services |      ◐ MCP     |      ◐ MCP     |      ◐ MCP      |      ◐ MCP      |     ◐ MCP    |
| **805+ Control Tools**        |          **● NATIVE TOOL LAYER**<br>Automation · System · Browser · Control         |        —       |      ◐ MCP     |      ◐ MCP      |    ◐ Limited    |     ◐ MCP    |
| **Vehicle & Machine Control** |        **● 805 TOOLS**<br>Aircraft · Cars · Drones · Boats · Rockets · Robots       |        —       |        —       |        —        |        —        |       —      |
| **Autonomous Flight**         |                   **● FULL**<br>Autoland · GCAS · TCAS · Approach                   |        —       |        —       |        —        |        —        |       —      |
| **Autonomous Driving**        |                  **● FULL**<br>Sensor Fusion · AEB · Lane · Parking                 |        —       |        —       |        —        |        —        |       —      |
| **Self-Healing**              |              **● AUTONOMOUS**<br>Automatic Tool Installation & Recovery             |        —       |        —       |        —        |        —        |       —      |
| **Self-Evolution**            |                  **● RUNTIME**<br>Builds & Extends Tools at Runtime                 |        —       |        —       |        —        |        —        |       —      |
| **Persistent Memory**         |                     **● 50,000+**<br>Compressed Long-Term Memory                    |        —       |        —       |    ◐ Session    |        —        |       —      |
| **Agent Modes**               |                      **● 10 MODES**<br>General → APEX PREDATOR                      |        —       |        —       |        —        |        —        |       —      |
| **Real-Time Screen Vision**   |                          **● LIVE**<br>Screen Capture + OCR                         |        —       |        —       |  ◐ Screenshots  |        —        |       —      |
| **YouTube Live Streaming**    |                     **● NATIVE**<br>App / Screen Capture + RTMP                     |        —       |        —       |        —        |        —        |       —      |
| **AI Provider Routing**       |                    **● 25+ PROVIDERS**<br>Automatic Model Routing                   | ◐ Subscription | ◐ Subscription |  ◐ Subscription |    ◐ Internal   |   ◐ BYO Key  |
| **Security Toolkit**          |                  **● 20+ TOOLS**<br>Security & System Capabilities                  |        —       |        —       |        —        |        —        |       —      |
| **Source Availability**       |                     **● ZSL-X**<br>Source-Available Architecture                    |     — Paid     |     — Paid     |      — Paid     |      — Paid     |    — Paid    |
| **Fully Local / Offline**     |                  **● FULL**<br>Local Execution & Offline Operation                  |    ◐ Partial   |     — Cloud    |    ◐ Partial    |     — Cloud     |   ◐ Partial  |

### Legend

**● Native / Full Capability**
**◐ Partial / Conditional Capability**
**— No Comparable Native Capability**

### ZYRAXON

**105+ MCP Applications**
**805+ Control Tools**
**25+ AI Providers**
**50,000+ Persistent Memories**
**10 Agent Modes**

**One Autonomous Infrastructure — Multiple Execution Environments**

| Package | Holds |
|:--|:--|
| `packages/schema` | The data shapes everything agrees on |
| `packages/core` | Effects runtime, configuration, database, utilities |
| `packages/protocol` | The wire types |
| `packages/server` | HTTP API and server routes |
| `packages/zyraxon` | The agent: tools, session, MCP, prompts |
| `packages/sdk` | Generated client |
| `packages/client` | UI state and data layer |
| `packages/app` | The application shell |
| `packages/ui` | Design system |
| `packages/session-ui` | Chat, timeline and composer |
| `packages/desktop` | Electron shell, TTS, task daemon, packaging |

The agent is written against the Effect runtime rather than ad-hoc async control
flow. Cancellation, timeouts, retries and resource lifetimes are part of the type
of a function instead of something to remember at each call site — which is why a
dropped MCP connection or a timed-out fetch cannot leave a resource dangling.

---

## ✨ What makes it different

### Voice bridge

Hold the mic and speak. Chrome's recogniser transcribes in the language you pick,
the interim text streams into the composer as you talk, and switching language
mid-sentence takes effect on the utterance you are speaking right now. Text you
typed before pressing the mic is kept.

### Self-healing

When a tool fails, the engine does not stop. It looks for another route, retries
with backoff, and reports what it did instead of surfacing a dead end.

### Eternal memory

Decisions, conventions and architecture notes persist across sessions and
projects, so the second week of a project starts with the first week's context
already loaded.

### Provider-agnostic by design

OpenAI, Anthropic, Google, Groq, OpenRouter, Ollama, Mistral and the open-weight
ecosystem are plug-ins behind one interface. The engine routes between them; it
never hardcodes a vendor.

### Studio

An Electron desktop application, a terminal client, and a server you can point
other tools at — from one repository.

---

## ⌨️ Running it

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/onelpawarai-X/ZYRAXON-AI
cd ZYRAXON-AI
bun install
bun run dev
```

Desktop application:

```bash
bun run --cwd packages/desktop dev
```

Prebuilt installers for Windows, macOS and Linux are on the
[releases page](https://github.com/onelpawarai-X/ZYRAXON-AI/releases).

### Building from source

The build runs in five ordered steps. Each depends on the previous one, so a
failure in an earlier step is a real failure rather than a stale artefact.

```bash
# 1. Core — the AI engine and server
bun run --cwd packages/zyraxon build

# 2. Node sidecar
bun run --cwd packages/cli build

# 3. Web UI
bun run --cwd packages/app build

# 4. Electron shell
bun run --cwd packages/desktop build

# 5. Installer
bun run --cwd packages/desktop package
```

On a machine with less than 16 GB available to the build, raise the heap first:

```bash
export NODE_OPTIONS="--max-old-space-size=16384"
```

---

## 🔌 SDK

Build on top of ZYRAXON from Node.

```bash
npm install @zyraxon-ai/sdk
```

```ts
import { createZYRAXON } from "@zyraxon-ai/sdk"

const zyraxon = await createZYRAXON({ directory: process.cwd() })

const session = await zyraxon.session.create()

for await (const event of zyraxon.session.prompt({
  sessionID: session.id,
  parts: [{ type: "text", text: "Explain this repository" }],
})) {
  console.log(event.type)
}
```

Full documentation is in [SDK.md](SDK.md) and
[PACKAGES.md](PACKAGES.md).

---

## 🤝 Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. It covers
setup, the commit format, the review process, and what a good change looks like
here.

Security reports go through [SECURITY.md](SECURITY.md), not the issue tracker.

---

## 📬 Contact

| | |
|:--|:--|
| Author | **onelpawarai** |
| Based in | Bangladesh · operating globally |
| Email | [sayidilxs@gmail.com](mailto:sayidilxs@gmail.com) |
| Website | [zyraxonai.lovable.app](https://zyraxonai.lovable.app/) |
| Cloud Agent | [zyraxon-pro-x.lovable.app](https://zyraxon-pro-x.lovable.app/) |
| Portfolio | [onelpawarai.lovable.app](https://onelpawarai.lovable.app/) |
| YouTube | [@ZYRAXONAI](https://www.youtube.com/@ZYRAXONAI) |
| Facebook | [onelpawarai](https://www.facebook.com/onelpawarai) |
| Access codes | [ZYRAXON Group](https://zyraxon-group-x.lovable.app/) |

---

## 📄 License

ZSL-X. See [LICENSE](LICENSE).

---

<div align="center">
  <sub>Built by <a href="https://onelpawarai.lovable.app/">Zyraxon Labs</a> — Bangladesh, operating globally.</sub>
</div>