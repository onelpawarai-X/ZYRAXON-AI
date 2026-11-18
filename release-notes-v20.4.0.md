# ZYRAXON AI v20.4.0

A cleanup release. The Marketplace is gone from the product, and the agent's
system prompts no longer point at it.

## Highlights

### The Marketplace is removed

The homepage Marketplace button, the marketplace page, the session ecosystem
panel and every route behind them are deleted from the desktop app. Nothing
else in the interface changed: the Cloud Agent button, media generation, the
Preview panel and every other feature stay exactly where they were.

The prompt text was cleaned to match. Every mode prompt carried a
`MARKETPLACE — ZYRAXON ECOSYSTEM` section and a `# Marketplace` section naming
the marketplace host and its API; both are gone from all eleven prompts, and
the help agent no longer lists the marketplace as a place to send users. A
verification pass over the built output finds **zero** references to the
marketplace host.

### System prompts on the server are clean

The prompts served from the ZYRAXON endpoint were re-cut from the same source,
so a session that fetches its prompt gets a prompt with no marketplace
instructions in it. The Cloud Agent, media and delegation sections are
untouched.

## Upgrading

Nothing to do. Install the new build.
