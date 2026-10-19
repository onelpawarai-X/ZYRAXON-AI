## ZYRAXON AI v19.0.7

**One of the most capable open-source agent engines in the world — fully open, and it runs on your own machine.**

We built ZYRAXON for one simple reason: we thought AI should be used to *actually get the work done*, not just to talk about it. So we built a system that writes code, runs commands, drives browsers, fixes its own mistakes, and does not stop until the job is finished.

---

### What this actually is

ZYRAXON is an **agent engine**. It is not a chatbot, and it is not an autocomplete box.

You hand it a task — *"fix this bug"*, *"build this feature"*, *"verify this data"* — and it starts working on its own. It plans, it picks the right tool for each step, it runs the step, and when something breaks it diagnoses the problem and fixes it rather than giving up.

You get the finished result.

---

### How it works

Every task is broken into small steps. For each step ZYRAXON selects the most appropriate tool from a library of hundreds, and executes it. If a step fails, it does not stop — it identifies the cause, resolves it, and runs the step again.

The larger the job, the wider it spreads the work. It can run **hundreds of sub-agents in parallel**, then verify every one of their results itself before assembling the final output. One person on your side; the work of a hundred.

---

### The tool ecosystem

Files, shell, git, databases, browser automation, email, calendars, media, screen control, device control — even vehicle, drone, marine, rocket and robotic control systems. Hundreds of tools under one roof.

If a tool is missing, ZYRAXON does not stop. It searches for it, installs it, and writes a new one when it has to. It finds MCP servers and connects them on its own — you never have to run a command. And it still works on a machine with no terminal, because it ships its own server.

---

### 🔓 The limit the agent breaks

Most agents are bound to an API. Whatever the API exposes is all they can do. ZYRAXON is not.

- **If the API cannot do it, ZYRAXON does it through the Preview panel.** Upload a video to YouTube? Place a call on WhatsApp? Post to a platform with no API at all? It opens the real application in the Preview panel and works through the interface the way a person would.
- **Every task starts in the Preview panel, then reaches for the tools behind it** — Jarvis Browser, Nuphus, Touchpoint, desktop-commander. One after another, without stopping.
- **It runs MCP Connect itself** — it connects the verified apps on its own, then finishes the job. Full automation.
- **If something is missing, it self-heals** — it downloads the tool, installs it, configures it, and finishes the task.

---

### The most important decision: depending on nobody

**ZYRAXON is provider-agnostic by design.**

OpenAI, Anthropic, Google, Groq, OpenRouter, Ollama, Mistral and the Chinese open-weight ecosystem are all plug-ins behind a single interface. The engine never hardcodes a vendor — it routes, choosing whichever one is actually working best at that moment. Price goes up, it switches. Speed matters, it switches. A service disappears, it keeps running.

**What that means in practice:** a company can quietly triple its prices and ZYRAXON does not care. Nobody can switch us off, because we do not stand behind a single door. This is not marketing — it is the direct consequence of how the architecture was built.

It is also the reason our own models, when they arrive, will drop in without breaking a single existing user.

---

### 🔐 Security and privacy

Every API key, token and password is filtered out before anything is sent to an external model. Every tool call asks for your permission first.

**Zero Distribution** — your files, your data and your keys never leave your machine. Everything runs locally.

---

### 🩹 Self-healing

ZYRAXON ships with a self-healing system. Missing tool? It finds one. Failing test? It fixes it. Code that will not run? It works on it. Every session is persisted, so a machine restart does not lose your work — the next run picks up from exactly where it stopped.

---

### What is new in v19.0.7

- **Media normalisation — any file, any model.** Large audio and video are normalised before they reach the model, so a two-hour recording or an hour of video is no longer rejected. Tested against real files.
- **MCP Hub — verified integrations on one screen.** This release adds the local Telegram server, plus app-based setup guides for Facebook Pages, Instagram, WhatsApp, YouTube, Gmail, and Google Drive/Docs/Sheets/Slides/Calendar/Chat/Search.
- **Fully offline desktop.** `ffmpeg` and `ffprobe` now ship inside the app — no network, no separate install.
- **Trustworthy builds.** Per-platform artifact verification on Linux, macOS and Windows.
- **Windows on ARM.** An ARM64 installer is now produced alongside x64 — seven assets in total.

---

### 🌍 Our mission — help us reach 100,000 stars

