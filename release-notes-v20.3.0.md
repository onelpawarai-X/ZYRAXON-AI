# ZYRAXON AI v20.3.0

A security and preview release. The agent's system prompts move off the
machine and onto the server, so a shipped installer no longer carries them,
and the Preview panel learns to open any file on disk and to pick up the media
an answer produces.

## Highlights

### System prompts now live on the server

Every mode prompt used to be compiled into the client. Extracting the AppImage
and decoding its bundles handed back all eleven of them in full. Prompts are
now served from a ZYRAXON endpoint and fetched per turn over HTTPS.

The binary keeps only the vault address and a reference such as
`@vault:mode:build`. A verification pass over the shipped Linux, Windows and
macOS bundles found **zero** prompt text, and the obfuscated server bundle
decoded to zero prompt phrases — while the app still boots and resolves its
prompts normally.

The endpoint is gated by tier: the free modes answer without a licence, and a
paid mode returns `403 locked` until a code unlocks that tier. A tier sent by
the caller is ignored — the server decides from the code, so a patched client
cannot promote itself.

### Preview opens files and shows media

The Preview panel now opens any file from disk, and generated or read media
lands on the panel by itself, so a chart, an image or a document an answer
produced appears where it is expected instead of only being named in text.

### The CLI bundle is obfuscated too

The desktop bundles were already obfuscated; the CLI archive is now obfuscated
in the same step, and the mode blurbs were trimmed so less of the product's
wording ships in the binary.

## Fixes

- `x_preview_key` was missing from the renderer tier map, so the preview
  capability could be reported as unavailable to a caller that held it.
- Three CI gates that failed on `main` are repaired.

## Upgrading

Nothing to do. Install the new build; prompts are fetched on first use. An
installation without network access keeps working with the modes it has already
resolved.
