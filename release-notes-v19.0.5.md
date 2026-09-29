## ZYRAXON AI v19.0.5

**One of the most capable open-source agent engines in the world — free, fully open, and it runs on your own machine.**

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

### 🌍 Our mission — help us reach 100,000 stars

ZYRAXON is an agent engine today. It is a family of companies tomorrow.

**If this project reaches 100,000 stars, we commit to the following:**

- 🧠 **Our own model** — our own weights, trained on our own infrastructure
- 🔌 **Our own provider** — zero dependency on any other company
- 🌐 **Our own ecosystem** — tools, SDK, marketplace, integrations
- 🏢 **Our own company** — built to last, owned by the people who build it

**And the commitment that matters most: free to use, now and for good.**

ZYRAXON is free to use, and it will stay free to use. The core engine, the tools, the sub-agents, the code work — all of it runs on the free tier. Nobody has to pay a rupee to install it, use it every day, or get real work out of it. We will not put the useful parts behind a paywall.

Where the subscription comes in is capacity, not access. Free plans get a generous allowance; paid plans get more of it, faster runs, deeper sub-agent parallelism and priority access to the heaviest models. That is the difference between a good plan and a bigger plan — never between working and not working.

And this is the part we care about: **every subscription funds the work toward our own model and our own provider.** Our goal is that when it arrives, it costs nobody anything to use. The people who support us today are paying for the build that gets us there.

We are not here to squeeze the people who use us. We are here to put an open AI into every hand that wants one.

### ⭐ Help us get there

⭐ **[Star ZYRAXON](https://github.com/onelpawarai-X/ZYRAXON-AI/stargazers)** and help us reach 100,000. Every star is one vote for the future described above.

---

### Technical summary

- 700+ test files across the monorepo, with CI running on every change
- Session engine, tool registry, layered permission system, MCP client
- Desktop, CLI and web interfaces
- Provider routing across the major commercial and open-weight ecosystems
- Single frozen dependency tree with the MCP server bundles vendored for offline use

### Installation

This release carries all three desktop platforms.

| Platform | File | Arch |
|:---------|:-----|:----:|
| Windows | `ZYRAXON-Dev-win-installer.exe` | x64 |
| macOS | `zyraxon-desktop-mac-arm64.dmg` | Apple Silicon |
| macOS | `zyraxon-desktop-mac-x64.dmg` | Intel |
| Linux | `zyraxon-desktop-linux-x86_64.AppImage` | x64, no install needed |
| Linux | `zyraxon-desktop-linux-amd64.deb` | Debian, Ubuntu |
| Linux | `zyraxon-desktop-linux-x86_64.rpm` | Fedora |

**macOS:** the build is not signed with an Apple Developer ID yet, so Gatekeeper stops the first launch. Right click the app and choose **Open**, then confirm. One time only.

**Linux:** the AppImage needs no install. `chmod +x` it and run it. The `deb` is for Debian and Ubuntu, the `rpm` for Fedora.

Existing Windows installs pick this build up automatically through the in-app updater.

### License

**ZSL-X** — open source. Use it, change it, share it. No commercial restrictions.

---

*For those who thought this was just another tool: it was an engine. For those who come back at 100,000 stars: a family of companies will be standing here.*
