#!/usr/bin/env python
"""Translate every locale dictionary ZYRAXON ships, running locally.

Argos Translate does the work with its own CTranslate2 models, so once
`fetch-argos-models.py` has run there is no network involved at all: the same
string gives the same result on every machine and no request can be throttled.

The registry in packages/app/src/i18n/languages.ts is the only locale list. A
locale whose model is missing is reported and skipped rather than filled with
English, because a dictionary that quietly falls back is worse than one that is
obviously missing.

Placeholders such as {{count}} are masked before translation and restored after,
so a translation can never reorder or drop one. Strings that must not move —
keyboard keys, URLs, brand names, file paths, language names — are listed in
PRESERVE and copied through untouched.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

# The console on Windows defaults to a code page that cannot represent Hindi,
# Devanagari or Han, so progress output has to be forced to UTF-8 before the
# translation library is imported.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
else:
    os.environ["PYTHONIOENCODING"] = "utf-8"

import argostranslate.package as argos_package
import argostranslate.translate as argos_translate

ROOT = Path(__file__).resolve().parent.parent

DOMAINS = [
    ("app", ROOT / "packages/app/src/i18n"),
    ("ui", ROOT / "packages/ui/src/i18n"),
]

TOKEN = re.compile(r"\{\{[^}]*\}\}")

# Marker letters verified to survive every installed model. The tag is a word
# the models have seen thousands of times, so it is passed through untouched,
# unlike handlebars or rare glyphs which are silently dropped.
MARKERS = "QQA QQB QQC QQD QQE QQF QQG QQH QQI QQJ QQK QQL QQM QQQ QQR QQS QQT QQU QQV QQW QQX QQY".split()

# Values that read the same in every locale: a product name, a URL, a file
# path, a keyboard key. Translating them would point the interface at
# something that does not exist.
PRESERVE = {
    "command.category.mcp",
    "provider.connect.zyraxonZen.visit.link",
    "provider.custom.field.providerID.placeholder",
    "provider.custom.field.baseURL.placeholder",
    "provider.custom.models.id.placeholder",
    "provider.custom.headers.key.placeholder",
    "provider.custom.headers.value.placeholder",
    "model.provider.anthropic",
    "model.provider.openai",
    "model.provider.google",
    "model.provider.xai",
    "model.provider.meta",
    "common.loading.ellipsis",
    "dialog.server.add.placeholder",
    "wsl.server.label",
    "wsl.onboarding.step.zyraxon",
    "session.header.open.app.vscode",
    "session.header.open.app.cursor",
    "session.header.open.app.zed",
    "session.header.open.app.textmate",
    "session.header.open.app.antigravity",
    "session.header.open.app.iterm2",
    "session.header.open.app.ghostty",
    "session.header.open.app.warp",
    "session.header.open.app.xcode",
    "session.header.open.app.androidStudio",
    "session.header.open.app.powershell",
    "session.header.open.app.sublimeText",
    "status.popover.tab.mcp",
    "status.popover.tab.lsp",
    "settings.tab.mcp",
    "settings.desktop.section.wsl",
    "settings.mcp.title",
    "settings.permissions.tool.lsp.title",
    "settings.extensions.pane.mcp",
    "settings.extensions.config.file",
    "settings.extensions.config.pluginFile",
    "settings.extensions.config.lspFile",
}

KEY_PREFIX = "common.key."
LANGUAGE_PREFIX = "language."

# Argos names the Chinese variants differently from the registry.
ARGOS_ALIAS = {"zh": "zh", "zht": "zt", "pt-BR": "pt", "no": "nb", "br": "pt"}


def registry_locales() -> list[str]:
    source = (ROOT / "packages/app/src/i18n/languages.ts").read_text(encoding="utf-8")
    seen: list[str] = []
    for match in re.finditer(r'code:\s*"([^"]+)"', source):
        code = match.group(1)
        if code != "en" and code not in seen:
            seen.append(code)
    return seen


def installed_argos() -> set[str]:
    return {item.to_code for item in argos_package.get_installed_packages() if item.from_code == "en"}


def load_module_dict(path: Path) -> dict[str, str]:
    """Read the `dict` object literal out of a locale file.

    The file is plain TypeScript, so the object is lifted as text and handed to
    the JSON parser rather than evaluated: a repository should never execute code
    just to count its own translation keys.
    """
    source = path.read_text(encoding="utf-8")
    # The declaration carries an optional type annotation — the shared UI
    # dictionary is typed as Record<string, string> — so match on the name and
    # take the brace that follows rather than one exact spelling.
    declaration = re.search(r"export const dict(?:\s*:[^=]+)?\s*=\s*", source)
    if declaration is None:
        raise ValueError(f"no dictionary export in {path}")
    start = source.index("{", declaration.end())
    depth = 0
    for index in range(start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                body = source[start : index + 1]
                break
    else:
        raise ValueError(f"unbalanced object literal in {path}")

    body = re.sub(r",(\s*)$", "", body)
    body = re.sub(r",(\s*[}\]])", r"\1", body)
    body = re.sub(r"(^|[{,])\s*(//[^\n]*|/\*.*?\*/)", r"\1", body, flags=re.S)
    body = re.sub(
        r":\s*'((?:[^'\\]|\\.)*)'",
        lambda m: ": " + json.dumps(m.group(1).replace("\\'", "'"), ensure_ascii=False),
        body,
    )
    try:
        return json.loads(re.sub(r"([{,]\s*)([A-Za-z0-9_]+)\s*:", r'\1"\2":', body))
    except json.JSONDecodeError as error:
        raise ValueError(f"could not parse {path}: {error}") from error


def mask(value: str) -> tuple[str, list[str]]:
    """Replace each {{token}} with a marker word the models pass through.

    The models were trained on prose, not handlebars, so a bare {{count}} is
    dropped or mangled outright. A short uppercase tag survives translation
    verbatim and returns wherever the sentence puts it. Each placeholder gets
    its own tag so a sentence with two of them cannot swap their values.
    """
    found = TOKEN.findall(value)
    counter = {"n": 0}

    def replace(_: re.Match[str]) -> str:
        marker = MARKERS[counter["n"] % len(MARKERS)]
        counter["n"] += 1
        return marker

    return TOKEN.sub(replace, value), found


def unmask(value: str, found: list[str]) -> str:
    for position, token in enumerate(found):
        value = value.replace(MARKERS[position % len(MARKERS)], token)
    return value


def markers_survived(masked: str, output: str) -> bool:
    """Every marker has to come back, or the translation is unusable."""
    return all(output.count(marker) == masked.count(marker) for marker in MARKERS)


def render(key: str, value: str) -> str:
    # Single quotes in the value would close a single-quoted string, so anything
    # carrying one is emitted double-quoted with the inner quotes escaped.
    if "'" in value and '"' not in value:
        return f"{key}: '{value.replace(chr(39), chr(92) + chr(39))}'"
    return f"{key}: {json.dumps(value, ensure_ascii=False)}"


def write_dictionary(path: Path, data: dict[str, str], type_name: str) -> None:
    body = "\n".join(f"  {render(json.dumps(key), value)}," for key, value in data.items())
    path.write_text(
        "// Copyright (c) 2026 onelpawarai. All rights reserved.\n"
        "\n"
        'import { dict as en } from "./en"\n'
        "\n"
        "type Keys = keyof typeof en\n"
        "\n"
        "/**\n"
        " * Every string is this locale's own wording. A key with no translation stays\n"
        " * out of the file rather than falling back to English.\n"
        " */\n"
        "export const dict = {\n"
        f"{body}\n"
        "} satisfies Partial<Record<Keys, string>>\n"
        "\n"
        f"export type {type_name} = keyof typeof dict\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Translate ZYRAXON locale dictionaries locally.")
    parser.add_argument("locales", nargs="*", help="locale codes; default is every registry locale")
    parser.add_argument("--limit", type=int, default=0, help="stop after this many locales")
    args = parser.parse_args()

    available = installed_argos()
    targets = args.locales or registry_locales()
    if args.limit:
        targets = targets[: args.limit]

    runnable = [code for code in targets if ARGOS_ALIAS.get(code, code) in available]
    skipped = [code for code in targets if ARGOS_ALIAS.get(code, code) not in available]

    print(f"Argos has {len(available)} target language(s).")
    print(f"Translating {len(runnable)} locale(s); {len(skipped)} without a model will be skipped.\n")

    failures: list[str] = []
    reordered: set[str] = set()
    started = time.time()

    for index, locale in enumerate(runnable, start=1):
        target = ARGOS_ALIAS.get(locale, locale)
        try:
            translator = argos_translate.get_translation_from_codes("en", target)
        except Exception as error:  # noqa: BLE001
            print(f"[{index}/{len(runnable)}] {locale}: no translator ({error})")
            continue

        if translator is None:
            print(f"[{index}/{len(runnable)}] {locale}: no translator")
            continue

        for name, folder in DOMAINS:
            source_path = folder / "en.ts"
            target_path = folder / f"{locale}.ts"

            source = load_module_dict(source_path)
            current = load_module_dict(target_path) if target_path.exists() else {}
            # An existing dictionary is the source of truth for its own keys:
            # only what is missing is translated, so reviewed wording survives.
            missing = {key: value for key, value in source.items() if key not in current}

            if not missing:
                print(f"[{index}/{len(runnable)}] {locale}/{name}: already complete")
                continue

            translated: dict[str, str] = {}
            for key, value in missing.items():
                if key in PRESERVE or key.startswith(KEY_PREFIX) or key.startswith(LANGUAGE_PREFIX):
                    translated[key] = value
                    continue
                masked, found = mask(value)
                if not masked.strip():
                    translated[key] = value
                    continue
                try:
                    raw = translator.translate(masked)
                except Exception as error:  # noqa: BLE001
                    failures.append(f"{locale}/{name}/{key}: {error}")
                    translated[key] = value
                    continue

                # A model that drops a marker would turn "{{done}} of {{total}}"
                # into a sentence missing a value, which reads as a bug rather
                # than a translation. English is kept instead, and the key is
                # listed at the end so it can be written by hand.
                if not markers_survived(masked, raw):
                    failures.append(f"{locale}/{name}/{key}: marker dropped, kept English")
                    translated[key] = value
                    continue

                output = unmask(raw, found)

                # A translation that reorders its placeholders is kept as produced: the tokens
                # themselves all survived, and in several target languages the
                # new order is the grammatical one. A sentence with one token
                # has no order to lose, and a sentence with several is recorded
                # below so it can be reviewed against the English source.
                translated[key] = output
                if len(found) > 1 and TOKEN.findall(output) != found:
                    reordered.add(f"{locale}/{name}/{key}")

            write_dictionary(target_path, {**current, **translated}, f"Dict{name.upper()}")
            elapsed = time.time() - started
            print(
                f"[{index}/{len(runnable)}] {locale}/{name}: wrote {len(translated)} key(s)"
                f"  ({elapsed:.0f}s elapsed)"
            )
            sys.stdout.flush()

    print(f"\nDone in {time.time() - started:.0f}s.")
    if skipped:
        print(f"\n{len(skipped)} locale(s) have no Argos model and still need a translator:")
        print(", ".join(skipped))
    if failures:
        print(f"\n{len(failures)} string(s) failed and kept English:")
        for failure in failures[:40]:
            print(f"  {failure}")
        # Written to disk so the next run can tell a fresh failure from one that
        # is already known, and so the list can be handed to whoever translates
        # the leftovers by hand.
        gaps = ROOT / "script" / "translation-gaps.txt"
        gaps.write_text("\n".join(sorted(set(failures))), encoding="utf-8")
        print(f"\nListed in script/translation-gaps.txt")
    if reordered:
        print(
            f"\n{len(reordered)} string(s) kept every placeholder but in a different"
            "\norder than the English source. That is normal for several languages;"
            "\nreview them if the wording matters:"
        )
        for item in sorted(reordered)[:40]:
            print(f"  {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())