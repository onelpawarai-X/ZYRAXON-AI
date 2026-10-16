# Bundled tools

Files here are copied into the packaged app's `resources/bin` directory.

Place an `ffmpeg` (and optional `ffprobe`) binary in this folder to ship media
normalization without the user installing anything. When a build is absent, the
server fetches a static ffmpeg into its own data directory on first use, so a
missing binary degrades gracefully instead of failing.