ZYRAXON is an agent engine today. It is a family of companies tomorrow.

**If this project reaches 100,000 stars, we commit to the following:**

- 🧠 **Our own model** — our own weights, trained on our own infrastructure
- 🔌 **Our own provider** — zero dependency on any other company
- 🌐 **Our own ecosystem** — tools, SDK, marketplace, integrations
- 🏢 **Our own company** — built to last, owned by the people who build it

**The commitment that matters: install and code work stay open, and they are not going behind a paywall.**

Let us be straight about one thing. ZYRAXON is a business, and running it costs money — models, servers, infrastructure, a team. So we will not call something "free" when it is not.

What is free, and stays free:

- Installing and running the desktop app and the CLI
- The local machine's own work: files, shell, git, databases, code
- The bundled MCP servers (Jarvis, Nuphus, Touchpoint, desktop-commander) — no key needed
- Working with local models through Ollama or open-weight weights, with no subscription

What the subscription pays for is capacity: more runs, deeper sub-agent parallelism, the heavy models, and the managed Cloud Agent. That is the difference between a bigger plan and a smaller one — an honest line, not a false promise.

**And what we want most: every subscription funds the work toward our own model and our own provider.** When that arrives, as much of it as possible will run locally. But we will not dress up what costs us money as "free". We will say the thing for what it is.

We are not here to squeeze the people who use us, and we are not here to pull them in with a fake "free". We are here to put an open AI into every hand that wants one — and to make it last for years.

### ⭐ Help us get there

⭐ **[Star ZYRAXON](https://github.com/onelpawarai-X/ZYRAXON-AI/stargazers)** and help us reach 100,000. Every star is one vote for the future described above.

---

### Technical summary

- 700+ test files across the monorepo, with CI running on every change
- Session engine, tool registry, layered permission system, MCP client
- Desktop, CLI and web interfaces
- Provider routing across the major commercial and open-weight ecosystems
- Single frozen dependency tree with the MCP server bundles vendored for offline use

### Installation — seven assets

This release carries every desktop platform.

| Platform | File | Arch |
|:---------|:-----|:----:|
| Windows | `ZYRAXON-Dev-win-x64-installer.exe` | x64 |
| Windows | `ZYRAXON-Dev-win-arm64-installer.exe` | ARM64 |
| macOS | `zyraxon-desktop-mac-arm64.dmg` | Apple Silicon |
| macOS | `zyraxon-desktop-mac-x64.dmg` | Intel |
| Linux | `zyraxon-desktop-linux-x86_64.AppImage` | x64, no install needed |
| Linux | `zyraxon-desktop-linux-amd64.deb` | Debian, Ubuntu |
| Linux | `zyraxon-desktop-linux-x86_64.rpm` | Fedora |

**Windows on ARM:** on a Surface Pro X or a Snapdragon laptop, take the `arm64` installer. The x64 build runs under emulation, but ARM64 runs at native speed.

**macOS:** the build is not signed with an Apple Developer ID yet, so Gatekeeper stops the first launch. Right click the app and choose **Open**, then confirm. One time only.

**Linux:** the AppImage needs no install. `chmod +x` it and run it. The `deb` is for Debian and Ubuntu, the `rpm` for Fedora.

Existing Windows installs pick this build up automatically through the in-app updater.

### 🔗 Links

- 🌐 **Website:** https://zyraxonai.lovable.app
- ☁️ **Cloud Agent:** https://zyraxon-pro-x.lovable.app
- ⭐ **GitHub:** https://github.com/onelpawarai-X/ZYRAXON-AI

### 🎬 Watch ZYRAXON in action

Two short films ship with this release. Both are attached to the release, in the assets list.

| Video | Language | File |
|:------|:---------|:-----|
| ZYRAXON in action | English | `ZYRAXON-VIRAL-EN.mp4` |
| ZYRAXON in action | বাংলা | `ZYRAXON-VIRAL-BN.mp4` |

1080p, 30fps, just under four minutes. Download the one you want, or both.

### License

**ZSL-X** - source-available. Use it, change it and learn from it freely. Section 5 of the license sets what may be published or sold: you may not sell ZYRAXON itself, and you may not publish a modified version of it.

---

*For those who thought this was just another tool: it was an engine. For those who come back at 100,000 stars: a family of companies will be standing here.*
