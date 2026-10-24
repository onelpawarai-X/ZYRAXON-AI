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

### ✨ What is new in v19.0.7 — session export and import

**Your conversations are now yours to carry.**

Think about a year of working with an AI. Every question, every decision, every task you got done together — all of it lives in one place. Then one day you have to travel, and the laptop cannot come with you. But you still need that conversation.

That is no longer a problem.

Until now a conversation lived in the database of the machine that created it, so it could not leave. This release gives a session a way out and a way back in.

**Export.** Open Settings, go to the Sessions panel, and press Export on any conversation. ZYRAXON writes the whole session — the title, every message, every part, the cost and the token counts — to a single portable file named after the conversation, ending in `.zyraxon-session.json`.

**Keep it anywhere.** Google Drive, a USB stick, an email to yourself, a cloud folder, another machine. It is one JSON file, and it does not need ZYRAXON to hold it.

**Import.** On the new machine, open Settings, go to Sessions, and press Import — or simply drag the file onto the panel. ZYRAXON creates a new session and restores its entire history. The assistant remembers what you said, because the messages are restored as real messages rather than as a summary or a transcript pasted into a prompt.

**How to use it**

1. Open Settings.
2. Go to the Sessions panel.
3. Press Export next to any conversation — the file downloads.
4. Put the file somewhere safe.
5. On the other machine, press Import and choose the file, or drag it onto the panel.
6. The session comes back and opens immediately.

**What the file holds.** The session row and every durable message it owns, stored exactly as the database holds them, so an import puts the conversation back without a lossy round trip. The file is validated on the way in: anything that is not one of our bundles is refused with a plain reason instead of a stack trace. Ids are remapped on import, so references inside the conversation follow their rows and never point at messages that no longer exist.

**It works from the CLI too.** `zyraxon export <sessionID>` writes the same data as JSON to stdout, and `zyraxon import <file>` reads it back. The import command also accepts a share URL, so a session can be handed over as a link as well as a file.

**Who this is for.** People who work across more than one computer. People moving from one install to another. People who want to keep an old piece of work on the shelf. People who want to hand a conversation to someone else.

---

### ✨ v19.0.7-এ নতুন — সেশন এক্সপোর্ট ও ইমপোর্ট

**আপনার কথোপকথন এখন আপনার হাতেই।**

ভাবুন তো, এক বছর ধরে আপনি কৃত্রিম বুদ্ধিমত্তার সাথে কাজ করছেন। প্রতিদিনের কথা, প্রতিদিনের কাজ, প্রতিটি সিদ্ধান্ত — সব জমা হয়েছে এক জায়গায়। হঠাৎ আপনাকে অন্য শহরে যেতে হবে, ল্যাপটপটা সাথে নেওয়া সম্ভব নয়। কিন্তু আপনার সেই পুরো কথোপকথনটাই আপনার দরকার।

এখন আর চিন্তা নেই।

**এক্সপোর্ট।** সেটিংস খুলে সেশন তালিকায় যান, যেকোনো কথোপকথনের পাশে এক্সপোর্ট চাপুন। ZYRAXON পুরো সেশনটা — শিরোনাম, প্রতিটি বার্তা, প্রতিটি অংশ, খরচ ও টোকেনের হিসাব — একটা ফাইলে লিখে দেয়, যার নাম হয় কথোপকথনের নাম অনুযায়ী এবং শেষে থাকে `.zyraxon-session.json`।

**যেখানে খুশি রাখুন।** গুগল ড্রাইভ, পেনড্রাইভ, নিজের ইমেইলে, ক্লাউড ফোল্ডারে, অন্য কম্পিউটারে। এটা একটা সাধারণ ফাইল, ধরে রাখার জন্য ZYRAXON লাগবে না।

**ইমপোর্ট।** নতুন কম্পিউটারে গিয়ে সেটিংস খুলুন, সেশনে যান, ইমপোর্ট চাপুন — অথবা ফাইলটা সরাসরি টেনে ফেলে দিন। ZYRAXON নতুন সেশন তৈরি করে তার পুরো ইতিহাস ফিরিয়ে আনে। সহকারী আগের কথা মনে রাখে, কারণ বার্তাগুলো সত্যিকারের বার্তা হিসেবেই ফিরে আসে — শুধু সারমর্ম বা প্রম্পটে আটকানো প্রতিলিপি হিসেবে নয়।

**কীভাবে ব্যবহার করবেন**

১. সেটিংস খুলুন।
২. সেশন তালিকায় যান।
৩. যেকোনো কথোপকথনের পাশে এক্সপোর্ট চাপুন — ফাইলটি নামবে।
৪. ফাইলটি নিরাপদ কোথাও রেখে দিন।
৫. নতুন জায়গায় গিয়ে ইমপোর্ট চাপুন এবং ফাইলটি বেছে নিন, অথবা টেনে ফেলে দিন।
৬. সেশনটি সাথে সাথে ফিরে আসবে এবং খুলে যাবে।

**ফাইলে কী থাকে।** সেশনের সারি এবং তার প্রতিটি স্থায়ী বার্তা, ঠিক যেমনটা ডেটাবেজে থাকে — তাই ইমপোর্টে কথোপকথন কোনো তথ্য হারিয়ে না গিয়ে ফিরে আসে। ফাইলটা ঢোকার সময় যাচাই করা হয়: আমাদের নিজের ফরম্যাট না হলে পরিষ্কার কারণে ফিরিয়ে দেওয়া হয়, স্ট্যাক ট্রেস নয়। ইমপোর্টে আইডি নতুন করে বসানো হয়, তাই কথোপকথনের ভেতরের সব রেফারেন্স নিজের সারির পাশে চলে যায় — এমন কোনো বার্তার দিকে কখনো ইশারা করে না যা আর নেই।

**কমান্ড লাইন থেকেও চলে।** `zyraxon export <sessionID>` একই তথ্য JSON হিসেবে বের করে, আর `zyraxon import <file>` সেটা ফিরিয়ে আনে। ইমপোর্ট কমান্ড একটা শেয়ার লিংকও নিতে পারে, তাই ফাইলের পাশাপাশি লিংক দিয়েও সেশন হাতবদল করা যায়।

**কাদের জন্য।** যাঁরা একাধিক কম্পিউটারে কাজ করেন। যাঁরা এক ইনস্টল থেকে আরেক ইনস্টলে যান। যাঁরা পুরনো কাজ তাকে রাখতে চান। যাঁরা কাউকে একটা সেশন দিতে চান।

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

### Installation — desktop, every platform

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

### Command line — every platform

The CLI is built and attached for all three systems in the same release.

| Platform | File |
|:---------|:-----|
| Linux | `zyraxon-linux-x64.tar.gz`, `zyraxon-linux-arm64.tar.gz` |
| Linux (musl) | `zyraxon-linux-x64-musl.tar.gz`, `zyraxon-linux-arm64-musl.tar.gz` |
| macOS | `zyraxon-darwin-x64.zip`, `zyraxon-darwin-arm64.zip` |
| Windows | `zyraxon-windows-x64.zip`, `zyraxon-windows-arm64.zip` |

Each archive holds one flat binary named `zyraxon`. Unpack it, put it on your `PATH`, and run `zyraxon`. Every archive in this release is checked before upload to make sure it holds exactly that one file.

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
